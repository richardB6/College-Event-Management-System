require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ============================================
// STUDENT ROUTES
// ============================================

app.get('/api/students', (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM STUDENT ORDER BY student_id').all();
        res.json(rows);
    } catch (err) {
        console.error('Error fetching students:', err);
        res.status(500).json({ error: 'Failed to fetch students' });
    }
});

app.post('/api/students', (req, res) => {
    try {
        const { fname, lname, year, branch } = req.body;
        if (!fname || !lname || !year || !branch) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        const result = db.prepare(
            'INSERT INTO STUDENT (fname, lname, year, branch) VALUES (?, ?, ?, ?)'
        ).run(fname, lname, year, branch);
        res.status(201).json({ message: 'Student added', student_id: result.lastInsertRowid });
    } catch (err) {
        console.error('Error adding student:', err);
        res.status(500).json({ error: 'Failed to add student' });
    }
});

app.put('/api/students/:id', (req, res) => {
    try {
        const { fname, lname, year, branch } = req.body;
        const { id } = req.params;
        if (!fname || !lname || !year || !branch) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        const result = db.prepare(
            'UPDATE STUDENT SET fname = ?, lname = ?, year = ?, branch = ? WHERE student_id = ?'
        ).run(fname, lname, year, branch, id);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Student not found' });
        }
        res.json({ message: 'Student updated' });
    } catch (err) {
        console.error('Error updating student:', err);
        res.status(500).json({ error: 'Failed to update student' });
    }
});

app.delete('/api/students/:id', (req, res) => {
    try {
        const { id } = req.params;
        const result = db.prepare('DELETE FROM STUDENT WHERE student_id = ?').run(id);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Student not found' });
        }
        res.json({ message: 'Student deleted' });
    } catch (err) {
        console.error('Error deleting student:', err);
        res.status(500).json({ error: 'Failed to delete student' });
    }
});

// ============================================
// CLUB ROUTES
// ============================================

app.get('/api/clubs', (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM CLUB ORDER BY club_id').all();
        res.json(rows);
    } catch (err) {
        console.error('Error fetching clubs:', err);
        res.status(500).json({ error: 'Failed to fetch clubs' });
    }
});

app.post('/api/clubs', (req, res) => {
    try {
        const { club_name } = req.body;
        if (!club_name) {
            return res.status(400).json({ error: 'Club name is required' });
        }
        const result = db.prepare('INSERT INTO CLUB (club_name) VALUES (?)').run(club_name);
        res.status(201).json({ message: 'Club added', club_id: result.lastInsertRowid });
    } catch (err) {
        console.error('Error adding club:', err);
        res.status(500).json({ error: 'Failed to add club' });
    }
});

app.put('/api/clubs/:id', (req, res) => {
    try {
        const { club_name } = req.body;
        const { id } = req.params;
        if (!club_name) {
            return res.status(400).json({ error: 'Club name is required' });
        }
        const result = db.prepare('UPDATE CLUB SET club_name = ? WHERE club_id = ?').run(club_name, id);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Club not found' });
        }
        res.json({ message: 'Club updated' });
    } catch (err) {
        console.error('Error updating club:', err);
        res.status(500).json({ error: 'Failed to update club' });
    }
});

app.delete('/api/clubs/:id', (req, res) => {
    try {
        const { id } = req.params;
        const result = db.prepare('DELETE FROM CLUB WHERE club_id = ?').run(id);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Club not found' });
        }
        res.json({ message: 'Club deleted' });
    } catch (err) {
        console.error('Error deleting club:', err);
        res.status(500).json({ error: 'Failed to delete club' });
    }
});

// ============================================
// EVENT ROUTES
// ============================================

