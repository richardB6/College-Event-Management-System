ALTER TABLE NOTIFICATIONS ADD COLUMN category TEXT NOT NULL DEFAULT 'important_updates'
    CHECK(category IN ('club_updates', 'event_announcements', 'registrations', 'important_updates'));
ALTER TABLE NOTIFICATIONS ADD COLUMN club_id INTEGER REFERENCES CLUB(club_id) ON DELETE SET NULL;
ALTER TABLE NOTIFICATIONS ADD COLUMN link TEXT;

UPDATE NOTIFICATIONS SET category = CASE
    WHEN notification_type IN ('event_announcement', 'event_reminder') THEN 'event_announcements'
    WHEN notification_type LIKE 'registration_%' OR notification_type LIKE 'waitlist_%' THEN 'registrations'
    WHEN notification_type LIKE 'club_%' THEN 'club_updates'
    ELSE 'important_updates'
END;

CREATE INDEX notification_category_idx
    ON NOTIFICATIONS(recipient_role, recipient_id, category, notification_id DESC);

CREATE TABLE EVENT_NOTIFICATION_STATE (
    event_id INTEGER PRIMARY KEY REFERENCES EVENT(event_id) ON DELETE CASCADE,
    registration_open INTEGER NOT NULL DEFAULT 0 CHECK(registration_open IN (0, 1)),
    occurrence INTEGER NOT NULL DEFAULT 0 CHECK(occurrence >= 0),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO EVENT_NOTIFICATION_STATE (event_id, registration_open, occurrence)
SELECT event_id, CASE WHEN status = 'published' THEN 1 ELSE 0 END, 0
FROM EVENT;
