const ACADEMIC_YEARS = Object.freeze([1, 2, 3, 4]);

const DEPARTMENTS = Object.freeze([
    { department_code: 'CSE', department_name: 'Computer Science and Engineering' },
    { department_code: 'MECHANICAL', department_name: 'Mechanical Engineering' },
    { department_code: 'CSBS', department_name: 'Computer Science and Business Systems' },
    { department_code: 'CIVIL', department_name: 'Civil Engineering' },
    { department_code: 'AIML', department_name: 'Artificial Intelligence and Machine Learning' },
]);

function isValidDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year
        && parsed.getUTCMonth() === month - 1
        && parsed.getUTCDate() === day;
}

function isValidTime(value) {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return false;
    return true;
}

function asLocalDateTime(date, time) {
    return `${date}T${time}`;
}

function localDateTimeAt(date, timezone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function dateTimeToEpoch(value, timezone) {
    const [date, time] = value.split('T');
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute] = time.split(':').map(Number);
    const desiredUtc = Date.UTC(year, month - 1, day, hour, minute);
    let guess = desiredUtc;
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const [localDate, localTime] = localDateTimeAt(new Date(guess), timezone).split('T');
        const [localYear, localMonth, localDay] = localDate.split('-').map(Number);
        const [localHour, localMinute] = localTime.split(':').map(Number);
        const representedUtc = Date.UTC(localYear, localMonth - 1, localDay, localHour, localMinute);
        const adjustment = desiredUtc - representedUtc;
        if (adjustment === 0) return guess;
        guess += adjustment;
    }
    throw new RangeError(`The local date-time ${value} does not exist in ${timezone}.`);
}

function eventIntervalsOverlap(first, second) {
    const firstStart = dateTimeToEpoch(asLocalDateTime(first.event_date, first.start_time), first.timezone || 'Asia/Kolkata');
    const firstEnd = dateTimeToEpoch(asLocalDateTime(first.end_date || first.event_date, first.end_time), first.timezone || 'Asia/Kolkata');
    const secondStart = dateTimeToEpoch(asLocalDateTime(second.event_date, second.start_time), second.timezone || 'Asia/Kolkata');
    const secondEnd = dateTimeToEpoch(asLocalDateTime(second.end_date || second.event_date, second.end_time), second.timezone || 'Asia/Kolkata');
    return firstStart < secondEnd && secondStart < firstEnd;
}

function getEventLifecycleStatus(event, confirmedCount, now = new Date()) {
    if (event.status === 'draft') return 'draft';
    if (event.status === 'cancelled') return 'cancelled';
    if (event.status === 'completed') return 'completed';

    const timezone = event.timezone || 'Asia/Kolkata';
    const current = localDateTimeAt(now, timezone);
    const start = asLocalDateTime(event.event_date, event.start_time);
    const end = asLocalDateTime(event.end_date || event.event_date, event.end_time);
    if (current >= end) return 'completed';
    if (current >= start) return 'ongoing';
    if (event.registration_opens_at && current < event.registration_opens_at) return 'published';
    if (event.registration_closes_at && current >= event.registration_closes_at) return 'registration_closed';
    if (confirmedCount >= event.capacity) return 'full';
    return 'registration_open';
}

function intervalsOverlap(firstStart, firstEnd, secondStart, secondEnd) {
    return firstStart < secondEnd && secondStart < firstEnd;
}

function findStudentScheduleConflicts(db, studentId, event, excludedRegistrationId = null) {
    const rows = db.prepare(`
        SELECT r.reg_id, e.event_id, e.event_name, e.event_date, e.start_time, e.end_date, e.end_time, e.timezone
        FROM REGISTRATION r
        JOIN EVENT e ON e.event_id = r.event_id
        WHERE r.student_id = ?
          AND r.status = 'confirmed'
          AND e.status = 'published'
          AND (? IS NULL OR r.reg_id != ?)
    `).all(studentId, excludedRegistrationId, excludedRegistrationId);

    return rows.filter(row => eventIntervalsOverlap(event, row)).map(row => ({
        registration_id: row.reg_id,
        event_id: row.event_id,
        event_name: row.event_name,
        event_date: row.event_date,
        start_time: row.start_time,
        end_date: row.end_date || row.event_date,
        end_time: row.end_time,
    }));
}

module.exports = {
    ACADEMIC_YEARS,
    DEPARTMENTS,
    asLocalDateTime,
    dateTimeToEpoch,
    eventIntervalsOverlap,
    findStudentScheduleConflicts,
    getEventLifecycleStatus,
    intervalsOverlap,
    isValidDate,
    isValidTime,
    localDateTimeAt,
};
