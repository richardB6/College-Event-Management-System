UPDATE EVENT
SET registration_opens_at = NULL,
    registration_closes_at = event_date || 'T' || start_time
WHERE registration_opens_at = event_date || 'T08:00'
  AND registration_closes_at = event_date || 'T17:00';