app.get('/api/events', (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT e.*, c.club_name 
            FROM EVENT e 
            JOIN CLUB c ON e.club_id = c.club_id 
            ORDER BY e.event_id
        `).all();
        res.json(rows);
    } catch (err) {
        console.error('Error fetching events:', err);
        res.status(500).json({ error: 'Failed to fetch events' });
    }
});

app.post('/api/events', (req, res) => {
    try {
        const { event_name, event_date, location, club_id } = req.body;
        if (!event_name || !event_date || !location || !club_id) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        const result = db.prepare(
            'INSERT INTO EVENT (event_name, event_date, location, club_id) VALUES (?, ?, ?, ?)'
        ).run(event_name, event_date, location, club_id);
        res.status(201).json({ message: 'Event added', event_id: result.lastInsertRowid });
    } catch (err) {
        console.error('Error adding event:', err);
        res.status(500).json({ error: 'Failed to add event' });
    }
});

app.put('/api/events/:id', (req, res) => {
    try {
        const { event_name, event_date, location, club_id } = req.body;
        const { id } = req.params;
        if (!event_name || !event_date || !location || !club_id) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        const result = db.prepare(
            'UPDATE EVENT SET event_name = ?, event_date = ?, location = ?, club_id = ? WHERE event_id = ?'
        ).run(event_name, event_date, location, club_id, id);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }
        res.json({ message: 'Event updated' });
    } catch (err) {
        console.error('Error updating event:', err);
        res.status(500).json({ error: 'Failed to update event' });
    }
});

app.delete('/api/events/:id', (req, res) => {
    try {
        const { id } = req.params;
        const result = db.prepare('DELETE FROM EVENT WHERE event_id = ?').run(id);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }
        res.json({ message: 'Event deleted' });
    } catch (err) {
        console.error('Error deleting event:', err);
        res.status(500).json({ error: 'Failed to delete event' });
    }
});

// ============================================
// REGISTRATION ROUTES
// ============================================

app.get('/api/registrations', (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT 
                r.reg_id,
                r.student_id,
                r.event_id,
                r.entry_fee,
                (s.fname || ' ' || s.lname) AS student_name,
                e.event_name,
                c.club_name
            FROM REGISTRATION r
            JOIN STUDENT s ON r.student_id = s.student_id
            JOIN EVENT e ON r.event_id = e.event_id
            JOIN CLUB c ON e.club_id = c.club_id
            ORDER BY r.reg_id
        `).all();
        res.json(rows);
    } catch (err) {
        console.error('Error fetching registrations:', err);
        res.status(500).json({ error: 'Failed to fetch registrations' });
    }
});

app.post('/api/registrations', (req, res) => {
    try {
        const { student_id, event_id, entry_fee } = req.body;
        if (!student_id || !event_id || entry_fee === undefined || entry_fee === '') {
            return res.status(400).json({ error: 'All fields are required' });
        }
        const result = db.prepare(
            'INSERT INTO REGISTRATION (student_id, event_id, entry_fee) VALUES (?, ?, ?)'
        ).run(student_id, event_id, entry_fee);
        res.status(201).json({ message: 'Registration added', reg_id: result.lastInsertRowid });
    } catch (err) {
        console.error('Error adding registration:', err);
        res.status(500).json({ error: 'Failed to add registration' });
    }
});

app.delete('/api/registrations/:id', (req, res) => {
    try {
        const { id } = req.params;
        const result = db.prepare('DELETE FROM REGISTRATION WHERE reg_id = ?').run(id);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Registration not found' });
        }
        res.json({ message: 'Registration deleted' });
    } catch (err) {
        console.error('Error deleting registration:', err);
        res.status(500).json({ error: 'Failed to delete registration' });
    }
});

// ============================================
// DASHBOARD COUNTS
// ============================================
app.get('/api/dashboard', (req, res) => {
    try {
        const students = db.prepare('SELECT COUNT(*) AS count FROM STUDENT').get().count;
        const clubs = db.prepare('SELECT COUNT(*) AS count FROM CLUB').get().count;
        const events = db.prepare('SELECT COUNT(*) AS count FROM EVENT').get().count;
        const registrations = db.prepare('SELECT COUNT(*) AS count FROM REGISTRATION').get().count;
        res.json({ students, clubs, events, registrations });
    } catch (err) {
        console.error('Error fetching dashboard data:', err);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

// ============================================
// ADMIN AUTH ROUTE
// ============================================
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    // Hardcoded password for this mini project
    if (password === 'admin123') {
        res.json({ success: true, token: 'admin_authenticated_token' });
    } else {
        res.status(401).json({ error: 'Invalid password' });
    }
});

// ============================================
// Start Server
// ============================================
app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
});
