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
    const token = await csrf(agent);
    await agent.post('/api/auth/student/register')
        .set('X-CSRF-Token', token)
        .send({
            usn: '2BU24CS001',
            full_name: 'Campus Student',
            email: 'student@gmail.com',
            password: 'StudentPass123',
            password_confirmation: 'StudentPass123',
            year: 2,
            branch: 'Computer Science',
        })
        .expect(201);
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
            branch: 'Computer Science',
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
        .send({ event_id: 1, entry_fee: 0 })
        .expect(201);
    assert.ok(registration.body.reg_id);
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
        .send({ fname: 'Mira', lname: 'Student', year: 1, branch: 'Design' })
        .expect(201);
    await agent.patch(`/api/admin/students/${newStudent.body.student_id}`)
        .set('X-CSRF-Token', token)
        .send({ fname: 'Mira', lname: 'Sharma', year: 2, branch: 'Design' })
        .expect(200);
    await agent.delete(`/api/admin/students/${newStudent.body.student_id}`)
        .set('X-CSRF-Token', token)
        .expect(204);
    await agent.post('/api/admin/students')
        .set('X-CSRF-Token', token)
        .send({ fname: 'Mira', lname: 'Student', year: 1, branch: 'Design', usn: '2BU24CS002' })
        .expect(400);
    await agent.patch('/api/admin/students/2')
        .set('X-CSRF-Token', token)
        .send({ fname: 'Campus', lname: 'Updated', year: 3, branch: 'Computer Science' })
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
