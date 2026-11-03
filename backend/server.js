require('dotenv').config();

const path = require('path');
const express = require('express');
const db = require('./db');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT) || 3000;
const { app, sessionStore, processExpiredPromotions } = createApp({ db });
const frontendDirectory = path.join(__dirname, '..', 'frontend', 'dist');
const promotionTimer = setInterval(() => {
    try {
        processExpiredPromotions();
    } catch (error) {
        console.error(`Waitlist promotion processing failed: ${error?.code || error?.name || 'Error'}`);
    }
}, 60 * 1000);
promotionTimer.unref();

app.get(['/index.html'], (_req, res) => res.redirect(302, '/'));
app.get(['/admin-login.html'], (_req, res) => res.redirect(302, '/admin/login'));
app.get(['/admin.html'], (_req, res) => res.redirect(302, '/admin'));
app.get(['/admin-clubs.html'], (_req, res) => res.redirect(302, '/admin/clubs'));
app.get(['/admin-events.html'], (_req, res) => res.redirect(302, '/admin/events'));
app.get(['/students.html'], (_req, res) => res.redirect(302, '/admin/students'));
app.get(['/registrations.html'], (_req, res) => res.redirect(302, '/student'));

app.use(express.static(frontendDirectory, { index: false, maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(frontendDirectory, 'index.html'), error => {
        if (error) next(error);
    });
});

const server = app.listen(PORT, () => {
    console.log(`ClubHub server listening on http://localhost:${PORT}`);
});

function shutdown() {
    clearInterval(promotionTimer);
    server.close(() => {
        sessionStore.close();
        db.close();
        process.exit(0);
    });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

module.exports = { app, server };
