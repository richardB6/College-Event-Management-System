function createNotification(db, {
    recipientRole,
    recipientId,
    type,
    message,
    eventId = null,
    dedupeKey = null,
}) {
    const result = db.prepare(`
        INSERT OR IGNORE INTO NOTIFICATIONS
            (recipient_role, recipient_id, notification_type, message, event_id, dedupe_key)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(recipientRole, recipientId, type, message, eventId, dedupeKey);
    return result.changes === 1 ? Number(result.lastInsertRowid) : null;
}

function listNotifications(db, recipientRole, recipientId, { page = 1, limit = 25 } = {}) {
    const offset = (page - 1) * limit;
    const total = db.prepare(`
        SELECT COUNT(*) AS count FROM NOTIFICATIONS
        WHERE recipient_role = ? AND recipient_id = ?
    `).get(recipientRole, recipientId).count;
    const unread = db.prepare(`
        SELECT COUNT(*) AS count FROM NOTIFICATIONS
        WHERE recipient_role = ? AND recipient_id = ? AND read_at IS NULL
    `).get(recipientRole, recipientId).count;
    const items = db.prepare(`
        SELECT notification_id, notification_type, message, event_id, created_at, read_at
        FROM NOTIFICATIONS
        WHERE recipient_role = ? AND recipient_id = ?
        ORDER BY notification_id DESC LIMIT ? OFFSET ?
    `).all(recipientRole, recipientId, limit, offset);
    return { items, page, limit, total, unread };
}

module.exports = { createNotification, listNotifications };
