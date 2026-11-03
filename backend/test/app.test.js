const assert = require('node:assert/strict');
const { afterEach, beforeEach, test } = require('node:test');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { createDatabase } = require('../database');
const { createApp } = require('../app');

let db;
let app;
let sessionStore;

beforeEach(async () => {
    db = createDatabase(':memory:', { seed: false });
    db.prepare('INSERT INTO STUDENT (fname, lname, year, branch) VALUES (?, ?, ?, ?)')
        .run('Legacy', 'Student', 2, 'Computer Science');
    db.prepare('INSERT INTO CLUB (club_name) VALUES (?)').run('Coding Club');
    db.prepare('INSERT INTO EVENT (event_name, event_date, location, club_id) VALUES (?, ?, ?, ?)')
        .run('Campus Workshop', '2099-06-15', 'Main Hall', 1);
    const adminHash = await bcrypt.hash('ValidAdminPass123', 4);
    db.prepare('INSERT INTO ADMINS (email, password_hash) VALUES (?, ?)').run('admin@gmail.com', adminHash);
    ({ app, sessionStore } = createApp({ db, sessionSecret: 'test-secret-with-more-than-thirty-two-characters', production: false }));
});

afterEach(() => {
    sessionStore.close();
    db.close();
});

async function csrf(agent) {
    const response = await agent.get('/api/auth/csrf').expect(200);
    return response.body.csrfToken;
}

async function loginStudent(agent) {
    return registerStudent(agent, {
        usn: '2BU24CS001',
        full_name: 'Campus Student',
        email: 'student@gmail.com',
    });
}

async function registerStudent(agent, {
    usn,
    full_name,
    email,
    year = 2,
    department_code = 'CSE',
}, expectedStatus = 201) {
    const token = await csrf(agent);
    return agent.post('/api/auth/student/register')
        .set('X-CSRF-Token', token)
        .send({
            usn,
            full_name,
            email,
            password: 'StudentPass123',
            password_confirmation: 'StudentPass123',
            year,
            department_code,
        })
        .expect(expectedStatus);
}

async function loginAdmin(agent) {
    const token = await csrf(agent);
    await agent.post('/api/auth/admin/login')
        .set('X-CSRF-Token', token)
        .send({ email: 'admin@gmail.com', password: 'ValidAdminPass123' })
        .expect(200);
}

test('public endpoints do not expose student data and management routes require a session', async () => {
    const clubs = await request(app).get('/api/public/clubs').expect(200);
    assert.deepEqual(clubs.body, [{ club_id: 1, club_name: 'Coding Club' }]);

    await request(app).get('/api/admin/students').expect(401);
    await request(app).get('/api/students').expect(401);
    await request(app).get('/api/student/profile').expect(401);
});

test('student signup, CSRF, private profile, registration ownership, and logout work', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/student/register')
        .send({
            usn: '2BU24CS001',
            full_name: 'Campus Student',
            email: 'student@gmail.com',
            password: 'StudentPass123',
            password_confirmation: 'StudentPass123',
            year: 2,
            department_code: 'CSE',
        })
        .expect(403);

    await loginStudent(agent);
    const me = await agent.get('/api/auth/me').expect(200);
    assert.equal(me.body.user.usn, '2BU24CS001');

    const profile = await agent.get('/api/student/profile').expect(200);
    assert.equal(profile.body.has_account, true);
    assert.equal(profile.body.password_hash, undefined);
    assert.equal(profile.body.full_name, 'Campus Student');
    await agent.get('/api/admin/students').expect(401);

    const token = await csrf(agent);
    const registration = await agent.post('/api/student/registrations')
        .set('X-CSRF-Token', token)
        .send({ event_id: 1, entry_fee: 999 })
        .expect(201);
    assert.ok(registration.body.reg_id);
    assert.equal(registration.body.status, 'confirmed');
    assert.equal(db.prepare('SELECT entry_fee FROM REGISTRATION WHERE reg_id = ?').get(registration.body.reg_id).entry_fee, 0);
    await agent.post('/api/student/registrations')
        .set('X-CSRF-Token', token)
        .send({ event_id: 1, entry_fee: 0 })
        .expect(409);

    const anotherStudentRegistration = db.prepare(
        'INSERT INTO REGISTRATION (student_id, event_id, entry_fee) VALUES (?, ?, ?)',
    ).run(1, 1, 0);
    await agent.delete(`/api/student/registrations/${anotherStudentRegistration.lastInsertRowid}`)
        .set('X-CSRF-Token', token)
        .expect(404);

    const ownRegistrations = await agent.get('/api/student/registrations').expect(200);
    assert.equal(ownRegistrations.body.length, 1);
    assert.equal(ownRegistrations.body[0].event_name, 'Campus Workshop');
    await agent.delete(`/api/student/registrations/${registration.body.reg_id}`)
        .set('X-CSRF-Token', token)
        .expect(204);

    const logoutToken = await csrf(agent);
    await agent.post('/api/auth/logout').set('X-CSRF-Token', logoutToken).expect(204);
    await agent.get('/api/student/profile').expect(401);
});

