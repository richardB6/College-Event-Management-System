const assert = require('node:assert/strict');
const { test } = require('node:test');
const Database = require('better-sqlite3');
const { createDatabase, migrateDatabase } = require('../database');

test('new seeded events are immediately available until their start time', t => {
    const db = createDatabase(':memory:');
    t.after(() => db.close());

    const event = db.prepare(`
        SELECT event_date, start_time, registration_opens_at, registration_closes_at
        FROM EVENT ORDER BY event_id LIMIT 1
    `).get();

    assert.equal(event.registration_opens_at, null);
    assert.equal(event.registration_closes_at, `${event.event_date}T${event.start_time}`);
});

test('migration adds account tables while preserving all legacy records and relationships', t => {
    const db = new Database(':memory:');
    t.after(() => db.close());
    db.pragma('foreign_keys = ON');
    db.exec(`
        CREATE TABLE STUDENT (
            student_id INTEGER PRIMARY KEY AUTOINCREMENT,
            fname TEXT NOT NULL,
            lname TEXT NOT NULL,
            year INTEGER NOT NULL,
            branch TEXT NOT NULL
        );
        CREATE TABLE CLUB (
            club_id INTEGER PRIMARY KEY AUTOINCREMENT,
            club_name TEXT NOT NULL
        );
        CREATE TABLE EVENT (
            event_id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_name TEXT NOT NULL,
            event_date TEXT NOT NULL,
            location TEXT NOT NULL,
            club_id INTEGER NOT NULL REFERENCES CLUB(club_id) ON DELETE CASCADE
        );
        CREATE TABLE REGISTRATION (
            reg_id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL REFERENCES STUDENT(student_id) ON DELETE CASCADE,
            event_id INTEGER NOT NULL REFERENCES EVENT(event_id) ON DELETE CASCADE,
            entry_fee REAL NOT NULL
        );
        INSERT INTO STUDENT (fname, lname, year, branch) VALUES
            ('Legacy', 'One', 1, 'Science'), ('Legacy', 'Two', 2, 'Arts');
        INSERT INTO CLUB (club_name) VALUES ('Legacy Club');
        INSERT INTO EVENT (event_name, event_date, location, club_id)
            VALUES ('Legacy Event', '2026-01-01', 'Main Hall', 1);
        INSERT INTO REGISTRATION (student_id, event_id, entry_fee) VALUES (1, 1, 25);
    `);

    migrateDatabase(db);

    assert.equal(db.pragma('user_version', { simple: true }), 6);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM STUDENT').get().count, 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM CLUB').get().count, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM EVENT').get().count, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM REGISTRATION').get().count, 1);
    const legacy = db.prepare('SELECT usn, email, password_hash, account_status, created_at, department_code FROM STUDENT WHERE student_id = 1').get();
    assert.deepEqual({ usn: legacy.usn, email: legacy.email, password_hash: legacy.password_hash, account_status: legacy.account_status }, {
        usn: null,
        email: null,
        password_hash: null,
        account_status: 'active',
    });

    assert.ok(legacy.created_at);
    assert.equal(legacy.department_code, null);
    assert.equal(db.prepare('SELECT entry_fee, capacity, status FROM EVENT WHERE event_id = 1').get().capacity, 1000);
    assert.equal(db.prepare('SELECT status FROM REGISTRATION WHERE reg_id = 1').get().status, 'confirmed');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM DEPARTMENTS').get().count, 5);
    assert.equal(db.pragma('foreign_key_check').length, 0);
    assert.throws(() => db.prepare('UPDATE STUDENT SET year = 5 WHERE student_id = 1').run(), /INVALID_ACADEMIC_YEAR/);
    assert.throws(() => db.prepare('INSERT INTO STUDENT (fname, lname, year, branch) VALUES (?, ?, ?, ?)')
        .run('Out', 'OfRange', 6, 'Computer Science'), /INVALID_ACADEMIC_YEAR/);
    db.prepare('UPDATE STUDENT SET year = 4 WHERE student_id = 1').run();
    assert.equal(db.prepare('SELECT year FROM STUDENT WHERE student_id = 1').get().year, 4);
    assert.throws(() => db.prepare('UPDATE EVENT SET capacity = 0 WHERE event_id = 1').run());
    assert.throws(() => db.prepare("UPDATE EVENT SET status = 'draft' WHERE event_id = 1").run(), /INVALID_EVENT_STATUS_TRANSITION/);
});

test('migration opens seeded events immediately and closes registration when events begin', t => {
    const db = new Database(':memory:');
    t.after(() => db.close());
    db.exec(`
        CREATE TABLE CLUB (club_id INTEGER PRIMARY KEY, club_name TEXT NOT NULL);
        CREATE TABLE EVENT (
            event_id INTEGER PRIMARY KEY,
            event_date TEXT NOT NULL,
            start_time TEXT NOT NULL,
            registration_opens_at TEXT,
            registration_closes_at TEXT,
            status TEXT NOT NULL DEFAULT 'published'
        );
        CREATE TABLE NOTIFICATIONS (
            notification_id INTEGER PRIMARY KEY,
            recipient_role TEXT NOT NULL,
            recipient_id INTEGER NOT NULL,
            notification_type TEXT NOT NULL,
            message TEXT NOT NULL,
            event_id INTEGER,
            dedupe_key TEXT,
            created_at TEXT,
            read_at TEXT
        );
        INSERT INTO EVENT (event_id, event_date, start_time, registration_opens_at, registration_closes_at) VALUES
            (1, '2027-02-14', '09:00', '2027-02-14T08:00', '2027-02-14T17:00'),
            (2, '2027-02-15', '10:00', '2027-02-01T08:00', '2027-02-15T17:00');
    `);
    db.pragma('user_version = 3');

    migrateDatabase(db);

    assert.deepEqual(db.prepare(`
        SELECT registration_opens_at, registration_closes_at
        FROM EVENT WHERE event_id = 1
    `).get(), {
        registration_opens_at: null,
        registration_closes_at: '2027-02-14T09:00',
    });
    assert.deepEqual(db.prepare(`
        SELECT registration_opens_at, registration_closes_at
        FROM EVENT WHERE event_id = 2
    `).get(), {
        registration_opens_at: '2027-02-01T08:00',
        registration_closes_at: '2027-02-15T17:00',
    });
});
