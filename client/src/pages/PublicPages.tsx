import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays, MapPin, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { Club, Event } from '../lib/types';
import { Badge, EmptyState, PageLoader } from '../components/ui';
import { useAuth } from '../auth/AuthContext';

function usePublicData<T>(path: string, key: string) {
  return useQuery({ queryKey: ['public', key], queryFn: () => api<T>(path), staleTime: 60_000 });
}

function EventCard({ event, index, onRegister }: { event: Event; index: number; onRegister?: () => void }) {
  const date = new Date(`${event.event_date.split('T')[0]}T00:00:00`);
  const isUpcoming = date >= new Date(new Date().setHours(0, 0, 0, 0));
  return <article className={`event-card event-color-${index % 3}`}>
    <div className="event-date"><span>{date.toLocaleDateString('en-IN', { month: 'short' })}</span><strong>{date.toLocaleDateString('en-IN', { day: '2-digit' })}</strong></div>
    <div className="event-card-content">
      <Badge>{event.club_name}</Badge>
      <h3>{event.event_name}</h3>
      <p><MapPin size={14} /> {event.location}</p>
      <span className="event-full-date"><CalendarDays size={13} /> {date.toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</span>
      <span className="event-full-date">{event.entry_fee === 0 ? 'Free entry' : `Entry fee ₹${event.entry_fee.toFixed(2)}`} · {event.available_slots} places left</span>
    </div>
    {onRegister && <button className="event-register-link" onClick={onRegister} disabled={!isUpcoming} aria-label={isUpcoming ? `Register for ${event.event_name}` : `${event.event_name} registration is closed`}>
      {isUpcoming ? <ArrowUpRight size={18} /> : <span>Past</span>}
    </button>}
  </article>;
}

export function HomePage() {
  const { user } = useAuth();
  const clubs = usePublicData<Club[]>('/public/clubs', 'clubs');
  const events = usePublicData<Event[]>('/public/events', 'events');
  const stats = usePublicData<{ students: number; clubs: number; events: number }>('/public/stats', 'stats');
  const navigate = useNavigate();
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
      <div><span className="eyebrow">A CAMPUS FULL OF POSSIBILITY</span><strong>There’s a place for every side of you.</strong></div>
      <div className="community-stats">
        <div><strong>{stats.data?.clubs ?? '—'}</strong><span>communities</span></div>
        <div><strong>{stats.data?.events ?? '—'}</strong><span>events in the calendar</span></div>
        <div><strong>{stats.data?.students ?? '—'}</strong><span>students on campus</span></div>
      </div>
    </section>

    <section className="content-section" id="clubs">
      <div className="section-heading"><div><span className="eyebrow">YOUR PEOPLE ARE HERE</span><h2>Explore the community</h2><p>Find a club that feels like you—or introduces you to something new.</p></div><Link className="text-link" to="/clubs">All clubs <ArrowRight size={15} /></Link></div>
      {clubs.isLoading ? <PageLoader label="Finding campus communities…" /> : clubs.isError ? <EmptyState title="Clubs couldn’t be loaded" description="Please refresh the page to try again." /> : clubs.data?.length ? <div className="club-grid">{clubs.data.slice(0, 6).map((club, index) => <ClubCard key={club.club_id} club={club} index={index} />)}</div> : <EmptyState title="No clubs just yet" description="New communities will show up here." />}
    </section>

    <section className="events-showcase">
      <div className="content-section">
        <div className="section-heading"><div><span className="eyebrow">SAVE THE DATE</span><h2>Coming up on campus</h2><p>Good things happen when you put them on the calendar.</p></div><Link className="text-link" to="/events">Explore events <ArrowRight size={15} /></Link></div>
        {events.isLoading ? <PageLoader label="Checking the campus calendar…" /> : events.isError ? <EmptyState title="Events couldn’t be loaded" description="Please refresh the page to try again." /> : upcoming.length ? <div className="event-grid">{upcoming.map((event, index) => <EventCard key={event.event_id} event={event} index={index} onRegister={() => navigate(user?.role === 'student' ? '/student' : '/student/login', user?.role === 'student' ? undefined : { state: { message: 'Sign in to your student account to register for this event.' } })} />)}</div> : <EmptyState title="A little quiet for now" description="No upcoming events are scheduled. Check back soon." />}
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
  const visible = (clubs.data ?? []).filter(club => club.club_name.toLowerCase().includes(search.trim().toLowerCase()));
  return <main className="public-listing">
    <header className="public-page-heading"><span className="eyebrow">FIND YOUR PEOPLE</span><h1>Clubs & communities</h1><p>Step into something you love—or discover a new side of campus.</p></header>
    <label className="search-field"><span>⌕</span><input value={search} onChange={event => setSearch(event.target.value)} type="search" placeholder="Search clubs…" aria-label="Search clubs" /></label>
    {clubs.isLoading ? <PageLoader label="Finding campus communities…" /> : clubs.isError ? <EmptyState title="Clubs couldn’t be loaded" description="Please try again later." /> : visible.length ? <div className="club-grid listing-grid">{visible.map((club, index) => <ClubCard key={club.club_id} club={club} index={index} />)}</div> : <EmptyState title="No clubs match that search" description="Try another name or clear the search." />}
  </main>;
}

export function ClubDetailPage() {
  const { clubId } = useParams();
  const club = usePublicData<Club>(`/public/clubs/${clubId}`, `club-${clubId}`);
  const events = usePublicData<Event[]>('/public/events', 'events');
  const related = events.data?.filter(event => String(event.club_id) === clubId) ?? [];
  if (club.isLoading) return <PageLoader />;
  if (!club.data) return <main className="public-listing"><EmptyState title="Club not found" /><Link className="text-link" to="/clubs">← Back to clubs</Link></main>;
  return <main className="public-listing">
    <Link className="back-link" to="/clubs">← All clubs</Link>
    <section className="club-detail-hero"><span className="club-detail-icon">{club.data.club_name.charAt(0).toUpperCase()}</span><div><span className="eyebrow">CAMPUS COMMUNITY</span><h1>{club.data.club_name}</h1><p>Meet people who share what you love and make something memorable together.</p></div></section>
    <div className="section-heading"><div><span className="eyebrow">ON THE CALENDAR</span><h2>Events from this club</h2></div></div>
    {related.length ? <div className="event-grid">{related.map((event, index) => <EventCard key={event.event_id} event={event} index={index} />)}</div> : <EmptyState title="No events listed yet" description="Check back soon for this club’s upcoming plans." />}
  </main>;
}

export function EventsPage() {
  const { user } = useAuth();
  const events = usePublicData<Event[]>('/public/events', 'events');
  const [search, setSearch] = useState('');
  const [club, setClub] = useState('');
  const clubs = usePublicData<Club[]>('/public/clubs', 'clubs');
  const navigate = useNavigate();
  const allEvents = events.data ?? [];
  const filtered = allEvents.filter(event =>
    (!club || String(event.club_id) === club) &&
    `${event.event_name} ${event.location} ${event.club_name}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return <main className="public-listing">
    <header className="public-page-heading"><span className="eyebrow">MAKE A PLAN</span><h1>Campus events</h1><p>Find something worth showing up for, hosted by the communities around you.</p></header>
    <div className="listing-controls">
      <label className="search-field"><span>⌕</span><input value={search} onChange={event => setSearch(event.target.value)} type="search" placeholder="Search events…" aria-label="Search events" /></label>
      <select className="select-control" aria-label="Filter by club" value={club} onChange={event => setClub(event.target.value)}><option value="">All clubs</option>{clubs.data?.map(item => <option value={item.club_id} key={item.club_id}>{item.club_name}</option>)}</select>
    </div>
    {events.isLoading ? <PageLoader label="Checking the campus calendar…" /> : events.isError ? <EmptyState title="Events couldn’t be loaded" description="Please try again later." /> : filtered.length ? <div className="event-list">{filtered.slice().sort((a, b) => a.event_date.localeCompare(b.event_date)).map((event, index) => <EventCard key={event.event_id} event={event} index={index} onRegister={() => navigate(user?.role === 'student' ? '/student' : '/student/login', user?.role === 'student' ? undefined : { state: { message: 'Sign in to your student account to register for this event.' } })} />)}</div> : <EmptyState title="No events match those filters" description="Try another search or choose a different club." />}
  </main>;
}