test('admin can manage campus records while rejecting invalid calendar dates', async () => {
    const agent = request.agent(app);
    await loginAdmin(agent);
    const studentAgent = request.agent(app);
    await loginStudent(studentAgent);

    const dashboard = await agent.get('/api/admin/dashboard').expect(200);
    assert.equal(dashboard.body.students, 2);
    assert.equal(dashboard.body.clubs, 1);
    await agent.get('/api/student/profile').expect(401);

    const token = await csrf(agent);
    await agent.post('/api/admin/events')
        .set('X-CSRF-Token', token)
        .send({ event_name: 'Impossible date', event_date: '2024-02-31', location: 'Main Hall', club_id: 1 })
        .expect(400);

    await agent.post('/api/admin/events')
        .set('X-CSRF-Token', token)
        .send({ event_name: 'New Event', event_date: '2099-08-20', location: 'Auditorium', club_id: 1 })
        .expect(201);
    const newEvent = await agent.post('/api/admin/events')
        .set('X-CSRF-Token', token)
        .send({ event_name: 'Temporary Event', event_date: '2099-08-21', location: 'Auditorium', club_id: 1 })
        .expect(201);
    await agent.patch(`/api/admin/events/${newEvent.body.event_id}`)
        .set('X-CSRF-Token', token)
        .send({ event_name: 'Updated Event', event_date: '2099-08-22', location: 'Library', club_id: 1 })
        .expect(200);
    await agent.delete(`/api/admin/events/${newEvent.body.event_id}`)
        .set('X-CSRF-Token', token)
        .expect(204);

    const newClub = await agent.post('/api/admin/clubs')
        .set('X-CSRF-Token', token)
        .send({ club_name: 'Temporary Club' })
        .expect(201);
    await agent.patch(`/api/admin/clubs/${newClub.body.club_id}`)
        .set('X-CSRF-Token', token)
        .send({ club_name: 'Updated Club' })
        .expect(200);
    await agent.delete(`/api/admin/clubs/${newClub.body.club_id}`)
        .set('X-CSRF-Token', token)
        .expect(204);

    const newStudent = await agent.post('/api/admin/students')
        .set('X-CSRF-Token', token)
        .send({ fname: 'Mira', lname: 'Student', year: 1, department_code: 'AIML' })
        .expect(201);
    await agent.patch(`/api/admin/students/${newStudent.body.student_id}`)
        .set('X-CSRF-Token', token)
        .send({ fname: 'Mira', lname: 'Sharma', year: 2, department_code: 'AIML' })
        .expect(200);
    await agent.delete(`/api/admin/students/${newStudent.body.student_id}`)
        .set('X-CSRF-Token', token)
        .expect(204);
    await agent.post('/api/admin/students')
        .set('X-CSRF-Token', token)
        .send({ fname: 'Mira', lname: 'Student', year: 1, department_code: 'Design' })
        .expect(400);
    await agent.patch('/api/admin/students/2')
        .set('X-CSRF-Token', token)
        .send({ fname: 'Campus', lname: 'Updated', year: 3, department_code: 'CSE' })
        .expect(200);
    const account = db.prepare('SELECT usn, email, password_hash FROM STUDENT WHERE student_id = 2').get();
    assert.equal(account.usn, '2BU24CS001');
    assert.equal(account.email, 'student@gmail.com');
    assert.ok(account.password_hash);

    const students = await agent.get('/api/admin/students').expect(200);
    const legacyStudent = students.body.items.find(student => student.student_id === 1);
    assert.equal(legacyStudent.has_account, false);
    assert.equal(students.body.items.every(student => student.password_hash === undefined), true);

    const activity = await agent.get('/api/admin/audit-logs').expect(200);
    assert.ok(activity.body.items.some(item => item.action === 'admin.event.create'));
});

