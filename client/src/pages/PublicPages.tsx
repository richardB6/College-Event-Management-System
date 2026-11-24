import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays, Compass, Mail, MapPin, Phone, Sparkles, UserPlus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { Club, Event } from '../lib/types';
import { Badge, Button, EmptyState, PageLoader } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { useEventRegistration } from '../hooks/useEventRegistration';
import { EventRegistrationButton } from '../components/EventRegistrationButton';

function usePublicData<T>(path: string, key: string) {
  return useQuery({ queryKey: ['public', key], queryFn: () => api<T>(path), staleTime: 60_000 });
}

function EventCard({ event, index, action }: { event: Event; index: number; action?: ReactNode }) {
  const date = new Date(`${event.event_date.split('T')[0]}T00:00:00`);
  const isUpcoming = date >= new Date(new Date().setHours(0, 0, 0, 0));
  return <article className={`event-card event-color-${index % 3}`}>
    <div className="event-date"><span>{date.toLocaleDateString('en-IN', { month: 'short' })}</span><strong>{date.toLocaleDateString('en-IN', { day: '2-digit' })}</strong></div>
    <div className="event-card-content">
      <Badge>{event.club_name}</Badge>
      <h3><Link to={`/events/${event.event_id}`}>{event.event_name}</Link></h3>
      <p><MapPin size={14} /> {event.location}</p>
      <span className="event-full-date"><CalendarDays size={13} /> {date.toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</span>
      <span className="event-full-date">{event.entry_fee === 0 ? 'Free entry' : `Entry fee ₹${event.entry_fee.toFixed(2)}`} · {event.available_slots} places left</span>
    </div>
    {action && <div className="event-register-link">{isUpcoming ? action : <span>Past</span>}</div>}
  </article>;
}

export function HomePage() {
  const clubs = usePublicData<Club[]>('/public/clubs', 'clubs');
  const events = usePublicData<Event[]>('/public/events', 'events');
  const stats = usePublicData<{ students: number; clubs: number; events: number }>('/public/stats', 'stats');
  const registration = useEventRegistration();
  const upcoming = (events.data ?? []).filter(event => new Date(`${event.event_date.split('T')[0]}T00:00:00`) >= new Date(new Date().setHours(0, 0, 0, 0)))
    .sort((a, b) => a.event_date.localeCompare(b.event_date)).slice(0, 3);

  return <main>
    <section className="hero-section">
      <div className="hero-copy">
        <span className="eyebrow hero-eyebrow"><i /> CAMPUS LIFE, CONNECTED</span>
        <h1>Find your people.<br /><span>Find your place.</span></h1>
        <p>The best of college happens beyond the classroom. Discover communities, show up for what you love, and make this year count.</p>
        <div className="hero-actions"><Link className="button button-primary" to="/clubs">Explore clubs <ArrowUpRight size={16} /></Link><Link className="button button-quiet" to="/events">Browse events <ArrowRight size={16} /></Link></div>
        <div className="hero-note"><span className="hero-spark"><Sparkles size={16} /></span> One campus. Countless ways to belong.</div>
      </div>
      <div className="hero-image-wrap">
        <img src="https://images.unsplash.com/photo-1523580494863-6f3031224c94?auto=format&fit=crop&w=1200&q=85" alt="University students gathered at a campus event" />
        <div className="hero-image-shade" />
        <div className="hero-caption"><span><Sparkles size={18} /></span><div><strong>Make room for more</strong><small>Your next favorite thing starts here.</small></div></div>
      </div>
    </section>

    <section className="community-strip">
      <div><span className="eyebrow">A CAMPUS FULL OF POSSIBILITY</span><strong>There's a place for every side of you.</strong></div>
      <div className="community-stats">
        <div><strong>{stats.data?.clubs ?? '—'}</strong><span>communities</span></div>
        <div><strong>{stats.data?.events ?? '—'}</strong><span>events in the calendar</span></div>
        <div><strong>{stats.data?.students ?? '—'}</strong><span>students on campus</span></div>
      </div>
    </section>

    <section className="content-section" id="clubs">
      <div className="section-heading"><div><span className="eyebrow">YOUR PEOPLE ARE HERE</span><h2>Explore the community</h2><p>Find a club that feels like you—or introduces you to something new.</p></div><Link className="text-link" to="/clubs">All clubs <ArrowRight size={15} /></Link></div>
      {clubs.isLoading ? <PageLoader label="Finding campus communities…" /> : clubs.isError ? <EmptyState title="Clubs couldn't be loaded" description="Please refresh the page to try again." /> : clubs.data?.length ? <div className="club-grid">{clubs.data.slice(0, 6).map((club, index) => <ClubCard key={club.club_id} club={club} index={index} />)}</div> : <EmptyState title="No clubs just yet" description="New communities will show up here." />}
    </section>

    <section className="how-it-works">
      <div className="content-section">
        <div className="section-heading"><div><span className="eyebrow">HOW CLUBHUB WORKS</span><h2>Three steps to campus life</h2><p>Getting involved has never been easier.</p></div></div>
        <div className="steps-grid">
          <div className="step-card">
            <span className="step-number">1</span>
            <div className="step-icon step-icon-purple"><Compass size={22} /></div>
            <h3>Discover</h3>
            <p>Browse clubs and events happening across your campus. Find what excites you.</p>
          </div>
          <div className="step-card">
            <span className="step-number">2</span>
            <div className="step-icon step-icon-blue"><UserPlus size={22} /></div>
            <h3>Register</h3>
            <p>Sign up for events that match your interests. Secure your spot in seconds.</p>
          </div>
          <div className="step-card">
            <span className="step-number">3</span>
            <div className="step-icon step-icon-teal"><CalendarDays size={22} /></div>
            <h3>Participate</h3>
            <p>Show up, connect with peers, and build your community one event at a time.</p>
          </div>
        </div>
      </div>
    </section>

    <section className="events-showcase">
      <div className="content-section">
        <div className="section-heading"><div><span className="eyebrow">SAVE THE DATE</span><h2>Coming up on campus</h2><p>Good things happen when you put them on the calendar.</p></div><Link className="text-link" to="/events">Explore events <ArrowRight size={15} /></Link></div>
        {events.isLoading ? <PageLoader label="Checking the campus calendar…" /> : events.isError ? <EmptyState title="Events couldn't be loaded" description="Please refresh the page to try again." /> : upcoming.length ? <div className="event-grid">{upcoming.map((event, index) => <EventCard key={event.event_id} event={event} index={index} action={<EventRegistrationButton event={event} registration={registration.getRegistration(event.event_id)} isPending={registration.pendingEventId === event.event_id} isAnyPending={registration.isPending} isStatusLoading={registration.registrations.isLoading} isStatusError={registration.registrations.isError} onRegister={registration.register} compact />} />)}</div> : <EmptyState title="A little quiet for now" description="No upcoming events are scheduled. Check back soon." />}
      </div>
    </section>

    <section className="closing-cta"><div><span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</span><h2>Make college more than a timetable.</h2><p>Find an event, meet your community, and see where it takes you.</p></div><Link className="button button-light" to="/events">Find your next event <ArrowRight size={16} /></Link></section>
  </main>;
}

function ClubCard({ club, index }: { club: Club; index: number }) {
  const initial = club.club_name.trim().charAt(0).toUpperCase();
  return <Link className={`club-card club-color-${index % 5}`} to={`/clubs/${club.club_id}`}>
    <div className="club-card-art" aria-hidden="true"><span>{initial}</span><i /><b /></div>
    <div className="club-card-body"><span className="eyebrow">CAMPUS COMMUNITY</span><h3>{club.club_name}</h3><div className="club-card-link">Discover this community <ArrowDownRight size={15} /></div></div>
  </Link>;
}

export function ClubsPage() {
  const clubs = usePublicData<Club[]>('/public/clubs', 'clubs');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [upcomingOnly, setUpcomingOnly] = useState(false);
  const categories = [...new Set((clubs.data ?? []).map(club => club.category).filter((value): value is string => Boolean(value)))].sort();
  const visible = (clubs.data ?? []).filter(club =>
    (!category || club.category === category)
    && (!upcomingOnly || club.has_upcoming_events)
    && `${club.club_name} ${club.category ?? ''} ${club.description ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return <main className="public-listing">
    <header className="public-page-heading"><span className="eyebrow">FIND YOUR PEOPLE</span><h1>Clubs & communities</h1><p>Step into something you love—or discover a new side of campus.</p></header>
    <div className="listing-controls"><label className="search-field"><span>⌕</span><input value={search} onChange={event => setSearch(event.target.value)} type="search" placeholder="Search clubs, category, description…" aria-label="Search clubs" /></label><select className="select-control" aria-label="Filter by category" value={category} onChange={event => setCategory(event.target.value)}><option value="">All categories</option>{categories.map(item => <option value={item} key={item}>{item}</option>)}</select><label className="checkbox-filter"><input type="checkbox" checked={upcomingOnly} onChange={event => setUpcomingOnly(event.target.checked)} /> Has upcoming events</label></div>
    {clubs.isLoading ? <PageLoader label="Finding campus communities…" /> : clubs.isError ? <EmptyState title="Clubs couldn't be loaded" description="Please try again later." /> : visible.length ? <div className="club-grid listing-grid">{visible.map((club, index) => <ClubCard key={club.club_id} club={club} index={index} />)}</div> : <EmptyState title="No clubs match that search" description="Try another name or clear the search." />}
  </main>;
}

export function ClubDetailPage() {
  const { clubId } = useParams();
  const club = usePublicData<Club>(`/public/clubs/${clubId}`, `club-${clubId}`);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const membership = useMutation({
    mutationFn: (joined: boolean) => api<void>(`/student/clubs/${clubId}/membership`, { method: joined ? 'DELETE' : 'POST' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['public', `club-${clubId}`] });
      await queryClient.invalidateQueries({ queryKey: ['public', 'clubs'] });
      await queryClient.invalidateQueries({ queryKey: ['student', 'memberships'] });
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
  if (club.isLoading) return <PageLoader />;
  if (club.isError || !club.data) return <main className="public-listing"><EmptyState title="Club not found" description="This club could not be loaded." /><Link className="text-link" to="/clubs">← Back to clubs</Link></main>;
  const related = club.data.events ?? [];
  const upcoming = related.filter(event => !['cancelled', 'completed', 'ongoing'].includes(event.lifecycle_status));
  const ongoing = related.filter(event => event.lifecycle_status === 'ongoing');
  const past = related.filter(event => ['cancelled', 'completed'].includes(event.lifecycle_status));
  return <main className="public-listing">
    <Link className="back-link" to="/clubs">← All clubs</Link>
    <section className={`club-profile-hero${club.data.banner_path ? ' club-profile-hero-image' : ''}`} style={club.data.banner_path ? { backgroundImage: `linear-gradient(90deg, rgba(20, 23, 38, .82), rgba(20, 23, 38, .18)), url("${club.data.banner_path}")` } : undefined}>
      <div className="club-profile-identity">
        {club.data.logo_path ? <img className="club-profile-logo" src={club.data.logo_path} alt={`${club.data.club_name} logo`} /> : <span className="club-detail-icon">{club.data.club_name.charAt(0).toUpperCase()}</span>}
        <div><span className="eyebrow">{club.data.category || 'CAMPUS COMMUNITY'}{club.data.founding_year ? ` · EST. ${club.data.founding_year}` : ''}</span><h1>{club.data.club_name}</h1><p>{club.data.description || 'Discover what this campus community is all about.'}</p></div>
      </div>
      <div className="club-profile-stats"><span><strong>{club.data.active_member_count ?? 0}</strong> active members</span><span><strong>{club.data.event_count ?? 0}</strong> events hosted</span></div>
      {user?.role === 'student' ? <Button className="club-membership-action" variant={club.data.is_member ? 'secondary' : 'primary'} disabled={membership.isPending} onClick={() => membership.mutate(Boolean(club.data?.is_member))}>{membership.isPending ? 'Updating…' : club.data.is_member ? 'Leave club' : 'Join club'}</Button> : !user && <Link className="button button-primary club-membership-action" to="/student/login">Sign in to join</Link>}
    </section>
    <section className="club-profile-section">
      <div className="section-heading"><div><span className="eyebrow">OUR COMMUNITY</span><h2>About the club</h2></div></div>
      <div className="club-profile-columns">
        <article className="club-profile-copy"><p>{club.data.description || 'Club description has not been added yet.'}</p>{club.data.mission && <><h3>Mission & objectives</h3><p>{club.data.mission}</p></>}</article>
        <aside className="club-leadership-card"><span className="eyebrow">CLUB LEADERSHIP</span><h3>{club.data.president_name || 'President information unavailable'}</h3><span>Current President</span>{club.data.president_email && <a href={`mailto:${club.data.president_email}`}><Mail size={15} />{club.data.president_email}</a>}{club.data.president_phone && <a href={`tel:${club.data.president_phone}`}><Phone size={15} />{club.data.president_phone}</a>}{club.data.founder_name && <p><strong>Founded by</strong> {club.data.founder_name}</p>}{club.data.founding_year && <p><strong>Established</strong> {club.data.founding_year}</p>}</aside>
      </div>
    </section>
    <ClubEventSection title="Upcoming events" eyebrow="WHAT'S NEXT" events={upcoming} empty="This club has no upcoming events right now." />
    <ClubEventSection title="Happening now" eyebrow="ONGOING" events={ongoing} empty="No events are currently in progress." />
    <ClubEventSection title="Past events" eyebrow="FROM THE ARCHIVE" events={past} empty="This club hasn't organized any events yet." />
  </main>;
}

function ClubEventSection({ title, eyebrow, events, empty }: { title: string; eyebrow: string; events: Event[]; empty: string }) {
  return <section className="club-profile-section">
    <div className="section-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div></div>
    {events.length ? <div className="club-events-grid">{events.map(event => <article className="club-event-card" key={event.event_id}>
      <div className="club-event-card-top"><Badge>{event.lifecycle_status.replaceAll('_', ' ')}</Badge><span><CalendarDays size={14} /> {event.event_date} · {event.start_time}</span></div>
      <h3>{event.event_name}</h3><p>{event.description || 'No event summary provided.'}</p>
      <div className="club-event-meta"><span><MapPin size={14} /> {event.location}</span><span>{event.lifecycle_status === 'full' ? 'Waitlist available' : event.lifecycle_status === 'registration_open' ? `${event.available_slots} seats available` : 'Registration closed'}</span></div>
      <Link className="text-link" to={`/events/${event.event_id}`}>Event details <ArrowUpRight size={14} /></Link>
    </article>)}</div> : <EmptyState title={title === 'Upcoming events' ? "This club hasn't organized any events yet." : title} description={empty} />}
  </section>;
}

export function EventDetailPage() {
  const { eventId = '' } = useParams();
  const event = useQuery({ queryKey: ['public', 'event', eventId], queryFn: () => api<Event>(`/public/events/${eventId}`), enabled: /^\d+$/.test(eventId) });
  const registration = useEventRegistration();
  if (event.isLoading) return <PageLoader />;
  if (event.isError || !event.data) return <main className="public-listing"><EmptyState title="Event not found" description="This event is unavailable or has been removed." /><Link className="text-link" to="/events">Browse events</Link></main>;
  const item = event.data;
  return <main className="public-listing event-detail-page"><Link className="back-link" to="/events">← All events</Link><section className="club-event-card event-detail-card"><Badge>{item.lifecycle_status.replaceAll('_', ' ')}</Badge><span className="eyebrow">{item.club_name}</span><h1>{item.event_name}</h1><p>{item.description || 'No event description provided.'}</p><p><CalendarDays size={15} /> {item.event_date} · {item.start_time}–{item.end_time}</p><p><MapPin size={15} /> {item.location}</p><p>{item.entry_fee === 0 ? 'Free entry' : `Registration fee: ₹${item.entry_fee.toFixed(2)}`}</p><p>{item.lifecycle_status === 'full' ? `${item.waitlist_count} students waitlisted; join the waitlist to be considered.` : item.lifecycle_status === 'registration_open' ? `${item.available_slots} seats available` : item.lifecycle_status === 'published' && item.registration_opens_at ? `Registration opens ${item.registration_opens_at.replace('T', ' ')}` : 'Registration is not open.'}</p><EventRegistrationButton event={item} registration={registration.getRegistration(item.event_id)} isPending={registration.pendingEventId === item.event_id} isAnyPending={registration.isPending} isStatusLoading={registration.registrations.isLoading} isStatusError={registration.registrations.isError} onRegister={registration.register} /></section></main>;
}

export function EventsPage() {
  const events = usePublicData<Event[]>('/public/events', 'events');
  const [search, setSearch] = useState('');
  const [club, setClub] = useState('');
  const [lifecycle, setLifecycle] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const clubs = usePublicData<Club[]>('/public/clubs', 'clubs');
  const registration = useEventRegistration();
  const allEvents = events.data ?? [];
  const today = new Date();
  const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const filtered = allEvents.filter(event =>
    (!club || String(event.club_id) === club) &&
    (!fromDate || event.event_date >= fromDate) &&
    (!toDate || event.event_date <= toDate) &&
    (!lifecycle || (
      lifecycle === 'upcoming' ? event.event_date >= todayString && !['cancelled', 'completed'].includes(event.lifecycle_status)
        : lifecycle === 'past' ? event.event_date < todayString || event.lifecycle_status === 'completed'
          : lifecycle === 'registration_open' ? ['registration_open', 'full'].includes(event.lifecycle_status)
            : ['registration_closed', 'published'].includes(event.lifecycle_status)
    )) &&
    `${event.event_name} ${event.description} ${event.category} ${event.location} ${event.club_name}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return <main className="public-listing">
    <header className="public-page-heading"><span className="eyebrow">MAKE A PLAN</span><h1>Campus events</h1><p>Find something worth showing up for, hosted by the communities around you.</p></header>
    <div className="listing-controls">
      <label className="search-field"><span>⌕</span><input value={search} onChange={event => setSearch(event.target.value)} type="search" placeholder="Search events…" aria-label="Search events" /></label>
      <select className="select-control" aria-label="Filter by club" value={club} onChange={event => setClub(event.target.value)}><option value="">All clubs</option>{clubs.data?.map(item => <option value={item.club_id} key={item.club_id}>{item.club_name}</option>)}</select>
      <select className="select-control" aria-label="Filter by event status" value={lifecycle} onChange={event => setLifecycle(event.target.value)}><option value="">All event statuses</option><option value="upcoming">Upcoming</option><option value="past">Past</option><option value="registration_open">Registration open</option><option value="registration_closed">Registration closed</option></select>
      <label className="date-filter"><span>From</span><input type="date" aria-label="Events from date" value={fromDate} onChange={event => setFromDate(event.target.value)} /></label>
      <label className="date-filter"><span>To</span><input type="date" aria-label="Events to date" value={toDate} onChange={event => setToDate(event.target.value)} /></label>
    </div>
    {events.isLoading ? <PageLoader label="Checking the campus calendar…" /> : events.isError ? <EmptyState title="Events couldn't be loaded" description="Please try again later." /> : filtered.length ? <div className="event-list">{filtered.slice().sort((a, b) => a.event_date.localeCompare(b.event_date)).map((event, index) => <EventCard key={event.event_id} event={event} index={index} action={<EventRegistrationButton event={event} registration={registration.getRegistration(event.event_id)} isPending={registration.pendingEventId === event.event_id} isAnyPending={registration.isPending} isStatusLoading={registration.registrations.isLoading} isStatusError={registration.registrations.isError} onRegister={registration.register} compact />} />)}</div> : <EmptyState title="No events match those filters" description="Try another search or choose a different club." />}
  </main>;
}
