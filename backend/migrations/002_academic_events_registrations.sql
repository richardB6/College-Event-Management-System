CREATE TABLE DEPARTMENTS (
    department_code TEXT PRIMARY KEY,
    department_name TEXT NOT NULL UNIQUE
);

INSERT INTO DEPARTMENTS (department_code, department_name) VALUES
    ('CSE', 'Computer Science and Engineering'),
    ('MECHANICAL', 'Mechanical Engineering'),
    ('CSBS', 'Computer Science and Business Systems'),
    ('CIVIL', 'Civil Engineering'),
    ('AIML', 'Artificial Intelligence and Machine Learning');

ALTER TABLE STUDENT ADD COLUMN department_code TEXT REFERENCES DEPARTMENTS(department_code);

UPDATE STUDENT
SET department_code = CASE lower(trim(branch))
    WHEN 'computer science' THEN 'CSE'
    WHEN 'computer science and engineering' THEN 'CSE'
    WHEN 'cse' THEN 'CSE'
    WHEN 'mechanical' THEN 'MECHANICAL'
    WHEN 'mechanical engineering' THEN 'MECHANICAL'
    WHEN 'csbs' THEN 'CSBS'
    WHEN 'computer science and business systems' THEN 'CSBS'
    WHEN 'civil' THEN 'CIVIL'
    WHEN 'civil engineering' THEN 'CIVIL'
    WHEN 'aiml' THEN 'AIML'
    WHEN 'artificial intelligence and machine learning' THEN 'AIML'
    ELSE NULL
END;

CREATE INDEX student_department_year_idx ON STUDENT(department_code, year);

CREATE TRIGGER student_year_insert
BEFORE INSERT ON STUDENT
WHEN NEW.year < 1 OR NEW.year > 6
BEGIN
    SELECT RAISE(ABORT, 'INVALID_ACADEMIC_YEAR');
END;

CREATE TRIGGER student_year_update
BEFORE UPDATE OF year ON STUDENT
WHEN NEW.year < 1 OR NEW.year > 6
BEGIN
    SELECT RAISE(ABORT, 'INVALID_ACADEMIC_YEAR');
END;

CREATE TABLE CLUB_MEMBERSHIPS (
    membership_id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES STUDENT(student_id) ON DELETE CASCADE,
    club_id INTEGER NOT NULL REFERENCES CLUB(club_id) ON DELETE CASCADE,
    designation TEXT NOT NULL DEFAULT 'member'
        CHECK(designation IN ('member', 'officer', 'vice_president', 'president')),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'left', 'suspended')),
    joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX club_membership_active_unique
    ON CLUB_MEMBERSHIPS(student_id, club_id) WHERE status = 'active';
CREATE INDEX club_membership_club_status_idx ON CLUB_MEMBERSHIPS(club_id, status, student_id);

ALTER TABLE EVENT ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE EVENT ADD COLUMN category TEXT NOT NULL DEFAULT 'Other';
ALTER TABLE EVENT ADD COLUMN organizer TEXT NOT NULL DEFAULT '';
ALTER TABLE EVENT ADD COLUMN organizer_id INTEGER REFERENCES ADMINS(admin_id) ON DELETE SET NULL;
ALTER TABLE EVENT ADD COLUMN end_date TEXT;
ALTER TABLE EVENT ADD COLUMN start_time TEXT NOT NULL DEFAULT '09:00';
ALTER TABLE EVENT ADD COLUMN end_time TEXT NOT NULL DEFAULT '10:00';
ALTER TABLE EVENT ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata';
ALTER TABLE EVENT ADD COLUMN entry_fee REAL NOT NULL DEFAULT 0 CHECK(entry_fee >= 0);
ALTER TABLE EVENT ADD COLUMN capacity INTEGER NOT NULL DEFAULT 1000 CHECK(capacity > 0);
ALTER TABLE EVENT ADD COLUMN registration_opens_at TEXT;
ALTER TABLE EVENT ADD COLUMN registration_closes_at TEXT;
ALTER TABLE EVENT ADD COLUMN status TEXT NOT NULL DEFAULT 'published'
    CHECK(status IN ('draft', 'published', 'cancelled', 'completed'));