test('four academic years and the five departments are validated and exposed to admins', async () => {
    const config = await request(app).get('/api/public/config').expect(200);
    assert.deepEqual(config.body.academic_years, [1, 2, 3, 4]);
    assert.deepEqual(config.body.departments.map(item => item.department_code), ['CSE', 'MECHANICAL', 'CSBS', 'CIVIL', 'AIML']);

    for (const year of [0, 5, 6]) {
        const invalidYear = request.agent(app);
        const response = await registerStudent(invalidYear, {
            usn: `2BU24CS01${year}`,
            full_name: 'Invalid Year',
            email: `invalidyear${year}@gmail.com`,
            year,
        }, 400);
        assert.equal(response.status, 400);
    }
    const invalidDepartment = request.agent(app);
    const invalidDepartmentResponse = await registerStudent(invalidDepartment, {
        usn: '2BU24CS012',
        full_name: 'Invalid Department',
        email: 'invaliddepartment@gmail.com',
        department_code: 'DESIGN',
    }, 400);
    assert.equal(invalidDepartmentResponse.status, 400);

    const student = request.agent(app);
    await registerStudent(student, {
        usn: '2BU24CS013',
        full_name: 'Fourth Year Student',
        email: 'sixthyear@gmail.com',
        year: 4,
        department_code: 'AIML',
    });
    const profile = await student.get('/api/student/profile').expect(200);
    assert.equal(profile.body.year, 4);
    assert.equal(profile.body.department_code, 'AIML');
    assert.equal(profile.body.department_name, 'Artificial Intelligence and Machine Learning');

    const membershipToken = await csrf(student);
    await student.post('/api/student/clubs/1/membership')
        .set('X-CSRF-Token', membershipToken)
        .send({})
        .expect(201);
    const memberships = await student.get('/api/student/memberships').expect(200);
    assert.equal(memberships.body[0].club_name, 'Coding Club');
    assert.equal(memberships.body[0].status, 'active');

    const admin = request.agent(app);
    await loginAdmin(admin);
    const students = await admin.get('/api/admin/students?year=4&department_code=AIML&membership=active').expect(200);
    assert.equal(students.body.total, 1);
    assert.equal(students.body.items[0].has_account, true);
    const detail = await admin.get(`/api/admin/students/${students.body.items[0].student_id}`).expect(200);
    assert.equal(detail.body.student.password_hash, undefined);
    assert.equal(detail.body.student.department_code, 'AIML');
    assert.equal(detail.body.club_memberships[0].club_name, 'Coding Club');
    assert.ok(detail.body.activity.some(item => item.type === 'club.join'));

    await student.delete('/api/student/clubs/1/membership')
        .set('X-CSRF-Token', membershipToken)
        .expect(204);
    const noMembership = await admin.get('/api/admin/students?year=4&membership=none').expect(200);
    assert.equal(noMembership.body.total, 1);
});

