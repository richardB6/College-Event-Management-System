import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, Pause, Play } from 'lucide-react';
import { useRecentNotifications } from '../hooks/useRecentNotifications';
import type { Event, Notification } from '../lib/types';
import { useAuth } from '../auth/AuthContext';

const WEEK = 7 * 24 * 60 * 60 * 1000;

function notificationTime(value: string) {
  const parsed = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function destination(item: Notification) {
  if (typeof item.link === 'string' && item.link.startsWith('/') && !item.link.startsWith('//') && !item.link.includes('\\')) {
    return item.link;
  }
  if (Number.isSafeInteger(item.event_id) && Number(item.event_id) > 0) return `/events/${item.event_id}`;
  if (Number.isSafeInteger(item.club_id) && Number(item.club_id) > 0) return `/clubs/${item.club_id}`;
  return null;
}

function priority(item: Notification) {
  if (['event_cancelled', 'event_schedule_changed', 'scheduling_alert'].includes(item.notification_type)) return 0;
  if (['registration_confirmation', 'waitlist_placement', 'waitlist_promotion', 'waitlist_confirmation'].includes(item.notification_type)) return 1;
  if (item.notification_type === 'event_announcement') return 2;
  if (item.notification_type === 'event_reminder') return 3;
  if (item.notification_type === 'club_joined') return 4;
  return 5;
}

function keepNotification(item: Notification, event: Event | undefined, now: number) {
  const created = notificationTime(item.created_at);
  if (created === null) return false;
  const recent = now - created <= WEEK && created <= now + 60_000;
  const eventIsUpcoming = Boolean(event)
    && !['cancelled', 'completed', 'ongoing'].includes(event!.lifecycle_status);

  if (item.notification_type === 'event_announcement') {
    return eventIsUpcoming && ['registration_open', 'full'].includes(event!.lifecycle_status);
  }
  if (item.notification_type === 'event_reminder') return recent && eventIsUpcoming;
  if (['event_cancelled', 'event_schedule_changed', 'scheduling_alert'].includes(item.notification_type)) return recent;
  if (item.notification_type === 'club_joined') return recent;
  if (['registration_confirmation', 'waitlist_placement', 'waitlist_promotion', 'waitlist_confirmation'].includes(item.notification_type)) {
    if (event && ['cancelled', 'completed', 'ongoing'].includes(event.lifecycle_status)) return false;
    return recent;
  }
  return recent;
}

function TickerItem({ item, event, duplicate = false }: { item: Notification; event?: Event; duplicate?: boolean }) {
  const to = destination(item);
  const includeEventName = Boolean(event && !item.message.toLocaleLowerCase().includes(event.event_name.toLocaleLowerCase()));
  const content = <>{item.message}{includeEventName && <span className="ticker-item-context"> · {event?.event_name}</span>}</>;
  if (duplicate) return <span className="campus-ticker-item">{content}</span>;
  return to
    ? <Link className="campus-ticker-item" to={to}>{content}</Link>
    : <span className="campus-ticker-item">{content}</span>;
}

export function CampusLiveTicker({ events }: { events: Event[] }) {
  const { user } = useAuth();
  const notifications = useRecentNotifications(user?.role);
  const [paused, setPaused] = useState(false);
  const announcements = useMemo(() => {
    const now = Date.now();
    const eventById = new Map(events.map(event => [event.event_id, event]));
    const unique = new Map<number, Notification>();
    for (const item of notifications.data?.items ?? []) {
      if (!unique.has(item.notification_id) && keepNotification(item, item.event_id ? eventById.get(item.event_id) : undefined, now)) {
        unique.set(item.notification_id, item);
      }
    }
    return [...unique.values()]
      .sort((first, second) => priority(first) - priority(second)
        || (notificationTime(second.created_at) ?? 0) - (notificationTime(first.created_at) ?? 0))
      .slice(0, 6);
  }, [events, notifications.data?.items]);
  const animated = announcements.length > 1;
  const eventById = new Map(events.map(event => [event.event_id, event]));

  return <section className={`campus-live-ticker${paused ? ' campus-ticker-paused' : ''}`} aria-label="Campus Live Updates">
    <div className="campus-ticker-heading">
      <span className="campus-ticker-icon" aria-hidden="true"><BellRing size={16} /></span>
      <div><strong>Campus Live Updates</strong><span className="campus-live-indicator"><i /> LIVE</span></div>
    </div>
    <div className="campus-ticker-window">
      {notifications.isError
        ? <p className="campus-ticker-empty">Campus updates are temporarily unavailable.</p>
        : announcements.length === 0
          ? <p className="campus-ticker-empty">No new campus announcements right now. Stay tuned!</p>
          : <div className={`campus-ticker-track${animated ? ' campus-ticker-animated' : ''}`}>
            <div className="campus-ticker-group">
              {announcements.map(item => <TickerItem key={item.notification_id} item={item} event={item.event_id ? eventById.get(item.event_id) : undefined} />)}
            </div>
            {animated && <div className="campus-ticker-group" aria-hidden="true">
              {announcements.map(item => <TickerItem key={item.notification_id} item={item} event={item.event_id ? eventById.get(item.event_id) : undefined} duplicate />)}
            </div>}
          </div>}
    </div>
    {animated && <button
      className="campus-ticker-toggle"
      type="button"
      onClick={() => setPaused(value => !value)}
      aria-label={paused ? 'Resume campus announcements' : 'Pause campus announcements'}
      aria-pressed={paused}
    >
      {paused ? <Play size={15} /> : <Pause size={15} />}
    </button>}
  </section>;
}
