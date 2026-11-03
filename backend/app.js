const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const { rateLimit } = require('express-rate-limit');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const SQLiteSessionStore = require('./session-store');
const {
    ACADEMIC_YEARS,
    DEPARTMENTS,
    asLocalDateTime,
    dateTimeToEpoch,
    eventIntervalsOverlap,
    getEventLifecycleStatus,
    isValidDate,
    isValidTime,
} = require('./domain');
const { createNotification, listNotifications } = require('./notifications');
const { createRegistrationService, getConfirmedCount } = require('./registration-service');

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
        department_code: row.department_code ?? null,
        department_name: row.department_name ?? null,
        account_status: row.account_status,
        has_account: Boolean(row.has_account),
        created_at: row.created_at,
    };
}

function serializePublicEvent(row) {
    const confirmedCount = row.confirmed_count ?? 0;
    return {
        event_id: row.event_id,
        event_name: row.event_name,
        description: row.description,
        category: row.category,
        organizer: row.organizer_email || row.organizer,
        organizer_id: row.organizer_id,
        event_date: row.event_date,
        start_time: row.start_time,
        end_date: row.end_date || row.event_date,
        end_time: row.end_time,
        timezone: row.timezone,
        location: row.location,
        club_id: row.club_id,
        club_name: row.club_name,
        entry_fee: row.entry_fee,
        capacity: row.capacity,
        confirmed_count: confirmedCount,
        available_slots: Math.max(0, row.capacity - confirmedCount),
        waitlist_count: row.waitlist_count ?? 0,
        registration_opens_at: row.registration_opens_at,
        registration_closes_at: row.registration_closes_at,
        status: row.status,
        lifecycle_status: getEventLifecycleStatus(row, confirmedCount),
    };
}