test('registration ignores client fees, enforces capacity, and assigns ordered waitlist positions atomically', async () => {
    db.prepare(`
        UPDATE EVENT SET entry_fee = 125.5, capacity = 1, event_date = '2099-06-15',
            end_date = '2099-06-15', start_time = '10:00', end_time = '11:00'
        WHERE event_id = 1
    `).run();
    const agents = [1, 2, 3].map(() => request.agent(app));
    await Promise.all(agents.map((agent, index) => registerStudent(agent, {
        usn: `2BU24CS02${index}`,
        full_name: `Capacity Student ${index}`,
        email: `capacity${index}@gmail.com`,
    })));

    const responses = await Promise.all(agents.map(async agent => {
        const token = await csrf(agent);
        return agent.post('/api/student/registrations')
            .set('X-CSRF-Token', token)
            .send({ event_id: 1, entry_fee: 0 });
    }));
    assert.deepEqual(responses.map(response => response.status), [201, 201, 201]);
    const statuses = responses.map(response => response.body.status);
    assert.equal(statuses.filter(status => status === 'confirmed').length, 1);
    assert.equal(statuses.filter(status => status === 'waitlisted').length, 2);
    const positions = responses.filter(response => response.body.status === 'waitlisted')
        .map(response => response.body.waitlist_position).sort();
    assert.deepEqual(positions, [1, 2]);
    assert.equal(db.prepare(`
        SELECT COUNT(*) AS count FROM REGISTRATION
        WHERE event_id = 1 AND status IN ('confirmed', 'promotion_pending')
    `).get().count, 1);
    assert.equal(db.prepare('SELECT MIN(entry_fee) AS fee FROM REGISTRATION WHERE event_id = 1').get().fee, 125.5);

    const event = await request(app).get('/api/public/events/1').expect(200);
    assert.equal(event.body.lifecycle_status, 'full');
    assert.equal(event.body.available_slots, 0);
    assert.equal(event.body.waitlist_count, 2);
});

test('cancellation atomically promotes the first eligible waitlisted student for confirmation', async () => {
    db.prepare('UPDATE EVENT SET capacity = 1, event_date = ?, end_date = ?, start_time = ?, end_time = ? WHERE event_id = 1')
        .run('2099-06-15', '2099-06-15', '10:00', '11:00');
    const first = request.agent(app);
    const second = request.agent(app);
    await registerStudent(first, { usn: '2BU24CS031', full_name: 'First Student', email: 'first@gmail.com' });
    await registerStudent(second, { usn: '2BU24CS032', full_name: 'Second Student', email: 'second@gmail.com' });
    const firstToken = await csrf(first);
    const confirmed = await first.post('/api/student/registrations').set('X-CSRF-Token', firstToken).send({ event_id: 1 }).expect(201);
    const secondToken = await csrf(second);
    const waitlisted = await second.post('/api/student/registrations').set('X-CSRF-Token', secondToken).send({ event_id: 1 }).expect(201);
    assert.equal(waitlisted.body.status, 'waitlisted');

    await first.delete(`/api/student/registrations/${confirmed.body.reg_id}`)
        .set('X-CSRF-Token', firstToken)
        .expect(204);
    let rows = await second.get('/api/student/registrations').expect(200);
    const offer = rows.body.find(item => item.reg_id === waitlisted.body.reg_id);
    assert.equal(offer.status, 'promotion_pending');
    assert.ok(offer.promotion_expires_at);

    await second.post(`/api/student/registrations/${waitlisted.body.reg_id}/confirm`)
        .set('X-CSRF-Token', secondToken)
        .expect(200);
    rows = await second.get('/api/student/registrations').expect(200);
    assert.equal(rows.body.find(item => item.reg_id === waitlisted.body.reg_id).status, 'confirmed');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM WAITLIST_HISTORY WHERE event_id = 1').get().count, 3);
});

