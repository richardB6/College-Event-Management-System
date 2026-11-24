function createNotification(db, {
    recipientRole,
    recipientId,
    type,
    message,
    eventId = null,
    clubId = null,
    category,
    link,
    dedupeKey = null,
}) {
    const event = eventId
        ? db.prepare('SELECT club_id FROM EVENT WHERE event_id = ?').get(eventId)
        : null;
    const resolvedCategory = category || (
        type === 'event_announcement' || type === 'event_reminder' ? 'event_announcements'
            : type.startsWith('registration_') || type.startsWith('waitlist_') ? 'registrations'
                : type.startsWith('club_') ? 'club_updates'
                    : 'important_updates'
    );
    const resolvedLink = link || (eventId ? `/events/${eventId}` : clubId ? `/clubs/${clubId}` : null);
    const result = db.prepare(`
        INSERT OR IGNORE INTO NOTIFICATIONS
            (recipient_role, recipient_id, notification_type, message, event_id, dedupe_key, category, club_id, link)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(recipientRole, recipientId, type, message, eventId, dedupeKey, resolvedCategory, clubId ?? event?.club_id ?? null, resolvedLink);
    return result.changes === 1 ? Number(result.lastInsertRowid) : null;
}

function listNotifications(db, recipientRole, recipientId, { page = 1, limit = 25, category } = {}) {
    const offset = (page - 1) * limit;
    const filter = category ? ' AND category = ?' : '';
    const parameters = category ? [recipientRole, recipientId, category] : [recipientRole, recipientId];
    const total = db.prepare(`
        SELECT COUNT(*) AS count FROM NOTIFICATIONS
        WHERE recipient_role = ? AND recipient_id = ?${filter}
    `).get(...parameters).count;
    const unread = db.prepare(`
        SELECT COUNT(*) AS count FROM NOTIFICATIONS
        WHERE recipient_role = ? AND recipient_id = ? AND read_at IS NULL
    `).get(recipientRole, recipientId).count;
    const items = db.prepare(`
        SELECT notification_id, notification_type, category, message, event_id, club_id, link, created_at, read_at
        FROM NOTIFICATIONS
        WHERE recipient_role = ? AND recipient_id = ?${filter}
        ORDER BY notification_id DESC LIMIT ? OFFSET ?
    `).all(...parameters, limit, offset);
    return { items, page, limit, total, unread };
}

module.exports = { createNotification, listNotifications };