function createApp({ db, sessionSecret = process.env.SESSION_SECRET, usnPattern = process.env.USN_PATTERN || DEFAULT_USN_PATTERN, production = process.env.NODE_ENV === 'production' } = {}) {
    if (!db) throw new Error('A SQLite database connection is required.');
    if (production && (!sessionSecret || sessionSecret.length < 32)) {
        throw new Error('SESSION_SECRET must contain at least 32 characters in production.');
    }

    const app = express();
    const registrationService = createRegistrationService(db);
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
    const departmentSchema = z.enum(DEPARTMENTS.map(item => item.department_code));
    const yearSchema = z.coerce.number().int().min(1).max(4);
    const registrationSchema = z.object({
        event_id: z.coerce.number().int().positive(),
        allow_conflicts: z.boolean().optional().default(false),
        entry_fee: z.coerce.number().finite().min(0).max(100000).optional(),
    });
    const clubSchema = z.object({
        club_name: z.string().trim().min(1).max(100),
    });
    const localDateTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/)
        .refine(value => isValidDate(value.slice(0, 10)) && isValidTime(value.slice(11)), 'Use a valid local date and time.');
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
        description: z.string().trim().max(5000).optional(),
        category: z.enum(['Workshop', 'Seminar', 'Cultural', 'Sports', 'Competition', 'Fest', 'Other']).optional(),
        organizer: z.string().trim().max(120).optional(),
        organizer_id: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
        end_date: z.string().optional(),
        start_time: z.string().optional(),
        end_time: z.string().optional(),
        timezone: z.string().trim().min(1).max(80).optional(),
        entry_fee: z.coerce.number().finite().min(0).max(10000000)
            .refine(value => Math.round(value * 100) === value * 100, 'Entry fee can have at most two decimal places.').optional(),
        capacity: z.coerce.number().int().min(1).max(1000000).optional(),
        registration_opens_at: localDateTimeSchema.nullable().optional(),
        registration_closes_at: localDateTimeSchema.nullable().optional(),
        status: z.enum(['draft', 'published']).optional(),
    });

    function normalizeEvent(body, existing = null) {
        const values = validate(eventSchema, body);
        const eventDate = values.event_date;
        const startTime = values.start_time ?? existing?.start_time ?? '09:00';
        const endDate = values.end_date ?? (
            existing?.end_date === existing?.event_date ? eventDate : existing?.end_date ?? eventDate
        );
        const endTime = values.end_time ?? existing?.end_time ?? '10:00';
        const timezone = values.timezone ?? existing?.timezone ?? 'Asia/Kolkata';
        const registrationOpensAt = Object.hasOwn(values, 'registration_opens_at')
            ? values.registration_opens_at
            : existing?.registration_opens_at ?? null;
        const registrationClosesAt = Object.hasOwn(values, 'registration_closes_at')
            ? values.registration_closes_at
            : existing?.registration_closes_at ?? null;
        if (!isValidDate(endDate) || !isValidTime(startTime) || !isValidTime(endTime)) {
            throw new HttpError(400, 'Enter a valid event end date and time.');
        }
        let eventStart;
        let eventEnd;
        try {
            eventStart = dateTimeToEpoch(asLocalDateTime(eventDate, startTime), timezone);
            eventEnd = dateTimeToEpoch(asLocalDateTime(endDate, endTime), timezone);
            if (registrationOpensAt) dateTimeToEpoch(registrationOpensAt, timezone);
            if (registrationClosesAt) dateTimeToEpoch(registrationClosesAt, timezone);
        } catch {
            throw new HttpError(400, 'The schedule contains a local time that is invalid for its timezone.');
        }
        if (eventEnd <= eventStart) {
            throw new HttpError(400, 'The event end must be after its start.');
        }
        if (registrationOpensAt && registrationClosesAt
            && dateTimeToEpoch(registrationOpensAt, timezone) >= dateTimeToEpoch(registrationClosesAt, timezone)) {
            throw new HttpError(400, 'Registration must close after it opens.');
        }
        const organizerId = Object.hasOwn(values, 'organizer_id') ? values.organizer_id : existing?.organizer_id ?? null;
        let organizerName = values.organizer ?? existing?.organizer ?? '';
        if (organizerId !== null) {
            const organizerAccount = db.prepare(`
                SELECT email, club_id, account_role FROM ADMINS WHERE admin_id = ?
            `).get(organizerId);
            if (!organizerAccount || organizerAccount.account_role !== 'organizer' || organizerAccount.club_id !== values.club_id) {
                throw new HttpError(400, 'Choose an event organizer assigned to the selected club.');
            }
            organizerName = organizerAccount.email;
        }
        return {
            event_name: values.event_name,
            event_date: eventDate,
            end_date: endDate,
            start_time: startTime,
            end_time: endTime,
            timezone,
            location: values.location,
            club_id: values.club_id,
            description: values.description ?? existing?.description ?? '',
            category: values.category ?? existing?.category ?? 'Other',
            organizer: organizerName,
            organizer_id: organizerId,
            entry_fee: values.entry_fee ?? existing?.entry_fee ?? 0,
            capacity: values.capacity ?? existing?.capacity ?? 100,
            registration_opens_at: registrationOpensAt,
            registration_closes_at: registrationClosesAt,
            status: values.status ?? existing?.status ?? 'published',
        };
    }

    function audit(actor, action, resourceType, resourceId, details = null) {
        db.prepare(`
            INSERT INTO AUDIT_LOGS (actor_id, actor_role, action, resource_type, resource_id, details)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(actor.id, actor.role, action, resourceType, resourceId == null ? null : String(resourceId), details);
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
                const admin = db.prepare('SELECT admin_id, account_role, club_id FROM ADMINS WHERE admin_id = ?').get(user.id);
                if (!admin || admin.account_role !== user.role) {
                    await sessionDestroy(req);
                    res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'strict', secure: production, path: '/' });
                    throw new HttpError(401, 'This administrator account is unavailable.');
                }
                user.club_id = admin.club_id;
            }
            next();
        });
    }

    const requireStudent = requireAuth('student');
    const requireAdmin = requireAuth('admin');
    const requireOrganizer = requireAuth('organizer');
    const requireEventManager = asyncRoute(async (req, res, next) => {
        const user = req.session.user;
        if (!user || !['admin', 'organizer'].includes(user.role)) throw new HttpError(401, 'Please sign in to continue.');
        return requireAuth(user.role)(req, res, next);
    });

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
        if (user.role === 'admin' || user.role === 'organizer') {
            const account = db.prepare(`
                SELECT admin_id, email, account_role, club_id FROM ADMINS WHERE admin_id = ?
            `).get(user.id);
            if (!account || account.account_role !== user.role) return res.json({ user: null });
            return res.json({
                user: {
                    role: account.account_role,
                    id: account.admin_id,
                    email: account.email,
                    club_id: account.club_id,
                },
            });
        }
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
            department_code: departmentSchema,
        }).refine(data => data.password === data.password_confirmation, {
            message: 'Passwords do not match.',
            path: ['password_confirmation'],
        }), req.body);
        const email = normalizeEmail(body.email);
        const nameParts = body.full_name.split(/\s+/);
        const fname = nameParts.shift();
        const lname = nameParts.join(' ') || fname;
        const department = DEPARTMENTS.find(item => item.department_code === body.department_code);
        const passwordHash = await bcrypt.hash(body.password, 12);
        const result = db.prepare(`
            INSERT INTO STUDENT (fname, lname, year, branch, department_code, usn, email, password_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(fname, lname, body.year, department.department_name, body.department_code, body.usn, email, passwordHash);
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
        const admin = db.prepare('SELECT admin_id, email, password_hash, account_role, club_id FROM ADMINS WHERE email = ? COLLATE NOCASE').get(email);
        if (!admin || !await bcrypt.compare(body.password, admin.password_hash)) {
            throw new HttpError(401, 'Invalid email or password.');
        }
        const user = { id: admin.admin_id, role: admin.account_role, email: admin.email, club_id: admin.club_id };
        audit(user, `${user.role}.login`, user.role, admin.admin_id);
        await establishSession(req, user);
        res.json({ user: { id: admin.admin_id, role: admin.account_role, email: admin.email, club_id: admin.club_id } });
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
        SELECT e.*, c.club_name, event_organizer.email AS organizer_email,
            (SELECT COUNT(*) FROM REGISTRATION r
             WHERE r.event_id = e.event_id AND r.status IN ('confirmed', 'promotion_pending')) AS confirmed_count,
            (SELECT COUNT(*) FROM REGISTRATION r
             WHERE r.event_id = e.event_id AND r.status = 'waitlisted') AS waitlist_count
        FROM EVENT e JOIN CLUB c ON c.club_id = e.club_id
        LEFT JOIN ADMINS event_organizer ON event_organizer.admin_id = e.organizer_id
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
        registrationService.processExpiredPromotions();
        res.json(db.prepare(`${publicEventsQuery} WHERE e.status != 'draft' ORDER BY e.event_date, e.start_time, e.event_id`).all().map(serializePublicEvent));
    });
    app.get(['/api/public/events/:id', '/api/events/:id'], (req, res, next) => {
        const event = db.prepare(`${publicEventsQuery} WHERE e.event_id = ? AND e.status != 'draft'`).get(req.params.id);
        if (!event) return next(new HttpError(404, 'Event not found.'));
        res.json(serializePublicEvent(event));
    });
    app.get('/api/public/config', (_req, res) => {
        res.json({ usn_pattern: usnRegex.source, academic_years: ACADEMIC_YEARS, departments: DEPARTMENTS });
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
            SELECT s.student_id, s.usn, s.email, s.fname, s.lname, s.year, s.branch,
                s.department_code, d.department_name, s.account_status,
                (s.password_hash IS NOT NULL) AS has_account, s.created_at
            FROM STUDENT s LEFT JOIN DEPARTMENTS d ON d.department_code = s.department_code
            WHERE s.student_id = ? AND s.account_status = 'active'
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
                department_code: departmentSchema,
            }), req.body);
            const names = body.full_name.split(/\s+/);
            const fname = names.shift();
            const lname = names.join(' ') || fname;
            const department = DEPARTMENTS.find(item => item.department_code === body.department_code);
            db.prepare(`
                UPDATE STUDENT SET fname = ?, lname = ?, email = ?, year = ?, branch = ?, department_code = ?, updated_at = CURRENT_TIMESTAMP
                WHERE student_id = ? AND account_status = 'active'
            `).run(fname, lname, normalizeEmail(body.email), body.year, department.department_name, body.department_code, req.session.user.id);
            audit(req.session.user, 'student.profile.update', 'student', req.session.user.id);
            const updated = db.prepare(`
                SELECT s.student_id, s.usn, s.email, s.fname, s.lname, s.year, s.branch,
                    s.department_code, d.department_name, s.account_status,
                    (s.password_hash IS NOT NULL) AS has_account, s.created_at
                FROM STUDENT s LEFT JOIN DEPARTMENTS d ON d.department_code = s.department_code
                WHERE s.student_id = ?
            `).get(req.session.user.id);
            res.json(serializeStudent(updated));
        } catch (error) {
            next(error);
        }
    });

    app.get('/api/student/memberships', requireStudent, (req, res) => {
        const memberships = db.prepare(`
            SELECT m.membership_id, m.club_id, c.club_name, m.designation, m.status, m.joined_at
            FROM CLUB_MEMBERSHIPS m JOIN CLUB c ON c.club_id = m.club_id
            WHERE m.student_id = ? ORDER BY m.joined_at DESC, m.membership_id DESC
        `).all(req.session.user.id);
        res.json(memberships);
    });
    app.post('/api/student/clubs/:clubId/membership', requireStudent, requireCsrf, (req, res, next) => {
        const clubId = Number(req.params.clubId);
        if (!Number.isSafeInteger(clubId) || clubId <= 0) return next(new HttpError(400, 'Choose a valid club.'));
        const club = db.prepare('SELECT club_id, club_name FROM CLUB WHERE club_id = ?').get(clubId);
        if (!club) return next(new HttpError(404, 'Club not found.'));
        try {
            const result = db.prepare(`
                INSERT INTO CLUB_MEMBERSHIPS (student_id, club_id) VALUES (?, ?)
            `).run(req.session.user.id, clubId);
            audit(req.session.user, 'student.club.join', 'club_membership', result.lastInsertRowid);
            res.status(201).json({ membership_id: Number(result.lastInsertRowid), club_id: clubId, status: 'active' });
        } catch (error) {
            if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                return next(new HttpError(409, 'You are already an active member of this club.'));
            }
            next(error);
        }
    });
    app.delete('/api/student/clubs/:clubId/membership', requireStudent, requireCsrf, (req, res, next) => {
        const clubId = Number(req.params.clubId);
        const result = db.prepare(`
            UPDATE CLUB_MEMBERSHIPS SET status = 'left', updated_at = CURRENT_TIMESTAMP
            WHERE student_id = ? AND club_id = ? AND status = 'active'
        `).run(req.session.user.id, clubId);
        if (!result.changes) return next(new HttpError(404, 'Active club membership not found.'));
        audit(req.session.user, 'student.club.leave', 'club', clubId);
        res.status(204).end();
    });

    app.get('/api/student/registrations', requireStudent, (req, res) => {
        registrationService.processExpiredPromotions();
        const rows = db.prepare(`
            SELECT r.reg_id, r.event_id, r.entry_fee, r.status, r.waitlist_position,
                r.promotion_expires_at, r.created_at, e.event_name, e.event_date, e.start_time,
                e.end_date, e.end_time, e.timezone, e.location, e.capacity, c.club_name
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
            registrationService.processExpiredPromotions();
            const result = registrationService.register({
                studentId: req.session.user.id,
                eventId: body.event_id,
                allowConflicts: body.allow_conflicts,
            });
            if (result.conflict) {
                return res.status(409).json({
                    error: 'This event overlaps with another event you are registered for.',
                    code: 'SCHEDULE_CONFLICT',
                    conflicts: result.conflicts,
                });
            }
            audit(req.session.user, 'student.registration.create', 'registration', result.registrationId, JSON.stringify({
                status: result.status,
                waitlist_position: result.position,
            }));
            res.status(201).json({
                reg_id: result.registrationId,
                status: result.status,
                waitlist_position: result.position,
            });
        } catch (error) {
            next(error);
        }
    });

    app.delete('/api/student/registrations/:id', requireStudent, requireCsrf, (req, res, next) => {
        try {
            registrationService.cancel({
                studentId: req.session.user.id,
                registrationId: Number(req.params.id),
                actor: req.session.user,
            });
            res.status(204).end();
        } catch (error) {
            next(error);
        }
    });

    app.post('/api/student/registrations/:id/confirm', requireStudent, requireCsrf, (req, res, next) => {
        try {
            registrationService.processExpiredPromotions();
            const registration = registrationService.confirmPromotion({
                studentId: req.session.user.id,
                registrationId: Number(req.params.id),
            });
            audit(req.session.user, 'student.registration.promotion.confirm', 'registration', registration.reg_id);
            res.json({ status: 'confirmed' });
        } catch (error) {
            next(error);
        }
    });

    app.get('/api/admin/dashboard', requireAdmin, (req, res) => {
        const count = table => db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
        const activity = db.prepare(`
            SELECT audit_id, actor_role, action, resource_type, resource_id, created_at
            FROM AUDIT_LOGS ORDER BY audit_id DESC LIMIT 10
        `).all();
        const registrationsByEvent = db.prepare(`
            SELECT e.event_name AS label, COUNT(r.reg_id) AS registrations
            FROM EVENT e LEFT JOIN REGISTRATION r
              ON r.event_id = e.event_id AND r.status IN ('confirmed', 'promotion_pending')
            GROUP BY e.event_id ORDER BY registrations DESC, e.event_date LIMIT 8
        `).all();
        const studentsByDepartment = db.prepare(`
            SELECT COALESCE(d.department_name, 'Unspecified (legacy)') AS label, COUNT(*) AS students
            FROM STUDENT s LEFT JOIN DEPARTMENTS d ON d.department_code = s.department_code
            GROUP BY s.department_code ORDER BY students DESC, label
        `).all();
        const studentsByYear = db.prepare(`
            SELECT year, COUNT(*) AS students FROM STUDENT GROUP BY year ORDER BY year
        `).all();
        const eventCounts = db.prepare(`
            SELECT status, COUNT(*) AS count FROM EVENT GROUP BY status ORDER BY status
        `).all();
        const waitlistStats = db.prepare(`
            SELECT COUNT(*) AS waitlisted FROM REGISTRATION WHERE status = 'waitlisted'
        `).get();
        const conflictCount = db.prepare(`
            SELECT COUNT(*) AS count FROM SCHEDULE_CONFLICTS WHERE decision != 'resolved'
        `).get().count;
        const clubMemberships = db.prepare(`
            SELECT c.club_name AS label, COUNT(m.membership_id) AS members
            FROM CLUB c LEFT JOIN CLUB_MEMBERSHIPS m
              ON m.club_id = c.club_id AND m.status = 'active'
            GROUP BY c.club_id ORDER BY members DESC, c.club_name
        `).all();
        const activeMembershipCount = db.prepare(`
            SELECT COUNT(*) AS count FROM CLUB_MEMBERSHIPS WHERE status = 'active'
        `).get().count;
        const studentsWithoutMembership = db.prepare(`
            SELECT COUNT(*) AS count FROM STUDENT s
            WHERE NOT EXISTS (
                SELECT 1 FROM CLUB_MEMBERSHIPS m
                WHERE m.student_id = s.student_id AND m.status = 'active'
            )
        `).get().count;
        res.json({
            students: count('STUDENT'),
            clubs: count('CLUB'),
            events: count('EVENT'),
            registrations: count('REGISTRATION'),
            registrations_by_event: registrationsByEvent,
            recent_activity: activity,
            students_by_department: studentsByDepartment,
            students_by_year: studentsByYear,
            event_counts: eventCounts,
            waitlisted: waitlistStats.waitlisted,
            scheduling_conflicts: conflictCount,
            active_club_memberships: activeMembershipCount,
            students_without_membership: studentsWithoutMembership,
            club_memberships_by_club: clubMemberships,
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

    const studentColumns = 's.student_id, s.usn, s.email, s.fname, s.lname, s.year, s.branch, s.department_code, d.department_name, s.account_status, (s.password_hash IS NOT NULL) AS has_account, s.created_at';
    app.get('/api/admin/students', requireAdmin, (req, res) => {
        const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
        const limit = Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 25));
        const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
        const departmentCode = typeof req.query.department_code === 'string' ? req.query.department_code : '';
        const year = Number.parseInt(req.query.year, 10);
        const membership = typeof req.query.membership === 'string' ? req.query.membership : '';
        const conditions = [];
        const bindings = {};
        if (search) {
            conditions.push('(s.fname LIKE @query OR s.lname LIKE @query OR s.usn LIKE @query OR s.email LIKE @query)');
            bindings.query = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
        }
        if (departmentCode) {
            if (!DEPARTMENTS.some(item => item.department_code === departmentCode)) throw new HttpError(400, 'Choose a valid department filter.');
            conditions.push('s.department_code = @departmentCode');
            bindings.departmentCode = departmentCode;
        }
        if (req.query.year !== undefined) {
            if (!ACADEMIC_YEARS.includes(year)) throw new HttpError(400, 'Choose a valid academic year filter.');
            conditions.push('s.year = @year');
            bindings.year = year;
        }
        if (membership === 'active') {
            conditions.push(`EXISTS (
                SELECT 1 FROM CLUB_MEMBERSHIPS m
                WHERE m.student_id = s.student_id AND m.status = 'active'
            )`);
        } else if (membership === 'none') {
            conditions.push(`NOT EXISTS (
                SELECT 1 FROM CLUB_MEMBERSHIPS m
                WHERE m.student_id = s.student_id AND m.status = 'active'
            )`);
        } else if (membership) {
            throw new HttpError(400, 'Choose a valid membership filter.');
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const total = db.prepare(`
            SELECT COUNT(*) AS count FROM STUDENT s ${where}
        `).get(bindings).count;
        const items = db.prepare(`
            SELECT ${studentColumns} FROM STUDENT s
            LEFT JOIN DEPARTMENTS d ON d.department_code = s.department_code
            ${where} ORDER BY s.student_id DESC LIMIT @limit OFFSET @offset
        `).all({ ...bindings, limit, offset: (page - 1) * limit });
        const result = { items, page, limit, total };
        res.json({ ...result, items: result.items.map(serializeStudent) });
    });
    app.get('/api/admin/students/:id', requireAdmin, (req, res, next) => {
        const student = db.prepare(`
            SELECT ${studentColumns} FROM STUDENT s
            LEFT JOIN DEPARTMENTS d ON d.department_code = s.department_code
            WHERE s.student_id = ?
        `).get(req.params.id);
        if (!student) return next(new HttpError(404, 'Student not found.'));
        const registrations = db.prepare(`
            SELECT r.reg_id, r.event_id, r.entry_fee, r.status, r.waitlist_position,
                r.created_at AS registered_at, r.promotion_expires_at,
                e.event_name, e.event_date, e.start_time, e.end_date, e.end_time, e.location, c.club_name
            FROM REGISTRATION r
            JOIN EVENT e ON e.event_id = r.event_id
            JOIN CLUB c ON c.club_id = e.club_id
            WHERE r.student_id = ?
            ORDER BY r.created_at DESC, r.reg_id DESC
        `).all(req.params.id);
        const memberships = db.prepare(`
            SELECT m.membership_id, m.club_id, c.club_name, m.designation, m.status, m.joined_at, m.updated_at
            FROM CLUB_MEMBERSHIPS m JOIN CLUB c ON c.club_id = m.club_id
            WHERE m.student_id = ? ORDER BY m.joined_at DESC, m.membership_id DESC
        `).all(req.params.id);
        const waitlistHistory = db.prepare(`
            SELECT h.action, h.position, h.created_at, e.event_name, h.event_id
            FROM WAITLIST_HISTORY h JOIN EVENT e ON e.event_id = h.event_id
            WHERE h.student_id = ? ORDER BY h.history_id DESC
        `).all(req.params.id);
        const auditActivity = db.prepare(`
            SELECT action AS type, created_at, resource_type, resource_id, details
            FROM AUDIT_LOGS
            WHERE (resource_type = 'student' AND resource_id = ?)
               OR (resource_type = 'registration' AND resource_id IN (
                   SELECT CAST(reg_id AS TEXT) FROM REGISTRATION WHERE student_id = ?
               ))
            ORDER BY audit_id DESC LIMIT 100
        `).all(String(req.params.id), req.params.id);
        const activity = [
            { type: 'account.created', created_at: student.created_at, resource_type: 'student', resource_id: String(student.student_id) },
            ...registrations.map(item => ({
                type: 'event.registration',
                created_at: item.registered_at,
                resource_type: 'event',
                resource_id: String(item.event_id),
                details: item.event_name,
            })),
            ...waitlistHistory.map(item => ({
                type: `waitlist.${item.action}`,
                created_at: item.created_at,
                resource_type: 'event',
                resource_id: String(item.event_id),
                details: `${item.event_name}${item.position ? ` · position #${item.position}` : ''}`,
            })),
            ...memberships.flatMap(item => [
                {
                    type: 'club.join',
                    created_at: item.joined_at,
                    resource_type: 'club',
                    resource_id: String(item.club_id),
                    details: item.club_name,
                },
                ...(item.status === 'left' ? [{
                    type: 'club.leave',
                    created_at: item.updated_at,
                    resource_type: 'club',
                    resource_id: String(item.club_id),
                    details: item.club_name,
                }] : []),
            ]),
            ...auditActivity,
        ].sort((first, second) => String(second.created_at ?? '').localeCompare(String(first.created_at ?? ''))).slice(0, 100);
        res.json({
            student: serializeStudent(student),
            club_memberships: memberships,
            registrations,
            waitlist_history: waitlistHistory,
            activity,
        });
    });
    app.get('/api/admin/clubs', requireEventManager, (req, res) => {
        if (req.session.user.role === 'organizer') {
            const result = db.prepare('SELECT club_id, club_name FROM CLUB WHERE club_id = ?')
                .get(req.session.user.club_id);
            return res.json({
                items: result ? [result] : [],
                page: 1,
                limit: 100,
                total: result ? 1 : 0,
            });
        }
        res.json(listPage(req, 'CLUB', 'club_id, club_name', ['club_name'], 'club_id DESC'));
    });
    app.get('/api/admin/events', requireEventManager, (req, res) => {
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
        if (req.session.user.role === 'organizer') {
            conditions.push('e.club_id = @authorizedClubId');
            bindings.authorizedClubId = req.session.user.club_id;
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
    app.get('/api/admin/registrations', requireEventManager, (req, res) => {
        const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
        const limit = Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 25));
        const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
        const conditions = [];
        const bindings = {};
        if (search) {
            conditions.push('(s.fname LIKE @query OR s.lname LIKE @query OR s.usn LIKE @query OR e.event_name LIKE @query OR c.club_name LIKE @query)');
            bindings.query = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
        }
        if (req.session.user.role === 'organizer') {
            conditions.push('e.club_id = @authorizedClubId');
            bindings.authorizedClubId = req.session.user.club_id;
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const total = db.prepare(`
            SELECT COUNT(*) AS count FROM REGISTRATION r JOIN STUDENT s ON s.student_id = r.student_id
            JOIN EVENT e ON e.event_id = r.event_id JOIN CLUB c ON c.club_id = e.club_id ${where}
        `).get(bindings).count;
        const items = db.prepare(`
            SELECT r.reg_id, r.student_id, r.event_id, r.entry_fee, r.status, r.waitlist_position, s.usn, s.email,
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

    app.get('/api/admin/settings/waitlist', requireAdmin, (_req, res) => {
        const minutes = Number(db.prepare(`
            SELECT setting_value FROM APP_SETTINGS WHERE setting_key = 'waitlist_confirmation_minutes'
        `).get()?.setting_value ?? 30);
        res.json({ confirmation_minutes: minutes });
    });
    app.patch('/api/admin/settings/waitlist', ...adminMutation((req, res) => {
        const body = validate(z.object({ confirmation_minutes: z.coerce.number().int().min(5).max(1440) }), req.body);
        db.prepare(`
            UPDATE APP_SETTINGS SET setting_value = ?, updated_at = CURRENT_TIMESTAMP
            WHERE setting_key = 'waitlist_confirmation_minutes'
        `).run(String(body.confirmation_minutes));
        audit(req.session.user, 'admin.settings.waitlist.update', 'settings', 'waitlist_confirmation_minutes');
        res.json({ confirmation_minutes: body.confirmation_minutes });
    }));

    app.get('/api/student/notifications', requireStudent, (req, res) => {
        const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
        const limit = Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 25));
        res.json(listNotifications(db, 'student', req.session.user.id, { page, limit }));
    });
    app.patch('/api/student/notifications/:id/read', requireStudent, requireCsrf, (req, res, next) => {
        const result = db.prepare(`
            UPDATE NOTIFICATIONS SET read_at = CURRENT_TIMESTAMP
            WHERE notification_id = ? AND recipient_role = 'student' AND recipient_id = ?
        `).run(req.params.id, req.session.user.id);
        if (!result.changes) return next(new HttpError(404, 'Notification not found.'));
        res.status(204).end();
    });
    app.post('/api/student/notifications/read-all', requireStudent, requireCsrf, (req, res) => {
        db.prepare(`
            UPDATE NOTIFICATIONS SET read_at = CURRENT_TIMESTAMP
            WHERE recipient_role = 'student' AND recipient_id = ? AND read_at IS NULL
        `).run(req.session.user.id);
        res.status(204).end();
    });
    app.get('/api/organizer/notifications', requireOrganizer, (req, res) => {
        const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
        const limit = Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 25));
        res.json(listNotifications(db, 'organizer', req.session.user.id, { page, limit }));
    });
    app.patch('/api/organizer/notifications/:id/read', requireOrganizer, requireCsrf, (req, res, next) => {
        const result = db.prepare(`
            UPDATE NOTIFICATIONS SET read_at = CURRENT_TIMESTAMP
            WHERE notification_id = ? AND recipient_role = 'organizer' AND recipient_id = ?
        `).run(req.params.id, req.session.user.id);
        if (!result.changes) return next(new HttpError(404, 'Notification not found.'));
        res.status(204).end();
    });
    app.post('/api/organizer/notifications/read-all', requireOrganizer, requireCsrf, (req, res) => {
        db.prepare(`
            UPDATE NOTIFICATIONS SET read_at = CURRENT_TIMESTAMP
            WHERE recipient_role = 'organizer' AND recipient_id = ? AND read_at IS NULL
        `).run(req.session.user.id);
        res.status(204).end();
    });

    function adminMutation(handler) {
        return [requireAdmin, requireCsrf, asyncRoute((req, res, next) => handler(req, res, next))];
    }

    function eventManagerMutation(handler) {
        return [requireEventManager, requireCsrf, asyncRoute((req, res, next) => handler(req, res, next))];
    }

    function assertCanManageClub(user, clubId) {
        if (user.role === 'admin') return;
        const account = db.prepare(`
            SELECT account_role, club_id FROM ADMINS WHERE admin_id = ?
        `).get(user.id);
        if (!account || account.account_role !== 'organizer' || account.club_id !== Number(clubId)) {
            throw new HttpError(403, 'You do not have permission to manage this club’s events.');
        }
    }

    app.get('/api/admin/organizers', requireAdmin, (req, res) => {
        const organizers = db.prepare(`
            SELECT a.admin_id, a.email, a.club_id, c.club_name, a.created_at
            FROM ADMINS a LEFT JOIN CLUB c ON c.club_id = a.club_id
            WHERE a.account_role = 'organizer'
            ORDER BY a.admin_id DESC
        `).all();
        res.json(organizers);
    });
    app.post('/api/admin/organizers', ...adminMutation(async (req, res) => {
        const body = validate(z.object({
            email: emailSchema,
            club_id: z.coerce.number().int().positive(),
        }).strict(), req.body);
        if (!db.prepare('SELECT club_id FROM CLUB WHERE club_id = ?').get(body.club_id)) {
            throw new HttpError(400, 'Select an existing club.');
        }
        const email = normalizeEmail(body.email);
        const temporaryPassword = `A${crypto.randomBytes(16).toString('hex')}`;
        const passwordHash = await bcrypt.hash(temporaryPassword, 12);
        const result = db.prepare(`
            INSERT INTO ADMINS (email, password_hash, account_role, club_id)
            VALUES (?, ?, 'organizer', ?)
        `).run(email, passwordHash, body.club_id);
        const organizerId = Number(result.lastInsertRowid);
        audit(req.session.user, 'admin.organizer.create', 'organizer', organizerId, JSON.stringify({ email, club_id: body.club_id }));
        res.status(201).json({ admin_id: organizerId, email, club_id: body.club_id, temporary_password: temporaryPassword });
    }));

    function createStudent(body) {
        const departmentInputSchema = z.enum([
            ...DEPARTMENTS.map(item => item.department_code),
            ...DEPARTMENTS.map(item => item.department_name),
        ]);
        const studentSchema = z.object({
            fname: nameSchema,
            lname: nameSchema,
            year: yearSchema,
            department_code: departmentInputSchema.optional(),
            branch: departmentInputSchema.optional(),
        }).refine(value => value.department_code || value.branch, 'Choose a valid department.');
        const values = validate(studentSchema, body);
        const departmentValue = values.department_code || values.branch;
        const department = DEPARTMENTS.find(item => item.department_code === departmentValue || item.department_name === departmentValue);
        return { fname: values.fname, lname: values.lname, year: values.year, department_code: department.department_code };
    }

    app.post('/api/admin/students', ...adminMutation((req, res) => {
        const body = validate(z.object({
            fname: nameSchema,
            lname: nameSchema,
            year: yearSchema,
            department_code: departmentSchema,
        }).strict(), req.body);
        const department = DEPARTMENTS.find(item => item.department_code === body.department_code);
        const result = db.prepare(`
            INSERT INTO STUDENT (fname, lname, year, branch, department_code)
            VALUES (?, ?, ?, ?, ?)
        `).run(body.fname, body.lname, body.year, department.department_name, body.department_code);
        audit(req.session.user, 'admin.student.create', 'student', result.lastInsertRowid);
        res.status(201).json({ student_id: Number(result.lastInsertRowid) });
    }));
    app.patch('/api/admin/students/:id', ...adminMutation((req, res, next) => {
        const body = validate(z.object({
            fname: nameSchema,
            lname: nameSchema,
            year: yearSchema,
            department_code: departmentSchema,
        }).strict(), req.body);
        const department = DEPARTMENTS.find(item => item.department_code === body.department_code);
        const result = db.prepare(`
            UPDATE STUDENT SET fname = ?, lname = ?, year = ?, branch = ?, department_code = ?, updated_at = CURRENT_TIMESTAMP
            WHERE student_id = ?
        `).run(body.fname, body.lname, body.year, department.department_name, body.department_code, req.params.id);
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

    function recordEventScheduleConflicts(eventId, event) {
        if (event.status !== 'published') return;
        const candidates = db.prepare(`
            SELECT event_id, event_name, event_date, start_time, end_date, end_time, timezone,
                location, organizer, organizer_id
            FROM EVENT
            WHERE event_id != ? AND status = 'published'
              AND event_date <= date(?, '+2 day')
              AND COALESCE(end_date, event_date) >= date(?, '-2 day')
        `).all(eventId, event.end_date, event.event_date);
        const createdAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
        for (const candidate of candidates) {
            if (!eventIntervalsOverlap(event, candidate)) continue;
            const venueMatches = event.location.trim().toLocaleLowerCase() === candidate.location.trim().toLocaleLowerCase();
            const organizerMatches = event.organizer_id && event.organizer_id === candidate.organizer_id;
            const eventA = Math.min(eventId, candidate.event_id);
            const eventB = Math.max(eventId, candidate.event_id);
            if (venueMatches) {
                db.prepare(`
                    INSERT OR IGNORE INTO SCHEDULE_CONFLICTS
                        (event_a_id, event_b_id, subject_role, subject_id, severity, detected_at, notified_at)
                    VALUES (?, ?, 'venue', ?, 'high', ?, ?)
                `).run(eventA, eventB, event.location.trim().toLocaleLowerCase(), createdAt, createdAt);
                for (const organizerId of new Set([event.organizer_id, candidate.organizer_id].filter(Boolean))) {
                    createNotification(db, {
                        recipientRole: 'organizer',
                        recipientId: organizerId,
                        type: 'scheduling_alert',
                        message: `Scheduling alert: ${event.event_name} overlaps another event using venue ${event.location}. Review both schedules.`,
                        eventId,
                        dedupeKey: `venue-conflict:${eventA}:${eventB}:${organizerId}`,
                    });
                }
            }
            if (organizerMatches) {
                db.prepare(`
                    INSERT OR IGNORE INTO SCHEDULE_CONFLICTS
                        (event_a_id, event_b_id, subject_role, subject_id, severity, detected_at, notified_at)
                    VALUES (?, ?, 'organizer', ?, 'high', ?, ?)
                `).run(eventA, eventB, String(event.organizer_id), createdAt, createdAt);
                createNotification(db, {
                    recipientRole: 'organizer',
                    recipientId: event.organizer_id,
                    type: 'scheduling_alert',
                    message: `Scheduling alert: ${event.event_name} overlaps another event assigned to you.`,
                    eventId,
                    dedupeKey: `organizer-conflict:${eventA}:${eventB}:${event.organizer_id}`,
                });
            }
        }
    }

    function saveEvent(eventId, event) {
        const save = db.transaction(() => {
            if (eventId) {
                db.prepare(`
                    UPDATE EVENT SET event_name = ?, event_date = ?, end_date = ?, start_time = ?,
                        end_time = ?, timezone = ?, location = ?, club_id = ?, description = ?,
                        organizer_id = ?, category = ?, organizer = ?, entry_fee = ?, capacity = ?,
                        registration_opens_at = ?, registration_closes_at = ?, status = ?
                    WHERE event_id = ?
                `).run(
                    event.event_name, event.event_date, event.end_date, event.start_time, event.end_time,
                    event.timezone, event.location, event.club_id, event.description, event.organizer_id,
                    event.category, event.organizer, event.entry_fee, event.capacity, event.registration_opens_at,
                    event.registration_closes_at, event.status, eventId,
                );
            } else {
                const result = db.prepare(`
                    INSERT INTO EVENT
                        (event_name, event_date, end_date, start_time, end_time, timezone, location,
                         club_id, description, organizer_id, category, organizer, entry_fee, capacity,
                         registration_opens_at, registration_closes_at, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    event.event_name, event.event_date, event.end_date, event.start_time, event.end_time,
                    event.timezone, event.location, event.club_id, event.description, event.organizer_id,
                    event.category, event.organizer, event.entry_fee, event.capacity, event.registration_opens_at,
                    event.registration_closes_at, event.status,
                );
                eventId = Number(result.lastInsertRowid);
            }
            recordEventScheduleConflicts(eventId, event);
        });
        save.immediate();
        return eventId;
    }

    app.post('/api/admin/events', ...eventManagerMutation((req, res) => {
        const body = normalizeEvent(req.body);
        if (!db.prepare('SELECT club_id FROM CLUB WHERE club_id = ?').get(body.club_id)) throw new HttpError(400, 'Select an existing club.');
        assertCanManageClub(req.session.user, body.club_id);
        const eventId = saveEvent(null, body);
        audit(req.session.user, 'admin.event.create', 'event', eventId, JSON.stringify({
            status: body.status,
            entry_fee: body.entry_fee,
            capacity: body.capacity,
        }));
        res.status(201).json({ event_id: eventId });
    }));
    app.patch('/api/admin/events/:id', ...eventManagerMutation((req, res) => {
        const existing = db.prepare('SELECT * FROM EVENT WHERE event_id = ?').get(req.params.id);
        if (!existing) throw new HttpError(404, 'Event not found.');
        assertCanManageClub(req.session.user, existing.club_id);
        const body = normalizeEvent(req.body, existing);
        if (!db.prepare('SELECT club_id FROM CLUB WHERE club_id = ?').get(body.club_id)) throw new HttpError(400, 'Select an existing club.');
        assertCanManageClub(req.session.user, body.club_id);
        saveEvent(Number(req.params.id), body);
        audit(req.session.user, 'admin.event.update', 'event', req.params.id, JSON.stringify({
            status: body.status,
            entry_fee: body.entry_fee,
            capacity: body.capacity,
        }));
        res.json({ message: 'Event updated.' });
    }));
    app.delete('/api/admin/events/:id', ...eventManagerMutation((req, res) => {
        const eventId = Number(req.params.id);
        const event = db.prepare('SELECT event_name, status, club_id FROM EVENT WHERE event_id = ?').get(eventId);
        if (!event) throw new HttpError(404, 'Event not found.');
        assertCanManageClub(req.session.user, event.club_id);
        if (event.status === 'draft') {
            db.prepare('UPDATE EVENT SET status = ? WHERE event_id = ?').run('cancelled', eventId);
        } else if (event.status === 'published') {
            const cancel = db.transaction(() => {
                db.prepare('UPDATE EVENT SET status = ? WHERE event_id = ?').run('cancelled', eventId);
                const affected = db.prepare(`
                    SELECT reg_id, student_id, status FROM REGISTRATION
                    WHERE event_id = ? AND status IN ('confirmed', 'waitlisted', 'promotion_pending')
                `).all(eventId);
                db.prepare(`
                    UPDATE REGISTRATION SET status = 'cancelled', promotion_expires_at = NULL,
                        waitlist_position = NULL, updated_at = CURRENT_TIMESTAMP
                    WHERE event_id = ? AND status IN ('confirmed', 'waitlisted', 'promotion_pending')
                `).run(eventId);
                for (const registration of affected) {
                    if (registration.status === 'waitlisted' || registration.status === 'promotion_pending') {
                        db.prepare(`
                            INSERT INTO WAITLIST_HISTORY (registration_id, student_id, event_id, action)
                            VALUES (?, ?, ?, 'cancelled')
                        `).run(registration.reg_id, registration.student_id, eventId);
                    }
                    createNotification(db, {
                        recipientRole: 'student',
                        recipientId: registration.student_id,
                        type: 'event_cancelled',
                        message: `${event.event_name} has been cancelled by its organizer.`,
                        eventId,
                        dedupeKey: `event-cancelled:${eventId}:${registration.student_id}`,
                    });
                }
            });
            cancel.immediate();
        } else {
            throw new HttpError(409, 'Completed or cancelled events cannot be deleted.');
        }
        audit(req.session.user, 'admin.event.cancel', 'event', eventId);
        res.status(204).end();
    }));
    app.patch('/api/admin/events/:id/status', ...eventManagerMutation((req, res) => {
        const body = validate(z.object({ status: z.enum(['published', 'cancelled', 'completed']) }), req.body);
        const eventId = Number(req.params.id);
        const event = db.prepare('SELECT event_name, status, club_id, event_date, end_date, start_time, end_time, timezone, location, organizer, organizer_id, entry_fee, capacity, registration_opens_at, registration_closes_at FROM EVENT WHERE event_id = ?').get(eventId);
        if (!event) throw new HttpError(404, 'Event not found.');
        assertCanManageClub(req.session.user, event.club_id);
        if (body.status === 'cancelled') {
            const cancel = db.transaction(() => {
                db.prepare('UPDATE EVENT SET status = ? WHERE event_id = ?').run(body.status, eventId);
                const active = db.prepare(`
                    SELECT reg_id, student_id, status FROM REGISTRATION
                    WHERE event_id = ? AND status IN ('confirmed', 'waitlisted', 'promotion_pending')
                `).all(eventId);
                db.prepare(`
                    UPDATE REGISTRATION SET status = 'cancelled', waitlist_position = NULL,
                        promotion_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
                    WHERE event_id = ? AND status IN ('confirmed', 'waitlisted', 'promotion_pending')
                `).run(eventId);
                for (const registration of active) {
                    if (registration.status !== 'confirmed') {
                        db.prepare(`
                            INSERT INTO WAITLIST_HISTORY (registration_id, student_id, event_id, action)
                            VALUES (?, ?, ?, 'cancelled')
                        `).run(registration.reg_id, registration.student_id, eventId);
                    }
                    createNotification(db, {
                        recipientRole: 'student',
                        recipientId: registration.student_id,
                        type: 'event_cancelled',
                        message: `${event.event_name} has been cancelled by its organizer.`,
                        eventId,
                        dedupeKey: `event-cancelled:${eventId}:${registration.student_id}`,
                    });
                }
            });
            cancel.immediate();
        } else {
            const updated = db.prepare('UPDATE EVENT SET status = ? WHERE event_id = ?').run(body.status, eventId);
            if (!updated.changes) throw new HttpError(404, 'Event not found.');
            if (body.status === 'published') recordEventScheduleConflicts(eventId, { ...event, event_name: event.event_name, status: 'published' });
        }
        audit(req.session.user, `admin.event.${body.status}`, 'event', eventId);
        res.json({ status: body.status });
    }));
    app.delete('/api/admin/registrations/:id', ...eventManagerMutation((req, res) => {
        const registration = db.prepare(`
            SELECT r.student_id, e.club_id FROM REGISTRATION r
            JOIN EVENT e ON e.event_id = r.event_id WHERE r.reg_id = ?
        `).get(req.params.id);
        if (!registration) throw new HttpError(404, 'Registration not found.');
        assertCanManageClub(req.session.user, registration.club_id);
        registrationService.cancel({
            studentId: registration.student_id,
            registrationId: Number(req.params.id),
            actor: req.session.user,
        });
        res.status(204).end();
    }));

    // Compatibility routes retain old integrations without exposing private data.
    app.get('/api/students', requireAdmin, (req, res) => {
        const items = db.prepare(`
            SELECT ${studentColumns} FROM STUDENT s
            LEFT JOIN DEPARTMENTS d ON d.department_code = s.department_code
            ORDER BY s.student_id
        `).all();
        res.json(items.map(serializeStudent));
    });
    app.post('/api/students', ...adminMutation((req, res) => {
        const body = createStudent(req.body);
        const department = DEPARTMENTS.find(item => item.department_code === body.department_code);
        const result = db.prepare('INSERT INTO STUDENT (fname, lname, year, branch, department_code) VALUES (?, ?, ?, ?, ?)')
            .run(body.fname, body.lname, body.year, department.department_name, department.department_code);
        audit(req.session.user, 'admin.student.create', 'student', result.lastInsertRowid);
        res.status(201).json({ message: 'Student added', student_id: Number(result.lastInsertRowid) });
    }));
    app.put('/api/students/:id', ...adminMutation((req, res) => {
        const body = createStudent(req.body);
        const department = DEPARTMENTS.find(item => item.department_code === body.department_code);
        const result = db.prepare(`
            UPDATE STUDENT SET fname = ?, lname = ?, year = ?, branch = ?, department_code = ?, updated_at = CURRENT_TIMESTAMP
            WHERE student_id = ?
        `).run(body.fname, body.lname, body.year, department.department_name, department.department_code, req.params.id);
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
        const body = normalizeEvent(req.body);
        if (!db.prepare('SELECT club_id FROM CLUB WHERE club_id = ?').get(body.club_id)) throw new HttpError(400, 'Select an existing club.');
        const eventId = saveEvent(null, body);
        audit(req.session.user, 'admin.event.create', 'event', eventId);
        res.status(201).json({ message: 'Event added', event_id: eventId });
    }));
    app.put('/api/events/:id', ...adminMutation((req, res) => {
        const existing = db.prepare('SELECT * FROM EVENT WHERE event_id = ?').get(req.params.id);
        if (!existing) throw new HttpError(404, 'Event not found.');
        const body = normalizeEvent(req.body, existing);
        if (!db.prepare('SELECT club_id FROM CLUB WHERE club_id = ?').get(body.club_id)) throw new HttpError(400, 'Select an existing club.');
        saveEvent(Number(req.params.id), body);
        audit(req.session.user, 'admin.event.update', 'event', req.params.id);
        res.json({ message: 'Event updated' });
    }));
    app.delete('/api/events/:id', ...adminMutation((req, res) => {
        const eventId = Number(req.params.id);
        const result = db.prepare("UPDATE EVENT SET status = 'cancelled' WHERE event_id = ? AND status IN ('draft', 'published')").run(eventId);
        if (!result.changes) throw new HttpError(404, 'Event not found or cannot be cancelled.');
        audit(req.session.user, 'admin.event.cancel', 'event', eventId);
        res.json({ message: 'Event cancelled' });
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
        const result = registrationService.register({
            studentId: body.student_id,
            eventId: body.event_id,
            allowConflicts: body.allow_conflicts,
        });
        if (result.conflict) throw new HttpError(409, 'This student has an overlapping event registration.');
        audit(req.session.user, 'admin.registration.create', 'registration', result.registrationId, JSON.stringify({
            status: result.status,
            waitlist_position: result.position,
        }));
        res.status(201).json({ message: 'Registration added', reg_id: result.registrationId, status: result.status });
    }));
    app.delete('/api/registrations/:id', ...adminMutation((req, res) => {
        const registration = db.prepare('SELECT student_id FROM REGISTRATION WHERE reg_id = ?').get(req.params.id);
        if (!registration) throw new HttpError(404, 'Registration not found.');
        registrationService.cancel({
            studentId: registration.student_id,
            registrationId: Number(req.params.id),
            actor: req.session.user,
        });
        res.json({ message: 'Registration cancelled' });
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
        if (Number.isInteger(error?.status) && error?.code) {
            return res.status(error.status).json({ error: error.message, code: error.code });
        }
        if (error?.code === 'SQLITE_CONSTRAINT_TRIGGER') {
            const messages = {
                ACTIVE_REGISTRATION_EXISTS: 'You are already registered for this event.',
                EVENT_CAPACITY_REACHED: 'The event is full. Try registering again to join its waitlist.',
                CAPACITY_BELOW_REGISTRATIONS: 'Capacity cannot be lower than the number of confirmed registrations.',
                INVALID_EVENT_STATUS_TRANSITION: 'This event status transition is not allowed.',
            };
            const message = messages[error.message];
            if (message) return res.status(409).json({ error: message });
        }
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

    return {
        app,
        sessionStore,
        processExpiredPromotions: () => registrationService.processExpiredPromotions(),
    };
}

module.exports = { createApp, DEFAULT_USN_PATTERN };
