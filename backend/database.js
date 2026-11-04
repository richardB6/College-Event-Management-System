const bcrypt = require('bcryptjs');
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
    const clubs = [
        'Coding & Development Club',
        'AI & Machine Learning Club',
        'Robotics & Innovation Club',
        'Entrepreneurship & Business Club',
        'Cultural & Performing Arts Club',
        'Photography & Media Club',
        'Sports & Fitness Club',
        'Literary & Debate Club',
        'Electronics & IoT Club',
        'Design & Creative Club',
    ];

    const departments = [
        { code: 'CSE', name: 'Computer Science and Engineering', usnCode: 'CS', yearCounts: [8, 8, 7, 7] },
        { code: 'MECHANICAL', name: 'Mechanical Engineering', usnCode: 'ME', yearCounts: [7, 7, 6, 6] },
        { code: 'CSBS', name: 'Computer Science and Business Systems', usnCode: 'CB', yearCounts: [6, 6, 6, 5] },
        { code: 'CIVIL', name: 'Civil Engineering', usnCode: 'CE', yearCounts: [5, 5, 5, 5] },
        { code: 'AIML', name: 'Artificial Intelligence and Machine Learning', usnCode: 'AI', yearCounts: [5, 5, 5, 5] },
    ];

    const firstNames = [
        'Aarav', 'Aditya', 'Ananya', 'Aditi', 'Akash', 'Arjun', 'Bhavya', 'Chaitanya', 'Diya', 'Divya',
        'Ishita', 'Karan', 'Kavya', 'Manya', 'Mehul', 'Neha', 'Nikhil', 'Om', 'Pranav', 'Pooja',
        'Riya', 'Rohan', 'Saanvi', 'Sai', 'Sakshi', 'Shaurya', 'Shreya', 'Tanvi', 'Tejas', 'Ujjwal', 'Vaibhav', 'Vansh', 'Yash', 'Zoya'
    ];

    const lastNames = [
        'Sharma', 'Patel', 'Reddy', 'Iyer', 'Nair', 'Singh', 'Verma', 'Kumar', 'Joshi', 'Menon',
        'Gupta', 'Kapoor', 'Saxena', 'Desai', 'Naidu', 'Khan', 'Pillai', 'Rao', 'Choudhary', 'Mishra'
    ];

    const eventTemplates = [
        { name: 'Inter-College Hackathon', clubIndex: 0, category: 'Technical', date: '2027-02-14', start: '09:00', end: '17:00', location: 'Innovation Center', fee: 150, capacity: 120 },
        { name: 'AI & ML Bootcamp', clubIndex: 1, category: 'Workshop', date: '2027-02-21', start: '10:00', end: '13:00', location: 'Auditorium Block', fee: 120, capacity: 80 },
        { name: 'Robotics Challenge', clubIndex: 2, category: 'Competition', date: '2027-03-05', start: '09:30', end: '15:30', location: 'Tech Arena', fee: 200, capacity: 90 },
        { name: 'Startup Pitch Fest', clubIndex: 3, category: 'Business', date: '2027-03-12', start: '11:00', end: '16:00', location: 'Business Lab', fee: 80, capacity: 70 },
        { name: 'Annual Cultural Night', clubIndex: 4, category: 'Cultural', date: '2027-03-20', start: '18:00', end: '22:00', location: 'Open Air Theatre', fee: 50, capacity: 200 },
        { name: 'Photography Walk', clubIndex: 5, category: 'General', date: '2027-04-04', start: '07:00', end: '10:00', location: 'City Heritage Track', fee: 30, capacity: 60 },
        { name: 'Inter-Department Cricket League', clubIndex: 6, category: 'Sports', date: '2027-04-11', start: '08:00', end: '15:00', location: 'Sports Ground', fee: 0, capacity: 150 },
        { name: 'Debate Championship', clubIndex: 7, category: 'Literary', date: '2027-04-18', start: '11:00', end: '15:00', location: 'Seminar Hall 2', fee: 25, capacity: 65 },
        { name: 'IoT Design Workshop', clubIndex: 8, category: 'Workshop', date: '2027-05-02', start: '10:30', end: '13:30', location: 'Electronics Lab', fee: 110, capacity: 75 },
        { name: 'Design Thinking Sprint', clubIndex: 9, category: 'Workshop', date: '2027-05-15', start: '09:00', end: '12:00', location: 'Innovation Studio', fee: 90, capacity: 55 },
        { name: 'Campus Tech Expo', clubIndex: 0, category: 'Technical', date: '2027-05-27', start: '10:00', end: '16:00', location: 'Convocation Hall', fee: 100, capacity: 130 },
        { name: 'Women in STEM Talk', clubIndex: 1, category: 'General', date: '2027-06-03', start: '15:00', end: '17:30', location: 'Main Auditorium', fee: 0, capacity: 90 },
        { name: 'Drone Innovation Showdown', clubIndex: 2, category: 'Competition', date: '2027-06-18', start: '09:00', end: '14:00', location: 'Robotics Lab', fee: 180, capacity: 70 },
        { name: 'Business Case Challenge', clubIndex: 3, category: 'Business', date: '2027-07-02', start: '09:00', end: '13:00', location: 'Mini Auditorium', fee: 65, capacity: 60 },
        { name: 'Classical Dance Festival', clubIndex: 4, category: 'Cultural', date: '2027-07-10', start: '17:30', end: '21:30', location: 'Performing Arts Hall', fee: 40, capacity: 110 },
        { name: 'Campus Photography Contest', clubIndex: 5, category: 'Competition', date: '2027-07-25', start: '08:30', end: '12:30', location: 'Lakefront Campus', fee: 35, capacity: 80 },
        { name: 'Athletic Meet 2027', clubIndex: 6, category: 'Sports', date: '2027-08-06', start: '08:00', end: '17:00', location: 'Track & Field Arena', fee: 0, capacity: 180 },
        { name: 'Poetry & Prose Open Mic', clubIndex: 7, category: 'Literary', date: '2027-08-14', start: '18:00', end: '20:30', location: 'Reading Lounge', fee: 20, capacity: 70 },
        { name: 'Embedded Systems Lab', clubIndex: 8, category: 'Workshop', date: '2027-08-22', start: '10:00', end: '14:00', location: 'Embedded Systems Lab', fee: 90, capacity: 65 },
        { name: 'Brand Design Studio', clubIndex: 9, category: 'Competition', date: '2027-09-01', start: '10:00', end: '14:30', location: 'Creative Lab', fee: 75, capacity: 50 },
        { name: 'Coding Sprint Finale', clubIndex: 0, category: 'Technical', date: '2027-09-11', start: '09:30', end: '17:30', location: 'Innovation Center', fee: 140, capacity: 110 },
        { name: 'Machine Learning Meetup', clubIndex: 1, category: 'General', date: '2027-09-25', start: '15:00', end: '18:00', location: 'Seminar Hall 1', fee: 50, capacity: 95 },
        { name: 'Entrepreneurship Networking Night', clubIndex: 3, category: 'Business', date: '2027-10-03', start: '18:30', end: '21:00', location: 'Startup Hub', fee: 60, capacity: 80 },
        { name: 'Campus Talent Hunt', clubIndex: 4, category: 'Cultural', date: '2027-10-17', start: '17:00', end: '21:00', location: 'Main Auditorium', fee: 45, capacity: 120 },
    ];

    const insertClub = db.prepare('INSERT INTO CLUB (club_name) VALUES (?)');
    const clubIds = clubs.map(clubName => Number(insertClub.run(clubName).lastInsertRowid));

    const studentEntries = [];
    let nameIndex = 0;
    for (const department of departments) {
        for (let academicYear = 1; academicYear <= 4; academicYear += 1) {
            const total = department.yearCounts[academicYear - 1];
            for (let offset = 0; offset < total; offset += 1) {
                const firstName = firstNames[(nameIndex + offset) % firstNames.length];
                const lastName = lastNames[(nameIndex + offset * 2) % lastNames.length];
                const studentNumber = studentEntries.length + 1;
                const usn = `2BU${String(24 + ((studentNumber + academicYear) % 8)).padStart(2, '0')}${department.usnCode}${String(studentNumber).padStart(3, '0')}`;
                const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${studentNumber}@clubhub.test`;
                studentEntries.push({
                    fname: firstName,
                    lname: lastName,
                    year: academicYear,
                    branch: department.name,
                    department_code: department.code,
                    usn,
                    email,
                    created_at: '2026-01-01T09:00:00',
                    updated_at: '2026-01-01T09:00:00',
                });
            }
            nameIndex += total;
        }
    }

    const insertStudent = db.prepare(`
        INSERT INTO STUDENT (fname, lname, year, branch, department_code, usn, email, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const demoPasswordHash = bcrypt.hashSync('CampusPass123', 12);
    for (const student of studentEntries) {
        insertStudent.run(
            student.fname,
            student.lname,
            student.year,
            student.branch,
            student.department_code,
            student.usn,
            student.email,
            student.created_at,
            student.updated_at,
        );
    }

    const studentIds = db.prepare('SELECT student_id FROM STUDENT ORDER BY student_id').all().map(row => row.student_id);
    const demoStudentIds = studentIds.slice(0, 12);
    const updateDemoAccount = db.prepare('UPDATE STUDENT SET password_hash = ?, account_status = ? WHERE student_id = ?');
    for (const studentId of demoStudentIds) {
        updateDemoAccount.run(demoPasswordHash, 'active', studentId);
    }

    const adminPasswordHash = bcrypt.hashSync('ClubAdmin@2025', 12);
    const organizerPasswordHash = bcrypt.hashSync('Organizer@2025', 12);
    db.prepare('INSERT INTO ADMINS (email, password_hash, account_role, club_id) VALUES (?, ?, ?, ?)')
        .run('admin@clubhub.test', adminPasswordHash, 'admin', null);
    db.prepare('INSERT INTO ADMINS (email, password_hash, account_role, club_id) VALUES (?, ?, ?, ?)')
        .run('organizer@clubhub.test', organizerPasswordHash, 'organizer', clubIds[0]);

    const insertMembership = db.prepare('INSERT INTO CLUB_MEMBERSHIPS (student_id, club_id, designation, status, joined_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
    const membershipDates = ['2025-08-14T09:00:00', '2025-09-02T10:00:00', '2025-09-15T12:30:00', '2025-10-04T08:15:00'];
    studentIds.forEach((studentId, index) => {
        const clubId = clubIds[index % clubIds.length];
        const designation = index % 6 === 0 ? 'officer' : (index % 9 === 0 ? 'president' : 'member');
        insertMembership.run(studentId, clubId, designation, 'active', membershipDates[index % membershipDates.length], membershipDates[index % membershipDates.length]);
    });

    const insertEvent = db.prepare(`
        INSERT INTO EVENT (
            event_name, event_date, location, club_id, description, category, organizer,
            organizer_id, end_date, start_time, end_time, timezone, entry_fee, capacity,
            registration_opens_at, registration_closes_at, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const eventRows = eventTemplates.map((eventTemplate) => {
        const registrationOpensAt = `${eventTemplate.date}T08:00`;
        const registrationClosesAt = `${eventTemplate.date}T17:00`;
        const endDate = eventTemplate.date;
        const row = insertEvent.run(
            eventTemplate.name,
            eventTemplate.date,
            eventTemplate.location,
            clubIds[eventTemplate.clubIndex],
            `${eventTemplate.name} is a campus event bringing together students from across the college to learn, collaborate, and compete in a welcoming environment.`,
            eventTemplate.category,
            clubs[eventTemplate.clubIndex],
            null,
            endDate,
            eventTemplate.start,
            eventTemplate.end,
            'Asia/Kolkata',
            eventTemplate.fee,
            eventTemplate.capacity,
            registrationOpensAt,
            registrationClosesAt,
            'published',
        );
        return { event_id: Number(row.lastInsertRowid), ...eventTemplate };
    });

    const insertRegistration = db.prepare(`
        INSERT INTO REGISTRATION (student_id, event_id, entry_fee, status, waitlist_position, created_at, updated_at, conflict_decision)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    eventRows.forEach((event, eventIndex) => {
        const confirmedSeats = Math.min(18 + (eventIndex % 5) * 4, event.capacity - 3);
        const startOffset = (eventIndex * 7) % studentIds.length;
        const selectedStudents = [];
        for (let i = 0; selectedStudents.length < confirmedSeats + 4 && i < studentIds.length * 2; i += 1) {
            const id = studentIds[(startOffset + i) % studentIds.length];
            if (selectedStudents.includes(id)) continue;
            selectedStudents.push(id);
        }
        for (let i = 0; i < confirmedSeats; i += 1) {
            insertRegistration.run(selectedStudents[i], event.event_id, event.fee, 'confirmed', null, '2026-01-20T10:00:00', '2026-01-20T10:00:00', 'none');
        }
        for (let i = confirmedSeats; i < Math.min(selectedStudents.length, confirmedSeats + 4); i += 1) {
            insertRegistration.run(selectedStudents[i], event.event_id, event.fee, 'waitlisted', i - confirmedSeats + 1, '2026-01-22T11:00:00', '2026-01-22T11:00:00', 'none');
        }
    });

    db.prepare('UPDATE REGISTRATION SET entry_fee = 0 WHERE event_id IN (SELECT event_id FROM EVENT WHERE entry_fee = 0)');
}

module.exports = { createDatabase, initializeSchema, migrateDatabase };