UPDATE EVENT SET end_date = event_date WHERE end_date IS NULL;
CREATE INDEX event_schedule_idx ON EVENT(event_date, start_time, end_date, end_time);
CREATE INDEX event_status_date_idx ON EVENT(status, event_date);

ALTER TABLE REGISTRATION ADD COLUMN status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK(status IN ('confirmed', 'waitlisted', 'promotion_pending', 'cancelled', 'attended', 'promotion_expired'));
ALTER TABLE REGISTRATION ADD COLUMN waitlist_position INTEGER;
ALTER TABLE REGISTRATION ADD COLUMN promotion_expires_at TEXT;
ALTER TABLE REGISTRATION ADD COLUMN created_at TEXT;
ALTER TABLE REGISTRATION ADD COLUMN updated_at TEXT;
ALTER TABLE REGISTRATION ADD COLUMN conflict_decision TEXT
    CHECK(conflict_decision IS NULL OR conflict_decision IN ('none', 'overridden'));
UPDATE REGISTRATION SET created_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP;

CREATE INDEX registration_student_status_idx ON REGISTRATION(student_id, status);
CREATE INDEX registration_event_status_idx ON REGISTRATION(event_id, status, created_at, reg_id);

CREATE TRIGGER registration_active_duplicate_insert
BEFORE INSERT ON REGISTRATION
WHEN NEW.status IN ('confirmed', 'waitlisted', 'promotion_pending')
 AND EXISTS (
    SELECT 1 FROM REGISTRATION
    WHERE student_id = NEW.student_id
      AND event_id = NEW.event_id
      AND status IN ('confirmed', 'waitlisted', 'promotion_pending')
 )
BEGIN
    SELECT RAISE(ABORT, 'ACTIVE_REGISTRATION_EXISTS');
END;

CREATE TRIGGER registration_active_duplicate_update
BEFORE UPDATE OF student_id, event_id, status ON REGISTRATION
WHEN NEW.status IN ('confirmed', 'waitlisted', 'promotion_pending')
 AND EXISTS (
    SELECT 1 FROM REGISTRATION
    WHERE student_id = NEW.student_id
      AND event_id = NEW.event_id
      AND reg_id != NEW.reg_id
      AND status IN ('confirmed', 'waitlisted', 'promotion_pending')
 )
BEGIN
    SELECT RAISE(ABORT, 'ACTIVE_REGISTRATION_EXISTS');
END;

CREATE TRIGGER registration_capacity_insert
BEFORE INSERT ON REGISTRATION
WHEN NEW.status IN ('confirmed', 'promotion_pending')
 AND (
    SELECT COUNT(*) FROM REGISTRATION
    WHERE event_id = NEW.event_id
      AND status IN ('confirmed', 'promotion_pending')
 ) >= (
    SELECT capacity FROM EVENT WHERE event_id = NEW.event_id
 )
BEGIN
    SELECT RAISE(ABORT, 'EVENT_CAPACITY_REACHED');
END;

CREATE TRIGGER registration_capacity_update
BEFORE UPDATE OF event_id, status ON REGISTRATION
WHEN NEW.status IN ('confirmed', 'promotion_pending')
 AND (
    SELECT COUNT(*) FROM REGISTRATION
    WHERE event_id = NEW.event_id
      AND status IN ('confirmed', 'promotion_pending')
      AND reg_id != NEW.reg_id
 ) >= (
    SELECT capacity FROM EVENT WHERE event_id = NEW.event_id
 )
BEGIN
    SELECT RAISE(ABORT, 'EVENT_CAPACITY_REACHED');
END;

CREATE TRIGGER event_capacity_not_below_registrations
BEFORE UPDATE OF capacity ON EVENT
WHEN NEW.capacity < (
    SELECT COUNT(*) FROM REGISTRATION
    WHERE event_id = NEW.event_id
      AND status IN ('confirmed', 'promotion_pending')
)
BEGIN
    SELECT RAISE(ABORT, 'CAPACITY_BELOW_REGISTRATIONS');
END;

