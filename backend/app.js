const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const { rateLimit } = require('express-rate-limit');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const SQLiteSessionStore = require('./session-store');

const SESSION_COOKIE = 'clubhub.sid';
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const DEFAULT_USN_PATTERN = '^2BU\\d{2}[A-Z]{2}\\d{3}$';

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function asyncRoute(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function normalizeEmail(email) {
    return email.trim().toLowerCase();
}

function isGmailAddress(email) {
    return email.toLowerCase().endsWith('@gmail.com');
}

function parseUsnPattern(value) {
    try {
        return new RegExp(value, 'i');
    } catch {
        throw new Error('USN_PATTERN must be a valid regular expression.');
    }
}

function validate(schema, input) {
    const result = schema.safeParse(input);
    if (!result.success) {
        const messages = result.error.issues.map(issue => issue.message);
        throw new HttpError(400, messages.join('. '));
    }
    return result.data;
}

function serializeStudent(row) {
    return {
        student_id: row.student_id,
        usn: row.usn,
        email: row.email,
        fname: row.fname,
        lname: row.lname,
        full_name: `${row.fname} ${row.lname}`,
        year: row.year,
        branch: row.branch,
        account_status: row.account_status,
        has_account: Boolean(row.has_account),
        created_at: row.created_at,
    };
}

function serializePublicEvent(row) {
    return {
        event_id: row.event_id,
        event_name: row.event_name,
        event_date: row.event_date,
        location: row.location,
        club_id: row.club_id,
        club_name: row.club_name,
    };
}

function createApp({ db, sessionSecret = process.env.SESSION_SECRET, usnPattern = process.env.USN_PATTERN || DEFAULT_USN_PATTERN, production = process.env.NODE_ENV === 'production' } = {}) {
    if (!db) throw new Error('A SQLite database connection is required.');
    if (production && (!sessionSecret || sessionSecret.length < 32)) {
        throw new Error('SESSION_SECRET must contain at least 32 characters in production.');
    }

    const app = express();
    const usnRegex = parseUsnPattern(usnPattern);
    const effectiveSessionSecret = sessionSecret || crypto.randomBytes(32).toString('hex');
    const sessionStore = new SQLiteSessionStore(db);

    app.disable('x-powered-by');
    if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                baseUri: ["'self'"],
                connectSrc: ["'self'"],
                fontSrc: ["'self'", 'data:'],
                formAction: ["'self'"],
                frameAncestors: ["'none'"],
                imgSrc: ["'self'", 'data:', 'https://images.unsplash.com'],
                objectSrc: ["'none'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
            },
        },
        crossOriginEmbedderPolicy: false,
        referrerPolicy: { policy: 'no-referrer' },
    }));
    app.use(express.json({ limit: '16kb' }));
    app.use(express.urlencoded({ extended: false, limit: '16kb', parameterLimit: 50 }));
    app.use(session({
        name: SESSION_COOKIE,
        secret: effectiveSessionSecret,
        store: sessionStore,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: 'strict',
            secure: production,
            maxAge: SESSION_TTL_MS,
            path: '/',
        },
    }));

    const authLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 10,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: { error: 'Too many attempts. Please wait and try again.' },
    });

    const emailSchema = z.string().trim().email('Enter a valid email address.')
        .max(254, 'Email address is too long.')
        .refine(isGmailAddress, 'Use a Gmail address.');
    const passwordSchema = z.string()
        .min(12, 'Password must be at least 12 characters.')
        .max(128, 'Password must be no more than 128 characters.')
        .refine(value => /[a-z]/.test(value), 'Password must include a lowercase letter.')
        .refine(value => /[A-Z]/.test(value), 'Password must include an uppercase letter.')
        .refine(value => /\d/.test(value), 'Password must include a number.');
    const usnSchema = z.string().trim().toUpperCase().min(1, 'USN is required.')
        .max(30, 'USN is too long.')
        .refine(value => usnRegex.test(value), 'USN does not match the configured university format.');
    const nameSchema = z.string().trim().min(1, 'This field is required.').max(60, 'Name must be 60 characters or fewer.');
    const branchSchema = z.string().trim().min(1, 'Branch is required.').max(80, 'Branch must be 80 characters or fewer.');
    const yearSchema = z.coerce.number().int().min(1).max(8);
    const registrationSchema = z.object({
        event_id: z.coerce.number().int().positive(),
        entry_fee: z.coerce.number().finite().min(0).max(100000),
    });
    const clubSchema = z.object({
        club_name: z.string().trim().min(1).max(100),
    });
    const eventSchema = z.object({
        event_name: z.string().trim().min(1).max(120),
        event_date: z.string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid event date.')
            .refine(value => {
                const [year, month, day] = value.split('-').map(Number);
                const parsed = new Date(Date.UTC(year, month - 1, day));
                return parsed.getUTCFullYear() === year
                    && parsed.getUTCMonth() === month - 1
                    && parsed.getUTCDate() === day;
            }, 'Use a valid calendar date.'),
        location: z.string().trim().min(1).max(120),
        club_id: z.coerce.number().int().positive(),
    });

    function audit(actor, action, resourceType, resourceId) {
        db.prepare(`
            INSERT INTO AUDIT_LOGS (actor_id, actor_role, action, resource_type, resource_id)
            VALUES (?, ?, ?, ?, ?)
        `).run(actor.id, actor.role, action, resourceType, resourceId == null ? null : String(resourceId));
    }

    function sessionRegenerate(req) {
        return new Promise((resolve, reject) => {
            req.session.regenerate(error => error ? reject(error) : resolve());
        });
    }

    function sessionSave(req) {
        return new Promise((resolve, reject) => {
            req.session.save(error => error ? reject(error) : resolve());
        });
    }

    function sessionDestroy(req) {
        return new Promise((resolve, reject) => {
            req.session.destroy(error => error ? reject(error) : resolve());
        });
    }

    function establishSession(req, user) {
        return sessionRegenerate(req).then(() => {
            req.session.user = user;
            req.session.csrfToken = crypto.randomBytes(32).toString('hex');
            return sessionSave(req);
        });
    }

    function requireCsrf(req, res, next) {
        const supplied = req.get('x-csrf-token') || '';
        const expected = req.session.csrfToken || '';
        const suppliedBuffer = Buffer.from(supplied);
        const expectedBuffer = Buffer.from(expected);
        if (!supplied || suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
            return next(new HttpError(403, 'Your session has expired. Refresh the page and try again.'));
        }
        next();
    }

    function requireAuth(role) {
        return asyncRoute(async (req, res, next) => {
            const user = req.session.user;
            if (!user || (role && user.role !== role)) throw new HttpError(401, 'Please sign in to continue.');

            if (user.role === 'student') {
                const student = db.prepare('SELECT account_status FROM STUDENT WHERE student_id = ? AND password_hash IS NOT NULL').get(user.id);
                if (!student || student.account_status !== 'active') {
                    await sessionDestroy(req);
                    res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'strict', secure: production, path: '/' });
                    throw new HttpError(401, 'This student account is unavailable. Please contact an administrator.');
                }
            } else {
                const admin = db.prepare('SELECT admin_id FROM ADMINS WHERE admin_id = ?').get(user.id);
                if (!admin) {
                    await sessionDestroy(req);
                    res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'strict', secure: production, path: '/' });
                    throw new HttpError(401, 'This administrator account is unavailable.');
                }
            }
            next();
        });
    }

    const requireStudent = requireAuth('student');
    const requireAdmin = requireAuth('admin');

    app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

    app.get('/api/auth/csrf', (req, res, next) => {
        if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
        req.session.save(error => {
            if (error) return next(error);
            res.set('Cache-Control', 'no-store');
            res.json({ csrfToken: req.session.csrfToken });
        });
    });

    app.get('/api/auth/me', (req, res) => {
        const user = req.session.user;
        if (!user) return res.json({ user: null });
        if (user.role === 'admin') return res.json({ user: { role: 'admin', id: user.id, email: user.email } });
        const student = db.prepare(`
            SELECT student_id, usn, email, fname, lname, year, branch
            FROM STUDENT WHERE student_id = ? AND account_status = 'active' AND password_hash IS NOT NULL
        `).get(user.id);
        if (!student) return res.json({ user: null });
        return res.json({
            user: {
                role: 'student',
                id: student.student_id,
                usn: student.usn,
                email: student.email,
                full_name: `${student.fname} ${student.lname}`,
            },
        });
    });

    app.post('/api/auth/student/register', authLimiter, requireCsrf, asyncRoute(async (req, res) => {
        const body = validate(z.object({
            usn: usnSchema,
            full_name: z.string().trim().min(2, 'Enter your full name.').max(120, 'Name must be 120 characters or fewer.'),
            email: emailSchema,
            password: passwordSchema,
            password_confirmation: z.string(),
            year: yearSchema,
            branch: branchSchema,
        }).refine(data => data.password === data.password_confirmation, {
            message: 'Passwords do not match.',
            path: ['password_confirmation'],
        }), req.body);
        const email = normalizeEmail(body.email);
        const nameParts = body.full_name.split(/\s+/);
        const fname = nameParts.shift();
        const lname = nameParts.join(' ') || fname;
        const passwordHash = await bcrypt.hash(body.password, 12);
        const result = db.prepare(`
            INSERT INTO STUDENT (fname, lname, year, branch, usn, email, password_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(fname, lname, body.year, body.branch, body.usn, email, passwordHash);
        const studentId = Number(result.lastInsertRowid);
        const user = { id: studentId, role: 'student' };
        audit(user, 'student.register', 'student', studentId);
        await establishSession(req, user);
        res.status(201).json({ user: { id: studentId, role: 'student', usn: body.usn, email, full_name: body.full_name } });
    }));

    app.post('/api/auth/student/login', authLimiter, requireCsrf, asyncRoute(async (req, res) => {
        const body = validate(z.object({
            usn: z.string().trim().min(1).max(30),
            password: z.string().min(1).max(128),
        }), req.body);
        const usn = body.usn.toUpperCase();
        const row = db.prepare(`
            SELECT student_id, usn, email, fname, lname, password_hash, account_status
            FROM STUDENT WHERE usn = ? COLLATE NOCASE
        `).get(usn);
        if (!row || !row.password_hash || row.account_status !== 'active' || !await bcrypt.compare(body.password, row.password_hash)) {
            throw new HttpError(401, 'Invalid USN or password.');
        }
        const user = { id: row.student_id, role: 'student' };
        audit(user, 'student.login', 'student', row.student_id);
        await establishSession(req, user);
        res.json({ user: { id: row.student_id, role: 'student', usn: row.usn, email: row.email, full_name: `${row.fname} ${row.lname}` } });
    }));

    app.post('/api/auth/admin/login', authLimiter, requireCsrf, asyncRoute(async (req, res) => {
        const body = validate(z.object({ email: emailSchema, password: z.string().min(1).max(128) }), req.body);
        const email = normalizeEmail(body.email);
        const admin = db.prepare('SELECT admin_id, email, password_hash FROM ADMINS WHERE email = ? COLLATE NOCASE').get(email);
        if (!admin || !await bcrypt.compare(body.password, admin.password_hash)) {
            throw new HttpError(401, 'Invalid email or password.');
        }
        const user = { id: admin.admin_id, role: 'admin', email: admin.email };
        audit(user, 'admin.login', 'admin', admin.admin_id);
        await establishSession(req, user);
        res.json({ user: { id: admin.admin_id, role: 'admin', email: admin.email } });
    }));

    app.post('/api/auth/logout', requireCsrf, asyncRoute(async (req, res) => {
        const user = req.session.user;
        if (user) audit(user, `${user.role}.logout`, user.role, user.id);
        await sessionDestroy(req);
        res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'strict', secure: production, path: '/' });
        res.status(204).end();
    }));

    const publicClubQuery = 'SELECT club_id, club_name FROM CLUB ORDER BY club_name COLLATE NOCASE';
    const publicEventsQuery = `
        SELECT e.event_id, e.event_name, e.event_date, e.location, e.club_id, c.club_name
        FROM EVENT e JOIN CLUB c ON c.club_id = e.club_id
    `;
    app.get(['/api/public/clubs', '/api/clubs'], (req, res) => {
        res.json(db.prepare(publicClubQuery).all());
    });
    app.get(['/api/public/clubs/:id', '/api/clubs/:id'], (req, res, next) => {
        const club = db.prepare('SELECT club_id, club_name FROM CLUB WHERE club_id = ?').get(req.params.id);
        if (!club) return next(new HttpError(404, 'Club not found.'));
        res.json(club);
    });
    app.get(['/api/public/events', '/api/events'], (req, res) => {
        res.json(db.prepare(`${publicEventsQuery} ORDER BY e.event_date, e.event_id`).all().map(serializePublicEvent));
    });
    app.get(['/api/public/events/:id', '/api/events/:id'], (req, res, next) => {
        const event = db.prepare(`${publicEventsQuery} WHERE e.event_id = ?`).get(req.params.id);
        if (!event) return next(new HttpError(404, 'Event not found.'));
        res.json(serializePublicEvent(event));
    });
    app.get('/api/public/config', (_req, res) => {
        res.json({ usn_pattern: usnRegex.source });
    });
    app.get('/api/public/stats', (req, res) => {
        res.json({
            students: db.prepare('SELECT COUNT(*) AS count FROM STUDENT').get().count,
            clubs: db.prepare('SELECT COUNT(*) AS count FROM CLUB').get().count,
            events: db.prepare('SELECT COUNT(*) AS count FROM EVENT').get().count,
        });
    });

    app.get('/api/student/profile', requireStudent, (req, res, next) => {
        const student = db.prepare(`
            SELECT student_id, usn, email, fname, lname, year, branch, account_status,
                (password_hash IS NOT NULL) AS has_account, created_at
            FROM STUDENT WHERE student_id = ? AND account_status = 'active'
        `).get(req.session.user.id);
        if (!student) return next(new HttpError(404, 'Student profile not found.'));
        res.json(serializeStudent(student));
    });

    app.patch('/api/student/profile', requireStudent, requireCsrf, (req, res, next) => {
        try {
            const body = validate(z.object({
                full_name: z.string().trim().min(2).max(120),
                email: emailSchema,
                year: yearSchema,
                branch: branchSchema,
            }), req.body);
            const names = body.full_name.split(/\s+/);
            const fname = names.shift();
            const lname = names.join(' ') || fname;
            db.prepare(`
                UPDATE STUDENT SET fname = ?, lname = ?, email = ?, year = ?, branch = ?, updated_at = CURRENT_TIMESTAMP
                WHERE student_id = ? AND account_status = 'active'
            `).run(fname, lname, normalizeEmail(body.email), body.year, body.branch, req.session.user.id);
            audit(req.session.user, 'student.profile.update', 'student', req.session.user.id);
            const updated = db.prepare(`
                SELECT student_id, usn, email, fname, lname, year, branch, account_status,
                    (password_hash IS NOT NULL) AS has_account, created_at
                FROM STUDENT WHERE student_id = ?
            `).get(req.session.user.id);
            res.json(serializeStudent(updated));
        } catch (error) {
            next(error);
        }
    });

    app.get('/api/student/registrations', requireStudent, (req, res) => {
        const rows = db.prepare(`
            SELECT r.reg_id, r.event_id, r.entry_fee, e.event_name, e.event_date, e.location, c.club_name
            FROM REGISTRATION r
            JOIN EVENT e ON e.event_id = r.event_id
            JOIN CLUB c ON c.club_id = e.club_id
            WHERE r.student_id = ?
            ORDER BY e.event_date DESC, r.reg_id DESC
        `).all(req.session.user.id);
        res.json(rows);
    });

    app.post('/api/student/registrations', requireStudent, requireCsrf, (req, res, next) => {
        try {
            const body = validate(registrationSchema, req.body);
            if (!db.prepare('SELECT event_id FROM EVENT WHERE event_id = ?').get(body.event_id)) {
                throw new HttpError(404, 'Event not found.');
            }
            if (db.prepare('SELECT reg_id FROM REGISTRATION WHERE student_id = ? AND event_id = ?').get(req.session.user.id, body.event_id)) {
                throw new HttpError(409, 'You are already registered for this event.');
            }
            const result = db.prepare(`
                INSERT INTO REGISTRATION (student_id, event_id, entry_fee) VALUES (?, ?, ?)
            `).run(req.session.user.id, body.event_id, body.entry_fee);
            audit(req.session.user, 'student.registration.create', 'registration', result.lastInsertRowid);
            res.status(201).json({ reg_id: Number(result.lastInsertRowid) });
        } catch (error) {
            next(error);
        }
    });

    app.delete('/api/student/registrations/:id', requireStudent, requireCsrf, (req, res, next) => {
        const result = db.prepare('DELETE FROM REGISTRATION WHERE reg_id = ? AND student_id = ?')
            .run(req.params.id, req.session.user.id);
        if (!result.changes) return next(new HttpError(404, 'Registration not found.'));
        audit(req.session.user, 'student.registration.cancel', 'registration', req.params.id);
        res.status(204).end();
    });

    app.get('/api/admin/dashboard', requireAdmin, (req, res) => {
        const count = table => db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
        const activity = db.prepare(`
            SELECT audit_id, actor_role, action, resource_type, resource_id, created_at
            FROM AUDIT_LOGS ORDER BY audit_id DESC LIMIT 10
        `).all();
        const registrationsByEvent = db.prepare(`
            SELECT e.event_name AS label, COUNT(r.reg_id) AS registrations
            FROM EVENT e LEFT JOIN REGISTRATION r ON r.event_id = e.event_id
            GROUP BY e.event_id ORDER BY registrations DESC, e.event_date LIMIT 8
        `).all();
        res.json({
            students: count('STUDENT'),
            clubs: count('CLUB'),
            events: count('EVENT'),
            registrations: count('REGISTRATION'),
            registrations_by_event: registrationsByEvent,
            recent_activity: activity,
        });
    });

    function listPage(req, table, columns, searchFields, orderBy) {
        const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
        const limit = Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 25));
        const query = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
        const conditions = query ? `WHERE (${searchFields.map(field => `${field} LIKE @query`).join(' OR ')})` : '';
        const bindings = query ? { query: `%${query.replace(/[\\%_]/g, '\\$&')}%` } : {};
        const total = db.prepare(`SELECT COUNT(*) AS count FROM ${table} ${conditions}`).get(bindings).count;
        const items = db.prepare(`
            SELECT ${columns} FROM ${table} ${conditions}
            ORDER BY ${orderBy} LIMIT @limit OFFSET @offset
        `).all({ ...bindings, limit, offset: (page - 1) * limit });
        return { items, page, limit, total };
    }

    const studentColumns = 'student_id, usn, email, fname, lname, year, branch, account_status, (password_hash IS NOT NULL) AS has_account, created_at';
    app.get('/api/admin/students', requireAdmin, (req, res) => {
        const result = listPage(req, 'STUDENT', studentColumns, ['fname', 'lname', 'usn', 'email'], 'student_id DESC');
        res.json({ ...result, items: result.items.map(serializeStudent) });
    });
    app.get('/api/admin/clubs', requireAdmin, (req, res) => {
        res.json(listPage(req, 'CLUB', 'club_id, club_name', ['club_name'], 'club_id DESC'));
    });
    app.get('/api/admin/events', requireAdmin, (req, res) => {
        const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
        const limit = Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 25));
        const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
        const clubId = Number.parseInt(req.query.club_id, 10);
        const conditions = [];
        const bindings = {};
        if (search) {
            conditions.push('(e.event_name LIKE @query OR e.location LIKE @query OR c.club_name LIKE @query)');
            bindings.query = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
        }
        if (Number.isInteger(clubId) && clubId > 0) {
            conditions.push('e.club_id = @clubId');
            bindings.clubId = clubId;
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const total = db.prepare(`
            SELECT COUNT(*) AS count FROM EVENT e JOIN CLUB c ON c.club_id = e.club_id ${where}
        `).get(bindings).count;
        const items = db.prepare(`
            ${publicEventsQuery} ${where}
            ORDER BY e.event_date DESC, e.event_id DESC LIMIT @limit OFFSET @offset
        `).all({ ...bindings, limit, offset: (page - 1) * limit }).map(serializePublicEvent);
        res.json({ items, page, limit, total });
    });
    app.get('/api/admin/registrations', requireAdmin, (req, res) => {
        const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
        const limit = Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 25));
        const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
        const where = search ? 'WHERE s.fname LIKE @query OR s.lname LIKE @query OR s.usn LIKE @query OR e.event_name LIKE @query OR c.club_name LIKE @query' : '';
        const bindings = search ? { query: `%${search.replace(/[\\%_]/g, '\\$&')}%` } : {};
        const total = db.prepare(`
            SELECT COUNT(*) AS count FROM REGISTRATION r JOIN STUDENT s ON s.student_id = r.student_id
            JOIN EVENT e ON e.event_id = r.event_id JOIN CLUB c ON c.club_id = e.club_id ${where}
        `).get(bindings).count;
        const items = db.prepare(`
            SELECT r.reg_id, r.student_id, r.event_id, r.entry_fee, s.usn, s.email,
                s.fname || ' ' || s.lname AS student_name, e.event_name, e.event_date, c.club_name
            FROM REGISTRATION r JOIN STUDENT s ON s.student_id = r.student_id
            JOIN EVENT e ON e.event_id = r.event_id JOIN CLUB c ON c.club_id = e.club_id
            ${where} ORDER BY r.reg_id DESC LIMIT @limit OFFSET @offset
        `).all({ ...bindings, limit, offset: (page - 1) * limit });
        res.json({ items, page, limit, total });
    });

    app.get('/api/admin/audit-logs', requireAdmin, (req, res) => {
        const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
        const limit = Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 25));
        const total = db.prepare('SELECT COUNT(*) AS count FROM AUDIT_LOGS').get().count;
        const items = db.prepare(`
            SELECT audit_id, actor_id, actor_role, action, resource_type, resource_id, created_at
            FROM AUDIT_LOGS ORDER BY audit_id DESC LIMIT ? OFFSET ?
        `).all(limit, (page - 1) * limit);
        res.json({ items, page, limit, total });
    });

    function adminMutation(handler) {
        return [requireAdmin, requireCsrf, (req, res, next) => {
            try {
                handler(req, res, next);
            } catch (error) {
                next(error);
            }
        }];
    }

    function createStudent(body) {
        const schema = z.object({
            fname: nameSchema,
            lname: nameSchema,
            year: yearSchema,
            branch: branchSchema,
            usn: z.union([usnSchema, z.literal('')]).optional(),
            email: z.union([emailSchema, z.literal('')]).optional(),
        });
        return validate(schema, body);
    }

    app.post('/api/admin/students', ...adminMutation((req, res) => {
        const body = validate(z.object({
            fname: nameSchema,
            lname: nameSchema,
            year: yearSchema,
            branch: branchSchema,
        }).strict(), req.body);
        const result = db.prepare(`
            INSERT INTO STUDENT (fname, lname, year, branch)
            VALUES (?, ?, ?, ?)
        `).run(body.fname, body.lname, body.year, body.branch);
        audit(req.session.user, 'admin.student.create', 'student', result.lastInsertRowid);
        res.status(201).json({ student_id: Number(result.lastInsertRowid) });
    }));
    app.patch('/api/admin/students/:id', ...adminMutation((req, res, next) => {
        const body = validate(z.object({
            fname: nameSchema,
            lname: nameSchema,
            year: yearSchema,
            branch: branchSchema,
        }).strict(), req.body);
        const result = db.prepare(`
            UPDATE STUDENT SET fname = ?, lname = ?, year = ?, branch = ?, updated_at = CURRENT_TIMESTAMP
            WHERE student_id = ?
        `).run(body.fname, body.lname, body.year, body.branch, req.params.id);
        if (!result.changes) throw new HttpError(404, 'Student not found.');
        audit(req.session.user, 'admin.student.update', 'student', req.params.id);
        res.json({ message: 'Student updated.' });
    }));
    app.patch('/api/admin/students/:id/status', ...adminMutation((req, res) => {
        const body = validate(z.object({ account_status: z.enum(['active', 'suspended']) }), req.body);
        const result = db.prepare('UPDATE STUDENT SET account_status = ?, updated_at = CURRENT_TIMESTAMP WHERE student_id = ?')
            .run(body.account_status, req.params.id);
        if (!result.changes) throw new HttpError(404, 'Student not found.');
        audit(req.session.user, `admin.student.${body.account_status}`, 'student', req.params.id);
        res.json({ message: 'Student account status updated.' });
    }));
    app.delete('/api/admin/students/:id', ...adminMutation((req, res, next) => {
        const result = db.prepare('DELETE FROM STUDENT WHERE student_id = ?').run(req.params.id);
        if (!result.changes) throw new HttpError(404, 'Student not found.');
        audit(req.session.user, 'admin.student.delete', 'student', req.params.id);
        res.status(204).end();
    }));

    app.post('/api/admin/clubs', ...adminMutation((req, res) => {
        const body = validate(clubSchema, req.body);
        const result = db.prepare('INSERT INTO CLUB (club_name) VALUES (?)').run(body.club_name);
        audit(req.session.user, 'admin.club.create', 'club', result.lastInsertRowid);
        res.status(201).json({ club_id: Number(result.lastInsertRowid) });
    }));
    app.patch('/api/admin/clubs/:id', ...adminMutation((req, res) => {
        const body = validate(clubSchema, req.body);
        const result = db.prepare('UPDATE CLUB SET club_name = ? WHERE club_id = ?').run(body.club_name, req.params.id);
        if (!result.changes) throw new HttpError(404, 'Club not found.');
        audit(req.session.user, 'admin.club.update', 'club', req.params.id);
        res.json({ message: 'Club updated.' });
    }));
    app.delete('/api/admin/clubs/:id', ...adminMutation((req, res) => {
        const eventCount = db.prepare('SELECT COUNT(*) AS count FROM EVENT WHERE club_id = ?').get(req.params.id).count;
        if (eventCount) throw new HttpError(409, 'Move or delete this club’s events before deleting the club.');
        const result = db.prepare('DELETE FROM CLUB WHERE club_id = ?').run(req.params.id);
        if (!result.changes) throw new HttpError(404, 'Club not found.');
        audit(req.session.user, 'admin.club.delete', 'club', req.params.id);
        res.status(204).end();
    }));

    app.post('/api/admin/events', ...adminMutation((req, res) => {
        const body = validate(eventSchema, req.body);
        if (!db.prepare('SELECT club_id FROM CLUB WHERE club_id = ?').get(body.club_id)) throw new HttpError(400, 'Select an existing club.');
        const result = db.prepare(`
            INSERT INTO EVENT (event_name, event_date, location, club_id) VALUES (?, ?, ?, ?)
        `).run(body.event_name, body.event_date, body.location, body.club_id);
        audit(req.session.user, 'admin.event.create', 'event', result.lastInsertRowid);
        res.status(201).json({ event_id: Number(result.lastInsertRowid) });
    }));
    app.patch('/api/admin/events/:id', ...adminMutation((req, res) => {
        const body = validate(eventSchema, req.body);
        if (!db.prepare('SELECT club_id FROM CLUB WHERE club_id = ?').get(body.club_id)) throw new HttpError(400, 'Select an existing club.');
        const result = db.prepare(`
            UPDATE EVENT SET event_name = ?, event_date = ?, location = ?, club_id = ? WHERE event_id = ?
        `).run(body.event_name, body.event_date, body.location, body.club_id, req.params.id);
        if (!result.changes) throw new HttpError(404, 'Event not found.');
        audit(req.session.user, 'admin.event.update', 'event', req.params.id);
        res.json({ message: 'Event updated.' });
    }));
    app.delete('/api/admin/events/:id', ...adminMutation((req, res) => {
        const result = db.prepare('DELETE FROM EVENT WHERE event_id = ?').run(req.params.id);
        if (!result.changes) throw new HttpError(404, 'Event not found.');
        audit(req.session.user, 'admin.event.delete', 'event', req.params.id);
        res.status(204).end();
    }));
    app.delete('/api/admin/registrations/:id', ...adminMutation((req, res) => {
        const result = db.prepare('DELETE FROM REGISTRATION WHERE reg_id = ?').run(req.params.id);
        if (!result.changes) throw new HttpError(404, 'Registration not found.');
        audit(req.session.user, 'admin.registration.delete', 'registration', req.params.id);
        res.status(204).end();
    }));

    // Compatibility routes retain old integrations without exposing private data.
    app.get('/api/students', requireAdmin, (req, res) => {
        const items = db.prepare(`SELECT ${studentColumns} FROM STUDENT ORDER BY student_id`).all();
        res.json(items.map(serializeStudent));
    });
    app.post('/api/students', ...adminMutation((req, res) => {
        const body = createStudent(req.body);
        const result = db.prepare('INSERT INTO STUDENT (fname, lname, year, branch) VALUES (?, ?, ?, ?)')
            .run(body.fname, body.lname, body.year, body.branch);
        audit(req.session.user, 'admin.student.create', 'student', result.lastInsertRowid);
        res.status(201).json({ message: 'Student added', student_id: Number(result.lastInsertRowid) });
    }));
    app.put('/api/students/:id', ...adminMutation((req, res) => {
        const body = createStudent(req.body);
        const result = db.prepare(`
            UPDATE STUDENT SET fname = ?, lname = ?, year = ?, branch = ?, updated_at = CURRENT_TIMESTAMP
            WHERE student_id = ?
        `).run(body.fname, body.lname, body.year, body.branch, req.params.id);
        if (!result.changes) throw new HttpError(404, 'Student not found.');
        audit(req.session.user, 'admin.student.update', 'student', req.params.id);
        res.json({ message: 'Student updated' });
    }));
    app.delete('/api/students/:id', ...adminMutation((req, res) => {
        const result = db.prepare('DELETE FROM STUDENT WHERE student_id = ?').run(req.params.id);
        if (!result.changes) throw new HttpError(404, 'Student not found.');
        audit(req.session.user, 'admin.student.delete', 'student', req.params.id);
        res.json({ message: 'Student deleted' });
    }));
    app.post('/api/clubs', ...adminMutation((req, res) => {
        const body = validate(clubSchema, req.body);
        const result = db.prepare('INSERT INTO CLUB (club_name) VALUES (?)').run(body.club_name);
        audit(req.session.user, 'admin.club.create', 'club', result.lastInsertRowid);
        res.status(201).json({ message: 'Club added', club_id: Number(result.lastInsertRowid) });
    }));
    app.put('/api/clubs/:id', ...adminMutation((req, res) => {
        const body = validate(clubSchema, req.body);
        const result = db.prepare('UPDATE CLUB SET club_name = ? WHERE club_id = ?').run(body.club_name, req.params.id);
        if (!result.changes) throw new HttpError(404, 'Club not found.');
        audit(req.session.user, 'admin.club.update', 'club', req.params.id);
        res.json({ message: 'Club updated' });
    }));
    app.delete('/api/clubs/:id', ...adminMutation((req, res) => {
        const eventCount = db.prepare('SELECT COUNT(*) AS count FROM EVENT WHERE club_id = ?').get(req.params.id).count;
        if (eventCount) throw new HttpError(409, 'Move or delete this club’s events before deleting the club.');
        const result = db.prepare('DELETE FROM CLUB WHERE club_id = ?').run(req.params.id);
        if (!result.changes) throw new HttpError(404, 'Club not found.');
        audit(req.session.user, 'admin.club.delete', 'club', req.params.id);
        res.json({ message: 'Club deleted' });
    }));
    app.post('/api/events', ...adminMutation((req, res) => {
        const body = validate(eventSchema, req.body);
        if (!db.prepare('SELECT club_id FROM CLUB WHERE club_id = ?').get(body.club_id)) throw new HttpError(400, 'Select an existing club.');
        const result = db.prepare('INSERT INTO EVENT (event_name, event_date, location, club_id) VALUES (?, ?, ?, ?)')
            .run(body.event_name, body.event_date, body.location, body.club_id);
        audit(req.session.user, 'admin.event.create', 'event', result.lastInsertRowid);
        res.status(201).json({ message: 'Event added', event_id: Number(result.lastInsertRowid) });
    }));
    app.put('/api/events/:id', ...adminMutation((req, res) => {
        const body = validate(eventSchema, req.body);
        if (!db.prepare('SELECT club_id FROM CLUB WHERE club_id = ?').get(body.club_id)) throw new HttpError(400, 'Select an existing club.');
        const result = db.prepare('UPDATE EVENT SET event_name = ?, event_date = ?, location = ?, club_id = ? WHERE event_id = ?')
            .run(body.event_name, body.event_date, body.location, body.club_id, req.params.id);
        if (!result.changes) throw new HttpError(404, 'Event not found.');
        audit(req.session.user, 'admin.event.update', 'event', req.params.id);
        res.json({ message: 'Event updated' });
    }));
    app.delete('/api/events/:id', ...adminMutation((req, res) => {
        const result = db.prepare('DELETE FROM EVENT WHERE event_id = ?').run(req.params.id);
        if (!result.changes) throw new HttpError(404, 'Event not found.');
        audit(req.session.user, 'admin.event.delete', 'event', req.params.id);
        res.json({ message: 'Event deleted' });
    }));
    app.get('/api/registrations', requireAdmin, (req, res) => {
        const rows = db.prepare(`
            SELECT r.reg_id, r.student_id, r.event_id, r.entry_fee, s.fname || ' ' || s.lname AS student_name,
                s.usn, s.email, e.event_name, c.club_name
            FROM REGISTRATION r JOIN STUDENT s ON s.student_id = r.student_id
            JOIN EVENT e ON e.event_id = r.event_id JOIN CLUB c ON c.club_id = e.club_id ORDER BY r.reg_id
        `).all();
        res.json(rows);
    });
    app.post('/api/registrations', ...adminMutation((req, res) => {
        const body = validate(z.object({
            student_id: z.coerce.number().int().positive(),
            ...registrationSchema.shape,
        }), req.body);
        if (!db.prepare('SELECT student_id FROM STUDENT WHERE student_id = ?').get(body.student_id)) throw new HttpError(404, 'Student not found.');
        if (!db.prepare('SELECT event_id FROM EVENT WHERE event_id = ?').get(body.event_id)) throw new HttpError(404, 'Event not found.');
        const result = db.prepare('INSERT INTO REGISTRATION (student_id, event_id, entry_fee) VALUES (?, ?, ?)')
            .run(body.student_id, body.event_id, body.entry_fee);
        audit(req.session.user, 'admin.registration.create', 'registration', result.lastInsertRowid);
        res.status(201).json({ message: 'Registration added', reg_id: Number(result.lastInsertRowid) });
    }));
    app.delete('/api/registrations/:id', ...adminMutation((req, res) => {
        const result = db.prepare('DELETE FROM REGISTRATION WHERE reg_id = ?').run(req.params.id);
        if (!result.changes) throw new HttpError(404, 'Registration not found.');
        audit(req.session.user, 'admin.registration.delete', 'registration', req.params.id);
        res.json({ message: 'Registration deleted' });
    }));
    app.get('/api/dashboard', requireAdmin, (req, res) => {
        res.json({
            students: db.prepare('SELECT COUNT(*) AS count FROM STUDENT').get().count,
            clubs: db.prepare('SELECT COUNT(*) AS count FROM CLUB').get().count,
            events: db.prepare('SELECT COUNT(*) AS count FROM EVENT').get().count,
            registrations: db.prepare('SELECT COUNT(*) AS count FROM REGISTRATION').get().count,
        });
    });
    app.post('/api/login', (_req, _res, next) => next(new HttpError(410, 'Use the administrator email sign-in endpoint.')));

    app.use('/api', (req, res, next) => next(new HttpError(404, 'API endpoint not found.')));
    app.use((error, req, res, _next) => {
        if (res.headersSent) return;
        if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
        if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE' || error?.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
            return res.status(409).json({ error: 'That USN or email is already in use.' });
        }
        if (error?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
            return res.status(409).json({ error: 'This record is linked to other campus records.' });
        }
        if (error?.name === 'ZodError') return res.status(400).json({ error: 'Check the submitted information and try again.' });
        console.error(`Unhandled API error ${req.method} ${req.path}: ${error?.code || error?.name || 'Error'}`);
        return res.status(500).json({ error: 'The request could not be completed.' });
    });

    return { app, sessionStore };
}

module.exports = { createApp, DEFAULT_USN_PATTERN };
