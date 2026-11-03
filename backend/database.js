const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'database', 'club_management.db');

function createDatabase(filename = DB_PATH, options = {}) {
    const db = new Database(filename);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeSchema(db, options);
    return db;
}

function initializeSchema(db, options = {}) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS STUDENT (
            student_id INTEGER PRIMARY KEY AUTOINCREMENT,
            fname TEXT NOT NULL,
            lname TEXT NOT NULL,
            year INTEGER NOT NULL,
            branch TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS CLUB (
            club_id INTEGER PRIMARY KEY AUTOINCREMENT,
            club_name TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS EVENT (
            event_id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_name TEXT NOT NULL,
            event_date TEXT NOT NULL,
            location TEXT NOT NULL,
            club_id INTEGER NOT NULL,
            FOREIGN KEY (club_id) REFERENCES CLUB(club_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS REGISTRATION (
            reg_id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            event_id INTEGER NOT NULL,
            entry_fee REAL NOT NULL,
            FOREIGN KEY (student_id) REFERENCES STUDENT(student_id) ON DELETE CASCADE,
            FOREIGN KEY (event_id) REFERENCES EVENT(event_id) ON DELETE CASCADE
        );
    `);

    migrateDatabase(db);

    const studentCount = db.prepare('SELECT COUNT(*) AS count FROM STUDENT').get().count;
    if (options.seed !== false && studentCount === 0) seedDatabase(db);
}

function migrateDatabase(db) {
    const version = db.pragma('user_version', { simple: true });
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrations = fs.readdirSync(migrationsDir)
        .filter(filename => /^\d+_.+\.sql$/.test(filename))
        .sort();

    for (const filename of migrations) {
        const migrationVersion = Number(filename.split('_', 1)[0]);
        if (migrationVersion <= version) continue;

        const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
        db.transaction(() => {
            db.exec(sql);
            db.pragma(`user_version = ${migrationVersion}`);
        })();
        console.log(`Applied database migration ${filename}`);
    }
}

function seedDatabase(db) {
    const insertStudent = db.prepare('INSERT INTO STUDENT (fname, lname, year, branch) VALUES (?, ?, ?, ?)');
    const insertClub = db.prepare('INSERT INTO CLUB (club_name) VALUES (?)');
    const insertEvent = db.prepare('INSERT INTO EVENT (event_name, event_date, location, club_id) VALUES (?, ?, ?, ?)');
    const insertRegistration = db.prepare('INSERT INTO REGISTRATION (student_id, event_id, entry_fee) VALUES (?, ?, ?)');

    db.transaction(() => {
        insertStudent.run('Aarav', 'Sharma', 2, 'Computer Science');
        insertStudent.run('Priya', 'Patel', 3, 'Electronics');
        insertStudent.run('Rohan', 'Gupta', 1, 'Mechanical');
        insertStudent.run('Sneha', 'Reddy', 4, 'Information Technology');
        insertStudent.run('Vikram', 'Singh', 2, 'Civil Engineering');

        insertClub.run('Coding Club');
        insertClub.run('Robotics Club');
        insertClub.run('Literary Society');
        insertClub.run('Music Club');
        insertClub.run('Sports Club');

        insertEvent.run('Hackathon 2026', '2026-06-15', 'Main Auditorium', 1);
        insertEvent.run('RoboWars', '2026-07-20', 'Tech Arena', 2);
        insertEvent.run('Poetry Slam', '2026-06-01', 'Library Hall', 3);
        insertEvent.run('Battle of Bands', '2026-08-10', 'Open Air Theatre', 4);
        insertEvent.run('Inter-College Cricket', '2026-09-05', 'Sports Ground', 5);

        insertRegistration.run(1, 1, 200);
        insertRegistration.run(2, 3, 50);
        insertRegistration.run(3, 2, 150);
        insertRegistration.run(4, 5, 100);
        insertRegistration.run(5, 4, 75);
    })();
}

module.exports = { createDatabase, initializeSchema, migrateDatabase };
