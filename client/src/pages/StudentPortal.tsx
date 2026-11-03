import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, MapPin, Pencil, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import type { Club, Event, Registration, Student } from '../lib/types';
import { Badge, Button, Card, EmptyState, Modal, useToast } from '../components/ui';

const profileSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your name.').max(120),
  email: z.string().trim().email('Enter a valid email address.').refine(value => value.toLowerCase().endsWith('@gmail.com'), 'Use a Gmail address.'),
  year: z.coerce.number().int().min(1).max(8),
  branch: z.string().trim().min(1, 'Enter your branch.').max(80),
});
type ProfileValues = z.infer<typeof profileSchema>;
type ProfileInput = z.input<typeof profileSchema>;

function usePortalQueries() {
  const profile = useQuery({ queryKey: ['student', 'profile'], queryFn: () => api<Student>('/student/profile') });
  const registrations = useQuery({ queryKey: ['student', 'registrations'], queryFn: () => api<Registration[]>('/student/registrations') });
  const events = useQuery({ queryKey: ['public', 'events'], queryFn: () => api<Event[]>('/public/events') });
  const clubs = useQuery({ queryKey: ['public', 'clubs'], queryFn: () => api<Club[]>('/public/clubs') });
  return { profile, registrations, events, clubs };
}

export function StudentDashboardPage() {
  const { user } = useAuth();
  const { profile, registrations, events, clubs } = usePortalQueries();
  const queryClient = useQueryClient();
  const notify = useToast();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileForm = useForm<ProfileInput, unknown, ProfileValues>({ resolver: zodResolver(profileSchema) });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = useMemo(() => (events.data ?? []).filter(event => new Date(`${event.event_date.split('T')[0]}T00:00:00`) >= today).sort((a, b) => a.event_date.localeCompare(b.event_date)), [events.data]);
  const registeredIds = new Set((registrations.data ?? []).map(item => item.event_id));

  const registerMutation = useMutation({
    mutationFn: (event: Event) => api('/student/registrations', {
      method: 'POST',
      body: JSON.stringify({ event_id: event.event_id, entry_fee: 0 }),
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['student', 'registrations'] });
      notify('You’re registered. See you there!');
    },
    onError: error => notify(error instanceof Error ? error.message : 'Registration failed.', 'error'),
  });
  const cancelMutation = useMutation({
    mutationFn: (registrationId: number) => api<void>(`/student/registrations/${registrationId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['student', 'registrations'] });
      notify('Registration cancelled.');
    },
    onError: error => notify(error instanceof Error ? error.message : 'Cancellation failed.', 'error'),
  });
  const profileMutation = useMutation({
    mutationFn: (values: ProfileValues) => api<Student>('/student/profile', { method: 'PATCH', body: JSON.stringify(values) }),
    onSuccess: async student => {
      queryClient.setQueryData(['student', 'profile'], student);
      queryClient.setQueryData(['auth'], { user: { id: student.student_id, role: 'student', usn: student.usn, email: student.email, full_name: student.full_name } });
      await queryClient.invalidateQueries({ queryKey: ['auth'] });
      notify('Your profile has been updated.');
      setProfileOpen(false);
    },
    onError: error => notify(error instanceof Error ? error.message : 'Profile update failed.', 'error'),
  });

  function openProfile() {
    if (!profile.data) return;
    profileForm.reset({
      full_name: profile.data.full_name,
      email: profile.data.email ?? '',
      year: profile.data.year,
      branch: profile.data.branch,
    });
    setProfileOpen(true);
  }

  return <div className="portal-content">
    <header className="portal-page-heading">
      <div><span className="eyebrow">YOUR CAMPUS, YOUR COMMUNITY</span><h1>Welcome back, {profile.data?.fname ?? user?.full_name?.split(' ')[0] ?? 'there'}.</h1><p>Here’s what’s happening around you.</p></div>
      <Button variant="secondary" onClick={openProfile}><Pencil size={15} /> Edit profile</Button>
    </header>

    <section className="student-overview-grid">
      <Card className="student-profile-card">
        <div className="student-profile-top"><span className="profile-avatar profile-avatar-large">{profile.data?.fname.charAt(0).toUpperCase() ?? 'S'}</span><div><span className="eyebrow">YOUR PROFILE</span><h2>{profile.data?.full_name ?? user?.full_name}</h2><p>{profile.data?.usn ?? user?.usn}</p></div></div>
        <div className="student-profile-meta"><span><UserRound size={15} /> {profile.data?.branch ?? 'Loading branch'}</span><span><Badge>Year {profile.data?.year ?? '—'}</Badge></span></div>
      </Card>
      <Card className="student-summary-card"><span className="summary-icon summary-violet"><CalendarDays size={18} /></span><span className="eyebrow">YOUR PLANS</span><strong>{registrations.data?.length ?? '—'}</strong><p>Event registrations</p><Link to="/events">Discover more <ArrowRight size={14} /></Link></Card>
      <Card className="student-summary-card"><span className="summary-icon summary-teal"><UserRound size={18} /></span><span className="eyebrow">GET INVOLVED</span><strong>{clubs.data?.length ?? '—'}</strong><p>Communities to explore</p><Link to="/clubs">Find your people <ArrowRight size={14} /></Link></Card>
    </section>

    <section className="portal-section">
      <div className="section-heading"><div><span className="eyebrow">SAVE THE DATE</span><h2>Upcoming events</h2><p>Make a little room in your calendar.</p></div><Link className="text-link" to="/events">All events <ArrowRight size={15} /></Link></div>
      {upcoming.length ? <div className="event-grid student-event-grid">{upcoming.slice(0, 3).map((event, index) => {
        const eventDate = new Date(`${event.event_date.split('T')[0]}T00:00:00`);
        return <Card className={`event-card event-color-${index % 3}`} key={event.event_id}>
          <div className="event-date"><span>{eventDate.toLocaleDateString('en-IN', { month: 'short' })}</span><strong>{eventDate.toLocaleDateString('en-IN', { day: '2-digit' })}</strong></div>
          <div className="event-card-content"><Badge>{event.club_name}</Badge><h3>{event.event_name}</h3><p><MapPin size={14} /> {event.location}</p></div>
          <Button variant={registeredIds.has(event.event_id) ? 'secondary' : 'primary'} disabled={registeredIds.has(event.event_id) || registerMutation.isPending} onClick={() => registerMutation.mutate(event)}>{registeredIds.has(event.event_id) ? 'Registered' : 'Join event'}</Button>
        </Card>;
      })}</div> : <Card><EmptyState title="No upcoming events right now" description="New campus events will appear here as soon as they’re scheduled." /></Card>}
    </section>

    <section className="portal-section">
      <div className="section-heading"><div><span className="eyebrow">YOUR CAMPUS ACTIVITY</span><h2>My registrations</h2><p>Your event sign-ups and history, in one place.</p></div></div>
      <Card className="table-card">
        {registrations.data?.length ? <div className="responsive-table"><table><thead><tr><th>Event</th><th>Date</th><th>Club</th><th>Entry fee</th><th>Status</th><th /></tr></thead><tbody>
          {registrations.data.map(registration => {
            const future = registration.event_date ? new Date(`${registration.event_date.split('T')[0]}T00:00:00`) >= today : false;
            return <tr key={registration.reg_id}><td><strong>{registration.event_name}</strong></td><td>{registration.event_date ? new Date(`${registration.event_date.split('T')[0]}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td><td><Badge>{registration.club_name}</Badge></td><td>₹ {Number(registration.entry_fee).toFixed(2)}</td><td><Badge className={future ? 'badge-success' : 'badge-neutral'}>{future ? 'Upcoming' : 'Past event'}</Badge></td><td>{future && <Button variant="ghost" onClick={() => window.confirm(`Cancel your registration for ${registration.event_name}?`) && cancelMutation.mutate(registration.reg_id)}>Cancel</Button>}</td></tr>;
          })}
        </tbody></table></div> : <EmptyState title="No registrations yet" description="Explore the campus calendar and save a place at something you’re excited about." />}
      </Card>
    </section>

    <Modal open={profileOpen} onOpenChange={setProfileOpen} title="Edit your profile" description="Keep your campus details up to date. Your USN cannot be changed here.">
      <form className="modal-form" onSubmit={profileForm.handleSubmit(values => profileMutation.mutate(values))}>
        <label className="form-field"><span>Full name</span><input {...profileForm.register('full_name')} />{profileForm.formState.errors.full_name && <small className="field-error">{profileForm.formState.errors.full_name.message}</small>}</label>
        <label className="form-field"><span>Gmail address</span><input {...profileForm.register('email')} type="email" />{profileForm.formState.errors.email && <small className="field-error">{profileForm.formState.errors.email.message}</small>}</label>
        <div className="form-row">
          <label className="form-field"><span>Year</span><select {...profileForm.register('year')}><option value="1">Year 1</option><option value="2">Year 2</option><option value="3">Year 3</option><option value="4">Year 4</option><option value="5">Year 5</option><option value="6">Year 6</option></select></label>
          <label className="form-field"><span>Branch</span><input {...profileForm.register('branch')} />{profileForm.formState.errors.branch && <small className="field-error">{profileForm.formState.errors.branch.message}</small>}</label>
        </div>
        <div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setProfileOpen(false)}>Cancel</Button><Button disabled={profileMutation.isPending}>{profileMutation.isPending ? 'Saving…' : 'Save changes'}</Button></div>
      </form>
    </Modal>
  </div>;
}
