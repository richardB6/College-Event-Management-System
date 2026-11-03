import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, MapPin, Pencil, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '../auth/AuthContext';
import { ApiError, api } from '../lib/api';
import type { Club, ClubMembership, Department, Event, Registration, Student } from '../lib/types';
import { Badge, Button, Card, EmptyState, Modal, useToast } from '../components/ui';

const profileSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your name.').max(120),
  email: z.string().trim().email('Enter a valid email address.').refine(value => value.toLowerCase().endsWith('@gmail.com'), 'Use a Gmail address.'),
  year: z.coerce.number().int().min(1).max(4),
  department_code: z.string().min(1, 'Choose your department.'),
});
type ProfileValues = z.infer<typeof profileSchema>;
type ProfileInput = z.input<typeof profileSchema>;

function usePortalQueries() {
  const profile = useQuery({ queryKey: ['student', 'profile'], queryFn: () => api<Student>('/student/profile') });
  const registrations = useQuery({ queryKey: ['student', 'registrations'], queryFn: () => api<Registration[]>('/student/registrations') });
  const events = useQuery({ queryKey: ['public', 'events'], queryFn: () => api<Event[]>('/public/events') });
  const clubs = useQuery({ queryKey: ['public', 'clubs'], queryFn: () => api<Club[]>('/public/clubs') });
  const memberships = useQuery({ queryKey: ['student', 'memberships'], queryFn: () => api<ClubMembership[]>('/student/memberships') });
  const config = useQuery({
    queryKey: ['public-config'],
    queryFn: () => api<{ departments: Department[]; academic_years: number[] }>('/public/config'),
    staleTime: Infinity,
  });
  return { profile, registrations, events, clubs, memberships, config };
}