test('waitlist confirmation settings apply and expired offers advance the queue', async () => {
    db.prepare('UPDATE EVENT SET capacity = 1, event_date = ?, end_date = ?, start_time = ?, end_time = ? WHERE event_id = 1')
        .run('2099-06-15', '2099-06-15', '10:00', '11:00');
    const admin = request.agent(app);
    await loginAdmin(admin);
    const adminToken = await csrf(admin);
    await admin.patch('/api/admin/settings/waitlist')
        .set('X-CSRF-Token', adminToken)
        .send({ confirmation_minutes: 5 })
        .expect(200);
    await admin.patch('/api/admin/settings/waitlist')
        .set('X-CSRF-Token', adminToken)
        .send({ confirmation_minutes: 2 })
        .expect(400);

    const first = request.agent(app);
    const second = request.agent(app);
    await registerStudent(first, { usn: '2BU24CS033', full_name: 'First Offer Student', email: 'firstoffer@gmail.com' });
    await registerStudent(second, { usn: '2BU24CS034', full_name: 'Second Offer Student', email: 'secondoffer@gmail.com' });
    const firstToken = await csrf(first);
    const confirmed = await first.post('/api/student/registrations')
        .set('X-CSRF-Token', firstToken).send({ event_id: 1 }).expect(201);
    const secondToken = await csrf(second);
    const waiting = await second.post('/api/student/registrations')
        .set('X-CSRF-Token', secondToken).send({ event_id: 1 }).expect(201);
    await first.delete(`/api/student/registrations/${confirmed.body.reg_id}`)
        .set('X-CSRF-Token', firstToken).expect(204);

    db.prepare(`UPDATE REGISTRATION SET promotion_expires_at = '2000-01-01 00:00:00' WHERE reg_id = ?`)
        .run(waiting.body.reg_id);
    const registrations = await second.get('/api/student/registrations').expect(200);
    assert.equal(registrations.body.find(item => item.reg_id === waiting.body.reg_id).status, 'promotion_expired');
    const notifications = await second.get('/api/student/notifications').expect(200);
    assert.ok(notifications.body.items.some(item => item.notification_type === 'waitlist_expired'));
    assert.ok(db.prepare(`
        SELECT 1 FROM WAITLIST_HISTORY WHERE registration_id = ? AND action = 'expired'
    `).get(waiting.body.reg_id));
});

test('cancelling an event releases active registrations and notifies every attendee', async () => {
    db.prepare('UPDATE EVENT SET capacity = 1, event_date = ?, end_date = ? WHERE event_id = 1')
        .run('2099-06-15', '2099-06-15');
    const confirmedStudent = request.agent(app);
    const waitlistedStudent = request.agent(app);
    await registerStudent(confirmedStudent, { usn: '2BU24CS035', full_name: 'Confirmed Student', email: 'confirmed@gmail.com' });
    await registerStudent(waitlistedStudent, { usn: '2BU24CS036', full_name: 'Waitlisted Student', email: 'waitlisted@gmail.com' });
    const confirmedToken = await csrf(confirmedStudent);
    await confirmedStudent.post('/api/student/registrations')
        .set('X-CSRF-Token', confirmedToken).send({ event_id: 1 }).expect(201);
    const waitlistedToken = await csrf(waitlistedStudent);
    await waitlistedStudent.post('/api/student/registrations')
        .set('X-CSRF-Token', waitlistedToken).send({ event_id: 1 }).expect(201);

    const admin = request.agent(app);
    await loginAdmin(admin);
    const adminToken = await csrf(admin);
    await admin.delete('/api/admin/events/1').set('X-CSRF-Token', adminToken).expect(204);

    const confirmedRows = await confirmedStudent.get('/api/student/registrations').expect(200);
    const waitlistedRows = await waitlistedStudent.get('/api/student/registrations').expect(200);
    assert.equal(confirmedRows.body[0].status, 'cancelled');
    assert.equal(waitlistedRows.body[0].status, 'cancelled');
    assert.ok(db.prepare(`
        SELECT 1 FROM WAITLIST_HISTORY WHERE event_id = 1 AND action = 'cancelled'
    `).get());
    for (const student of [confirmedStudent, waitlistedStudent]) {
        const notifications = await student.get('/api/student/notifications').expect(200);
        assert.ok(notifications.body.items.some(item => item.notification_type === 'event_cancelled'));
    }
});

