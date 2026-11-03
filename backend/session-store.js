const session = require('express-session');

class SQLiteSessionStore extends session.Store {
    constructor(db, cleanupIntervalMs = 15 * 60 * 1000) {
        super();
        this.db = db;
        this.getSession = db.prepare('SELECT session_data FROM SESSIONS WHERE session_id = ? AND expires_at > ?');
        this.saveSession = db.prepare(`
            INSERT INTO SESSIONS (session_id, session_data, expires_at) VALUES (?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET session_data = excluded.session_data, expires_at = excluded.expires_at
        `);
        this.deleteSession = db.prepare('DELETE FROM SESSIONS WHERE session_id = ?');
        this.extendSession = db.prepare('UPDATE SESSIONS SET expires_at = ? WHERE session_id = ?');
        this.deleteExpired = db.prepare('DELETE FROM SESSIONS WHERE expires_at <= ?');
        this.cleanupTimer = setInterval(() => {
            try {
                this.deleteExpired.run(Date.now());
            } catch (error) {
                this.emit('disconnect', error);
            }
        }, cleanupIntervalMs);
        this.cleanupTimer.unref();
    }

    get(sessionId, callback) {
        try {
            const row = this.getSession.get(sessionId, Date.now());
            callback(null, row ? JSON.parse(row.session_data) : null);
        } catch (error) {
            callback(error);
        }
    }

    set(sessionId, value, callback = () => {}) {
        try {
            const expiresAt = value.cookie?.expires
                ? new Date(value.cookie.expires).getTime()
                : Date.now() + (value.cookie?.maxAge ?? 2 * 60 * 60 * 1000);
            this.saveSession.run(sessionId, JSON.stringify(value), expiresAt);
            callback(null);
        } catch (error) {
            callback(error);
        }
    }

    touch(sessionId, value, callback = () => {}) {
        try {
            const expiresAt = value.cookie?.expires
                ? new Date(value.cookie.expires).getTime()
                : Date.now() + (value.cookie?.maxAge ?? 2 * 60 * 60 * 1000);
            this.extendSession.run(expiresAt, sessionId);
            callback(null);
        } catch (error) {
            callback(error);
        }
    }

    destroy(sessionId, callback = () => {}) {
        try {
            this.deleteSession.run(sessionId);
            callback(null);
        } catch (error) {
            callback(error);
        }
    }

    close() {
        clearInterval(this.cleanupTimer);
    }
}

module.exports = SQLiteSessionStore;