export function StudentDashboardPage() {
  const { user } = useAuth();
  const { profile, registrations, events, clubs, memberships, config } = usePortalQueries();
  const queryClient = useQueryClient();
  const notify = useToast();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileForm = useForm<ProfileInput, unknown, ProfileValues>({ resolver: zodResolver(profileSchema) });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = useMemo(() => (events.data ?? []).filter(event => (
    new Date(`${event.event_date.split('T')[0]}T00:00:00`) >= today
    && !['cancelled', 'completed'].includes(event.lifecycle_status)
  )).sort((a, b) => a.event_date.localeCompare(b.event_date)), [events.data]);
  const registeredIds = new Set((registrations.data ?? []).filter(item => (
    ['confirmed', 'waitlisted', 'promotion_pending'].includes(item.status ?? '')
  )).map(item => item.event_id));

  const registerMutation = useMutation({
    mutationFn: async (event: Event) => {
      try {
        return await api<{ status: string; waitlist_position: number | null }>('/student/registrations', {
          method: 'POST',
          body: JSON.stringify({ event_id: event.event_id }),
        });
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== 'SCHEDULE_CONFLICT') throw error;
        const details = error.details as { conflicts?: { event_name: string; event_date: string; start_time: string; end_time: string }[] };
        const conflicts = details.conflicts ?? [];
        const schedule = conflicts.map(item => `${item.event_name} (${item.event_date}, ${item.start_time}–${item.end_time})`).join('\n');
        if (!window.confirm(`${error.message}\n\n${schedule}\n\nRegister anyway? Your decision will be recorded.`)) {
          throw new Error('Registration was not submitted.');
        }
        return api<{ status: string; waitlist_position: number | null }>('/student/registrations', {
          method: 'POST',
          body: JSON.stringify({ event_id: event.event_id, allow_conflicts: true }),
        });
      }
    },
    onSuccess: async result => {
      await queryClient.invalidateQueries({ queryKey: ['student', 'registrations'] });
      notify(result.status === 'waitlisted'
        ? `You’re on the waitlist at position #${result.waitlist_position}.`
        : 'You’re registered. See you there!');
    },
    onError: error => notify(error instanceof Error ? error.message : 'Registration failed.', 'error'),
  });
  const confirmPromotion = useMutation({
    mutationFn: (registrationId: number) => api(`/student/registrations/${registrationId}/confirm`, { method: 'POST' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['student', 'registrations'] });
      notify('Your place is confirmed.');
    },
    onError: error => notify(error instanceof Error ? error.message : 'Could not confirm your place.', 'error'),
  });
  const membershipMutation = useMutation({
    mutationFn: ({ clubId, joined }: { clubId: number; joined: boolean }) => api<void>(
      `/student/clubs/${clubId}/membership`,
      { method: joined ? 'DELETE' : 'POST' },
    ),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['student', 'memberships'] });
      notify(variables.joined ? 'You left the club.' : 'You joined the club.');
    },
    onError: error => notify(error instanceof Error ? error.message : 'Could not update club membership.', 'error'),
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
      department_code: profile.data.department_code ?? '',
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
        <div className="student-profile-meta"><span><UserRound size={15} /> {profile.data?.department_name ?? 'Department not set'}</span><span><Badge>{profile.data?.year ? `${profile.data.year}${profile.data.year === 1 ? 'st' : profile.data.year === 2 ? 'nd' : profile.data.year === 3 ? 'rd' : 'th'} Year` : '—'}</Badge></span></div>
      </Card>
      <Card className="student-summary-card"><span className="summary-icon summary-violet"><CalendarDays size={18} /></span><span className="eyebrow">YOUR PLANS</span><strong>{registrations.data?.length ?? '—'}</strong><p>Event registrations</p><Link to="/events">Discover more <ArrowRight size={14} /></Link></Card>
      <Card className="student-summary-card"><span className="summary-icon summary-teal"><UserRound size={18} /></span><span className="eyebrow">YOUR CLUBS</span><strong>{memberships.data?.filter(item => item.status === 'active').length ?? '—'}</strong><p>Active memberships</p><Link to="/clubs">Find your people <ArrowRight size={14} /></Link></Card>
    </section>

    <section className="portal-section">
      <div className="section-heading"><div><span className="eyebrow">CAMPUS COMMUNITIES</span><h2>Club memberships</h2><p>Join clubs that match your interests, or leave whenever you like.</p></div></div>
      {memberships.isError ? <Card><EmptyState title="Memberships unavailable" description="Club actions are disabled until your membership status can be loaded." /></Card> : clubs.data?.length ? <div className="event-grid">{clubs.data.map(club => {
        const membership = memberships.data?.find(item => item.club_id === club.club_id && item.status === 'active');
        return <Card className="student-summary-card" key={club.club_id}><span className="eyebrow">CAMPUS CLUB</span><h3>{club.club_name}</h3><Button variant={membership ? 'secondary' : 'primary'} disabled={membershipMutation.isPending || memberships.isLoading || memberships.isError} onClick={() => membershipMutation.mutate({ clubId: club.club_id, joined: Boolean(membership) })}>{membership ? 'Leave club' : 'Join club'}</Button></Card>;
      })}</div> : <Card><EmptyState title="No clubs are listed" description="New campus communities will appear here." /></Card>}
    </section>

    <section className="portal-section">
      <div className="section-heading"><div><span className="eyebrow">SAVE THE DATE</span><h2>Upcoming events</h2><p>Make a little room in your calendar.</p></div><Link className="text-link" to="/events">All events <ArrowRight size={15} /></Link></div>
      {upcoming.length ? <div className="event-grid student-event-grid">{upcoming.slice(0, 3).map((event, index) => {
        const eventDate = new Date(`${event.event_date.split('T')[0]}T00:00:00`);
        return <Card className={`event-card event-color-${index % 3}`} key={event.event_id}>
          <div className="event-date"><span>{eventDate.toLocaleDateString('en-IN', { month: 'short' })}</span><strong>{eventDate.toLocaleDateString('en-IN', { day: '2-digit' })}</strong></div>
          <div className="event-card-content"><Badge>{event.club_name}</Badge><h3>{event.event_name}</h3><p><MapPin size={14} /> {event.location}</p><p>{event.entry_fee === 0 ? 'Free' : `₹${event.entry_fee.toFixed(2)}`} · {event.available_slots} slots left</p></div>
          <Button variant={registeredIds.has(event.event_id) ? 'secondary' : 'primary'} disabled={registeredIds.has(event.event_id) || registerMutation.isPending || !['registration_open', 'full'].includes(event.lifecycle_status)} onClick={() => registerMutation.mutate(event)}>{registeredIds.has(event.event_id) ? 'Registered' : event.lifecycle_status === 'full' ? 'Join waitlist' : 'Join event'}</Button>
        </Card>;
      })}</div> : <Card><EmptyState title="No upcoming events right now" description="New campus events will appear here as soon as they’re scheduled." /></Card>}
    </section>

    <section className="portal-section">
      <div className="section-heading"><div><span className="eyebrow">YOUR CAMPUS ACTIVITY</span><h2>My registrations</h2><p>Your event sign-ups and history, in one place.</p></div></div>
      <Card className="table-card">
        {registrations.data?.length ? <div className="responsive-table"><table><thead><tr><th>Event</th><th>Date</th><th>Club</th><th>Entry fee</th><th>Status</th><th /></tr></thead><tbody>
          {registrations.data.map(registration => {
            const active = ['confirmed', 'waitlisted', 'promotion_pending'].includes(registration.status ?? '');
            const future = registration.event_date ? new Date(`${registration.event_date.split('T')[0]}T00:00:00`) >= today : false;
            const statusLabel = registration.status === 'promotion_pending' ? 'Confirm place'
              : registration.status === 'waitlisted' ? `Waitlist #${registration.waitlist_position ?? '—'}`
                : registration.status === 'promotion_expired' ? 'Offer expired'
                  : registration.status === 'cancelled' ? 'Cancelled'
                    : registration.status === 'attended' ? 'Attended'
                      : future ? 'Confirmed' : 'Completed';
            return <tr key={registration.reg_id}><td><strong>{registration.event_name}</strong></td><td>{registration.event_date ? new Date(`${registration.event_date.split('T')[0]}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td><td><Badge>{registration.club_name}</Badge></td><td>₹ {Number(registration.entry_fee).toFixed(2)}</td><td><Badge className={registration.status === 'confirmed' || registration.status === 'attended' ? 'badge-success' : registration.status === 'cancelled' ? 'badge-neutral' : ''}>{statusLabel}</Badge></td><td>{registration.status === 'promotion_pending' && <Button variant="primary" onClick={() => confirmPromotion.mutate(registration.reg_id)}>Confirm</Button>}{active && future && <Button variant="ghost" onClick={() => window.confirm(`Cancel your registration for ${registration.event_name}?`) && cancelMutation.mutate(registration.reg_id)}>Cancel</Button>}</td></tr>;
          })}
        </tbody></table></div> : <EmptyState title="No registrations yet" description="Explore the campus calendar and save a place at something you’re excited about." />}
      </Card>
    </section>

    <Modal open={profileOpen} onOpenChange={setProfileOpen} title="Edit your profile" description="Keep your campus details up to date. Your USN cannot be changed here.">
      <form className="modal-form" onSubmit={profileForm.handleSubmit(values => profileMutation.mutate(values))}>
        <label className="form-field"><span>Full name</span><input {...profileForm.register('full_name')} />{profileForm.formState.errors.full_name && <small className="field-error">{profileForm.formState.errors.full_name.message}</small>}</label>
        <label className="form-field"><span>Gmail address</span><input {...profileForm.register('email')} type="email" />{profileForm.formState.errors.email && <small className="field-error">{profileForm.formState.errors.email.message}</small>}</label>
        <div className="form-row">
          <label className="form-field"><span>Year</span><select {...profileForm.register('year')}>{(config.data?.academic_years ?? [1, 2, 3, 4]).map(year => <option value={year} key={year}>{year} Year</option>)}</select>{profileForm.formState.errors.year && <small className="field-error">Choose a year.</small>}</label>
          <label className="form-field"><span>Department</span><select {...profileForm.register('department_code')}><option value="">Choose department</option>{config.data?.departments.map(department => <option value={department.department_code} key={department.department_code}>{department.department_name}</option>)}</select>{profileForm.formState.errors.department_code && <small className="field-error">{profileForm.formState.errors.department_code.message}</small>}</label>
        </div>
        <div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setProfileOpen(false)}>Cancel</Button><Button disabled={profileMutation.isPending}>{profileMutation.isPending ? 'Saving…' : 'Save changes'}</Button></div>
      </form>
    </Modal>
  </div>;
}
