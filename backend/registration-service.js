const { asLocalDateTime, findStudentScheduleConflicts, getEventLifecycleStatus } = require('./domain');
const { createNotification } = require('./notifications');

class RegistrationError extends Error {
    constructor(status, message, code) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

function utcTimestamp(date = new Date()) {
    return date.toISOString().replace('T', ' ').slice(0, 19);
}

function getConfirmedCount(db, eventId) {
    return db.prepare(`
        SELECT COUNT(*) AS count FROM REGISTRATION
        WHERE event_id = ? AND status IN ('confirmed', 'promotion_pending')
    `).get(eventId).count;
}

function getWaitlistPosition(db, eventId, registrationId) {
    const row = db.prepare(`
        SELECT COUNT(*) AS position
        FROM REGISTRATION current
        JOIN REGISTRATION target ON target.reg_id = ?
        WHERE current.event_id = target.event_id
          AND current.status = 'waitlisted'
          AND target.status = 'waitlisted'
          AND (current.created_at < target.created_at
               OR (current.created_at = target.created_at AND current.reg_id <= target.reg_id))
    `).get(registrationId);
    return row?.position ?? 0;
}

function recordWaitlistHistory(db, registration, action, position = null) {
    db.prepare(`
        INSERT INTO WAITLIST_HISTORY (registration_id, student_id, event_id, action, position)
        VALUES (?, ?, ?, ?, ?)
    `).run(registration.reg_id, registration.student_id, registration.event_id, action, position);
}

function createRegistrationService(db) {
    function refreshWaitlistPositions(eventId) {
        db.prepare(`
            UPDATE REGISTRATION
            SET waitlist_position = (
                SELECT COUNT(*) FROM REGISTRATION prior
                WHERE prior.event_id = REGISTRATION.event_id
                  AND prior.status = 'waitlisted'
                  AND (prior.created_at < REGISTRATION.created_at
                       OR (prior.created_at = REGISTRATION.created_at AND prior.reg_id <= REGISTRATION.reg_id))
            )
            WHERE event_id = ? AND status = 'waitlisted'
        `).run(eventId);
    }

    function promoteNextInTransaction(eventId, now) {
        const event = db.prepare('SELECT * FROM EVENT WHERE event_id = ?').get(eventId);
        if (!event || event.status !== 'published') {
            refreshWaitlistPositions(eventId);
            return null;
        }
        const activeCount = getConfirmedCount(db, eventId);
        if (activeCount >= event.capacity) {
            refreshWaitlistPositions(eventId);
            return null;
        }

        const waitlisted = db.prepare(`
            SELECT r.reg_id, r.student_id, r.event_id, s.account_status
            FROM REGISTRATION r
            JOIN STUDENT s ON s.student_id = r.student_id
            WHERE r.event_id = ? AND r.status = 'waitlisted'
            ORDER BY r.created_at, r.reg_id
        `).all(eventId);
        const skipped = new Set();
        for (const candidate of waitlisted) {
            if (skipped.has(candidate.reg_id)) continue;
            if (candidate.account_status !== 'active') {
                db.prepare(`
                    UPDATE REGISTRATION SET status = 'cancelled', updated_at = ?
                    WHERE reg_id = ?
                `).run(utcTimestamp(now), candidate.reg_id);
                recordWaitlistHistory(db, candidate, 'cancelled');
                continue;
            }

            const conflicts = findStudentScheduleConflicts(db, candidate.student_id, event);
            if (conflicts.length) {
                const details = conflicts.map(conflict => conflict.event_name).join(', ');
                createNotification(db, {
                    recipientRole: 'student',
                    recipientId: candidate.student_id,
                    type: 'schedule_conflict',
                    message: `Schedule conflict: ${event.event_name} overlaps with ${details}. Review your schedule before accepting a place.`,
                    eventId,
                    dedupeKey: `waitlist-conflict:${candidate.reg_id}`,
                });
                skipped.add(candidate.reg_id);
                continue;
            }

            const minutes = Number(db.prepare(`
                SELECT setting_value FROM APP_SETTINGS WHERE setting_key = 'waitlist_confirmation_minutes'
            `).get()?.setting_value ?? 30);
            const expiresAt = new Date(now.getTime() + minutes * 60 * 1000);
            const expiresAtText = utcTimestamp(expiresAt);
            db.prepare(`
                UPDATE REGISTRATION
                SET status = 'promotion_pending', promotion_expires_at = ?, waitlist_position = NULL, updated_at = ?
                WHERE reg_id = ? AND status = 'waitlisted'
            `).run(expiresAtText, utcTimestamp(now), candidate.reg_id);
            recordWaitlistHistory(db, candidate, 'promoted');
            createNotification(db, {
                recipientRole: 'student',
                recipientId: candidate.student_id,
                type: 'waitlist_promotion',
                message: `A place is available for ${event.event_name}. Confirm within ${minutes} minutes to keep your place.`,
                eventId,
                dedupeKey: `promotion:${candidate.reg_id}:${expiresAtText}`,
            });
            refreshWaitlistPositions(eventId);
            return candidate.reg_id;
        }

        refreshWaitlistPositions(eventId);
        return null;
    }

    function processExpiredPromotions(now = new Date()) {
        const process = db.transaction(() => {
            const expired = db.prepare(`
                SELECT reg_id, student_id, event_id FROM REGISTRATION
                WHERE status = 'promotion_pending' AND promotion_expires_at <= ?
                ORDER BY promotion_expires_at, reg_id
            `).all(utcTimestamp(now));
            const affectedEvents = new Set();
            for (const registration of expired) {
                const updated = db.prepare(`
                    UPDATE REGISTRATION
                    SET status = 'promotion_expired', promotion_expires_at = NULL, updated_at = ?
                    WHERE reg_id = ? AND status = 'promotion_pending'
                `).run(utcTimestamp(now), registration.reg_id);
                if (!updated.changes) continue;
                recordWaitlistHistory(db, registration, 'expired');
                const event = db.prepare('SELECT event_name FROM EVENT WHERE event_id = ?').get(registration.event_id);
                if (event) {
                    createNotification(db, {
                        recipientRole: 'student',
                        recipientId: registration.student_id,
                        type: 'waitlist_expired',
                        message: `Your offer for ${event.event_name} expired because it was not confirmed in time.`,
                        eventId: registration.event_id,
                        dedupeKey: `promotion-expired:${registration.reg_id}`,
                    });
                }
                affectedEvents.add(registration.event_id);
            }
            for (const eventId of affectedEvents) promoteNextInTransaction(eventId, now);
            return expired.length;
        });
        return process.immediate();
    }

    function register({ studentId, eventId, allowConflicts = false, now = new Date() }) {
        const run = db.transaction(() => {
            const event = db.prepare('SELECT * FROM EVENT WHERE event_id = ?').get(eventId);
            if (!event) throw new RegistrationError(404, 'Event not found.', 'EVENT_NOT_FOUND');

            const duplicate = db.prepare(`
                SELECT reg_id FROM REGISTRATION
                WHERE student_id = ? AND event_id = ?
                  AND status IN ('confirmed', 'waitlisted', 'promotion_pending')
            `).get(studentId, eventId);
            if (duplicate) throw new RegistrationError(409, 'You are already registered for this event.', 'ALREADY_REGISTERED');

            const count = getConfirmedCount(db, eventId);
            const lifecycleStatus = getEventLifecycleStatus(event, count, now);
            if (!['registration_open', 'full'].includes(lifecycleStatus)) {
                throw new RegistrationError(409, `Registration is not open for this event (${lifecycleStatus.replaceAll('_', ' ')}).`, 'REGISTRATION_CLOSED');
            }

            const conflicts = findStudentScheduleConflicts(db, studentId, event);
            if (conflicts.length && !allowConflicts) {
                return { conflict: true, conflicts };
            }

            const isWaitlisted = count >= event.capacity;
            const createdAt = utcTimestamp(now);
            const position = isWaitlisted
                ? db.prepare(`
                    SELECT COUNT(*) AS count FROM REGISTRATION
                    WHERE event_id = ? AND status = 'waitlisted'
                `).get(eventId).count + 1
                : null;
            const inserted = db.prepare(`
                INSERT INTO REGISTRATION
                    (student_id, event_id, entry_fee, status, waitlist_position, created_at, updated_at, conflict_decision)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                studentId,
                eventId,
                event.entry_fee,
                isWaitlisted ? 'waitlisted' : 'confirmed',
                position,
                createdAt,
                createdAt,
                conflicts.length ? 'overridden' : 'none',
            );
            const registrationId = Number(inserted.lastInsertRowid);
            if (isWaitlisted) {
                recordWaitlistHistory(db, { reg_id: registrationId, student_id: studentId, event_id: eventId }, 'joined', position);
                createNotification(db, {
                    recipientRole: 'student',
                    recipientId: studentId,
                    type: 'waitlist_placement',
                    message: `All places for ${event.event_name} are currently occupied. You are waitlisted at position #${position}.`,
                    eventId,
                    dedupeKey: `waitlist:${registrationId}`,
                });
            } else {
                createNotification(db, {
                    recipientRole: 'student',
                    recipientId: studentId,
                    type: 'registration_confirmation',
                    message: `You are registered for ${event.event_name}.`,
                    eventId,
                    dedupeKey: `registration:${registrationId}`,
                });
            }

            if (conflicts.length) {
                for (const conflict of conflicts) {
                    const eventA = Math.min(eventId, conflict.event_id);
                    const eventB = Math.max(eventId, conflict.event_id);
                    db.prepare(`
                        INSERT INTO SCHEDULE_CONFLICTS
                            (event_a_id, event_b_id, subject_role, subject_id, severity, decision)
                        VALUES (?, ?, 'student', ?, 'high', 'overridden')
                        ON CONFLICT(event_a_id, event_b_id, subject_role, subject_id)
                        DO UPDATE SET decision = 'overridden'
                    `).run(eventA, eventB, String(studentId));
                    createNotification(db, {
                        recipientRole: 'student',
                        recipientId: studentId,
                        type: 'schedule_conflict',
                        message: `Schedule conflict: ${event.event_name} overlaps with ${conflict.event_name}. You chose to continue with the registration.`,
                        eventId,
                        dedupeKey: `schedule-conflict:${studentId}:${eventA}:${eventB}`,
                    });
                }
            }
            return { conflict: false, registrationId, status: isWaitlisted ? 'waitlisted' : 'confirmed', position };
        });
        return run.immediate();
    }

    function cancel({ studentId, registrationId, actor, now = new Date() }) {
        const run = db.transaction(() => {
            const registration = db.prepare(`
                SELECT r.reg_id, r.student_id, r.event_id, r.status, e.event_name
                FROM REGISTRATION r JOIN EVENT e ON e.event_id = r.event_id
                WHERE r.reg_id = ? AND r.student_id = ?
            `).get(registrationId, studentId);
            if (!registration || !['confirmed', 'waitlisted', 'promotion_pending'].includes(registration.status)) {
                throw new RegistrationError(404, 'Active registration not found.', 'REGISTRATION_NOT_FOUND');
            }
            db.prepare(`
                UPDATE REGISTRATION SET status = 'cancelled', waitlist_position = NULL,
                    promotion_expires_at = NULL, updated_at = ?
                WHERE reg_id = ?
            `).run(utcTimestamp(now), registrationId);
            if (registration.status === 'waitlisted' || registration.status === 'promotion_pending') {
                recordWaitlistHistory(db, registration, 'cancelled');
            }
            refreshWaitlistPositions(registration.event_id);
            createNotification(db, {
                recipientRole: 'student',
                recipientId: studentId,
                type: 'registration_cancellation',
                message: `Your registration for ${registration.event_name} was cancelled.`,
                eventId: registration.event_id,
                dedupeKey: `cancel:${registrationId}:${utcTimestamp(now)}`,
            });
            if (registration.status === 'confirmed' || registration.status === 'promotion_pending') {
                promoteNextInTransaction(registration.event_id, now);
            }
            if (actor) {
                db.prepare(`
                    INSERT INTO AUDIT_LOGS (actor_id, actor_role, action, resource_type, resource_id)
                    VALUES (?, ?, ?, 'registration', ?)
                `).run(actor.id, actor.role, `${actor.role}.registration.cancel`, String(registrationId));
            }
            return registration;
        });
        return run.immediate();
    }

    function confirmPromotion({ studentId, registrationId, now = new Date() }) {
        const run = db.transaction(() => {
            const registration = db.prepare(`
                SELECT r.reg_id, r.student_id, r.event_id, r.status, r.promotion_expires_at, e.event_name
                FROM REGISTRATION r JOIN EVENT e ON e.event_id = r.event_id
                WHERE r.reg_id = ? AND r.student_id = ?
            `).get(registrationId, studentId);
            if (!registration || registration.status !== 'promotion_pending') {
                throw new RegistrationError(409, 'There is no active waitlist offer to confirm.', 'PROMOTION_NOT_PENDING');
            }
            if (!registration.promotion_expires_at || registration.promotion_expires_at <= utcTimestamp(now)) {
                throw new RegistrationError(409, 'This waitlist offer has expired.', 'PROMOTION_EXPIRED');
            }
            db.prepare(`
                UPDATE REGISTRATION SET status = 'confirmed', promotion_expires_at = NULL, updated_at = ?
                WHERE reg_id = ? AND status = 'promotion_pending'
            `).run(utcTimestamp(now), registrationId);
            recordWaitlistHistory(db, registration, 'confirmed');
            createNotification(db, {
                recipientRole: 'student',
                recipientId: studentId,
                type: 'waitlist_confirmation',
                message: `Your place at ${registration.event_name} is confirmed.`,
                eventId: registration.event_id,
                dedupeKey: `promotion-confirmed:${registrationId}`,
            });
            return registration;
        });
        return run.immediate();
    }

    return { cancel, confirmPromotion, processExpiredPromotions, promoteNextInTransaction, register };
}

module.exports = { RegistrationError, createRegistrationService, getConfirmedCount, getWaitlistPosition, utcTimestamp };