test('organizer accounts are club-scoped and receive relevant scheduling alerts', async () => {
    db.prepare('INSERT INTO CLUB (club_name) VALUES (?)').run('Robotics Club');
    db.prepare(`
        INSERT INTO EVENT (event_name, event_date, location, club_id)
        VALUES ('Other Club Event', '2099-06-15', 'Other Hall', 2)
    `).run();
    const admin = request.agent(app);
    await loginAdmin(admin);
    const adminToken = await csrf(admin);
    const created = await admin.post('/api/admin/organizers')
        .set('X-CSRF-Token', adminToken)
        .send({ email: 'organizer@gmail.com', club_id: 1 })
        .expect(201);
    assert.ok(created.body.temporary_password);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM AUDIT_LOGS WHERE details LIKE ?')
        .get(`%${created.body.temporary_password}%`).count, 0);

    const organizer = request.agent(app);
    const organizerToken = await csrf(organizer);
    const login = await organizer.post('/api/auth/admin/login')
        .set('X-CSRF-Token', organizerToken)
        .send({ email: created.body.email, password: created.body.temporary_password })
        .expect(200);
    assert.equal(login.body.user.role, 'organizer');
    const identity = await organizer.get('/api/auth/me').expect(200);
    assert.equal(identity.body.user.role, 'organizer');
    assert.equal(identity.body.user.club_id, 1);
    const organizerMutationToken = await csrf(organizer);
    await organizer.get('/api/admin/students').expect(401);
    const eventList = await organizer.get('/api/admin/events').expect(200);
    assert.ok(eventList.body.items.every(item => item.club_id === 1));

    await organizer.post('/api/admin/events')
        .set('X-CSRF-Token', organizerMutationToken)
        .send({
            event_name: 'Robotics Club Workshop',
            event_date: '2099-06-15',
            end_date: '2099-06-15',
            start_time: '09:00',
            end_time: '10:00',
            location: 'Main Hall',
            club_id: 1,
            organizer_id: created.body.admin_id,
            status: 'published',
        })
        .expect(201);
    const notifications = await organizer.get('/api/organizer/notifications').expect(200);
    assert.ok(notifications.body.items.some(item => item.notification_type === 'scheduling_alert'));
});

test('overlapping registrations require explicit confirmation and record the decision', async () => {
    db.prepare('UPDATE EVENT SET event_date = ?, end_date = ?, start_time = ?, end_time = ? WHERE event_id = 1')
        .run('2099-06-15', '2099-06-15', '10:00', '11:00');
    db.prepare(`
        INSERT INTO EVENT
            (event_name, event_date, end_date, start_time, end_time, location, club_id, capacity, status)
        VALUES ('Overlapping Workshop', '2099-06-15', '2099-06-15', '10:30', '11:30', 'Library Hall', 1, 10, 'published')
    `).run();
    const student = request.agent(app);
    await registerStudent(student, { usn: '2BU24CS041', full_name: 'Conflict Student', email: 'conflict@gmail.com' });
    const token = await csrf(student);
    await student.post('/api/student/registrations')
        .set('X-CSRF-Token', token)
        .send({ event_id: 1 })
        .expect(201);
    const conflict = await student.post('/api/student/registrations')
        .set('X-CSRF-Token', token)
        .send({ event_id: 2 })
        .expect(409);
    assert.equal(conflict.body.code, 'SCHEDULE_CONFLICT');
    assert.equal(conflict.body.conflicts[0].event_name, 'Campus Workshop');
    const override = await student.post('/api/student/registrations')
        .set('X-CSRF-Token', token)
        .send({ event_id: 2, allow_conflicts: true })
        .expect(201);
    assert.equal(db.prepare('SELECT conflict_decision FROM REGISTRATION WHERE reg_id = ?').get(override.body.reg_id).conflict_decision, 'overridden');
    assert.equal(db.prepare('SELECT decision FROM SCHEDULE_CONFLICTS').get().decision, 'overridden');
    const notifications = await student.get('/api/student/notifications').expect(200);
    assert.ok(notifications.body.items.some(item => item.notification_type === 'schedule_conflict'));
});