CREATE TRIGGER event_status_transition
BEFORE UPDATE OF status ON EVENT
WHEN OLD.status != NEW.status
 AND NOT (
    (OLD.status = 'draft' AND NEW.status IN ('published', 'cancelled'))
    OR (OLD.status = 'published' AND NEW.status IN ('cancelled', 'completed'))
 )
BEGIN
    SELECT RAISE(ABORT, 'INVALID_EVENT_STATUS_TRANSITION');
END;

CREATE TABLE WAITLIST_HISTORY (
    history_id INTEGER PRIMARY KEY AUTOINCREMENT,
    registration_id INTEGER NOT NULL REFERENCES REGISTRATION(reg_id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES STUDENT(student_id) ON DELETE CASCADE,
    event_id INTEGER NOT NULL REFERENCES EVENT(event_id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK(action IN ('joined', 'promoted', 'confirmed', 'expired', 'cancelled')),
    position INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX waitlist_history_event_idx ON WAITLIST_HISTORY(event_id, history_id);

CREATE TABLE NOTIFICATIONS (
    notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_role TEXT NOT NULL CHECK(recipient_role IN ('student', 'admin', 'organizer')),
    recipient_id INTEGER NOT NULL,
    notification_type TEXT NOT NULL,
    message TEXT NOT NULL,
    event_id INTEGER REFERENCES EVENT(event_id) ON DELETE SET NULL,
    dedupe_key TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at TEXT
);

CREATE UNIQUE INDEX notification_dedupe_idx
    ON NOTIFICATIONS(recipient_role, recipient_id, dedupe_key)
    WHERE dedupe_key IS NOT NULL;
CREATE INDEX notification_inbox_idx
    ON NOTIFICATIONS(recipient_role, recipient_id, read_at, notification_id DESC);

CREATE TABLE SCHEDULE_CONFLICTS (
    conflict_id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_a_id INTEGER NOT NULL REFERENCES EVENT(event_id) ON DELETE CASCADE,
    event_b_id INTEGER NOT NULL REFERENCES EVENT(event_id) ON DELETE CASCADE,
    subject_role TEXT NOT NULL CHECK(subject_role IN ('student', 'organizer', 'venue')),
    subject_id TEXT NOT NULL,
    severity TEXT NOT NULL CHECK(severity IN ('warning', 'high')),
    decision TEXT NOT NULL DEFAULT 'pending'
        CHECK(decision IN ('pending', 'overridden', 'resolved')),
    detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notified_at TEXT,
    CHECK(event_a_id < event_b_id),
    UNIQUE(event_a_id, event_b_id, subject_role, subject_id)
);

CREATE INDEX schedule_conflict_detected_idx ON SCHEDULE_CONFLICTS(detected_at DESC);

CREATE TABLE APP_SETTINGS (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO APP_SETTINGS (setting_key, setting_value)
VALUES ('waitlist_confirmation_minutes', '30');

DROP INDEX audit_logs_created_at_idx;
DROP INDEX audit_logs_actor_idx;
ALTER TABLE AUDIT_LOGS RENAME TO AUDIT_LOGS_V1;
CREATE TABLE AUDIT_LOGS (
    audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER NOT NULL,
    actor_role TEXT NOT NULL CHECK(actor_role IN ('student', 'admin', 'organizer')),
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    details TEXT
);
INSERT INTO AUDIT_LOGS (audit_id, actor_id, actor_role, action, resource_type, resource_id, created_at)
SELECT audit_id, actor_id, actor_role, action, resource_type, resource_id, created_at FROM AUDIT_LOGS_V1;
DROP TABLE AUDIT_LOGS_V1;
CREATE INDEX audit_logs_created_at_idx ON AUDIT_LOGS(created_at);
CREATE INDEX audit_logs_actor_idx ON AUDIT_LOGS(actor_role, actor_id, audit_id);

ALTER TABLE ADMINS ADD COLUMN account_role TEXT NOT NULL DEFAULT 'admin'
    CHECK(account_role IN ('admin', 'organizer'));
ALTER TABLE ADMINS ADD COLUMN club_id INTEGER REFERENCES CLUB(club_id) ON DELETE SET NULL;
CREATE INDEX admins_role_club_idx ON ADMINS(account_role, club_id);
