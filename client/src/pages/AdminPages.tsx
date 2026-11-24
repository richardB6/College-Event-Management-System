import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownRight, ArrowLeft, ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, CirclePlus, Pencil, Search, Settings as SettingsIcon, ShieldCheck, Trash2, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { z } from 'zod';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { Club, DashboardData, Department, Event, PageResult, Registration, Student } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { Badge, Button, Card, EmptyState, Modal, PageLoader, useToast } from '../components/ui';

function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <header className="portal-page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</header>;
}

function QueryError({ message = 'We couldn’t load this information. Please try again.' }: { message?: string }) {
  return <Card><EmptyState title="Something went wrong" description={message} /></Card>;
}

function Pagination({ page, limit, total, onPageChange }: { page: number; limit: number; total: number; onPageChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return <div className="pagination"><span>{total ? `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} of ${total}` : 'No records'}</span><div><Button variant="secondary" className="pagination-button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></Button><span>Page {page} of {pages}</span><Button variant="secondary" className="pagination-button" disabled={page >= pages} onClick={() => onPageChange(page + 1)} aria-label="Next page"><ChevronRight size={16} /></Button></div></div>;
}

function usePagedData<T>(path: string, key: string, page: number, search: string) {
  const params = new URLSearchParams({ page: String(page), limit: '25' });
  if (search.trim()) params.set('search', search.trim());
  return useQuery({ queryKey: ['admin', key, page, search], queryFn: () => api<PageResult<T>>(`${path}?${params}`), placeholderData: previous => previous });
}

export function AdminDashboardPage() {
  const dashboard = useQuery({ queryKey: ['admin', 'dashboard'], queryFn: () => api<DashboardData>('/admin/dashboard') });
  if (dashboard.isLoading) return <PageLoader label="Loading your campus overview…" />;
  if (dashboard.isError || !dashboard.data) return <div className="portal-content"><QueryError /></div>;
  const data = dashboard.data;
  const metrics = [
    { label: 'STUDENTS', value: data.students, icon: Users, tone: 'violet', href: '/admin/students' },
    { label: 'CLUBS', value: data.clubs, icon: ShieldCheck, tone: 'teal', href: '/admin/clubs' },
    { label: 'EVENTS', value: data.events, icon: CalendarDays, tone: 'gold', href: '/admin/events' },
    { label: 'REGISTRATIONS', value: data.registrations, icon: ArrowUpRight, tone: 'coral', href: '/admin/registrations' },
  ];
  return <div className="portal-content">
    <PageTitle eyebrow="CAMPUS WORKSPACE" title="Overview" description="A clear view of your university community." />
    <section className="admin-metrics">{metrics.map(metric => <Card className={`metric-card metric-${metric.tone}`} key={metric.label}><div className="metric-top"><span className="metric-icon"><metric.icon size={18} /></span><span className="eyebrow">{metric.label}</span></div><strong>{metric.value.toLocaleString('en-IN')}</strong><Link to={metric.href}>View details <ArrowDownRight size={14} /></Link></Card>)}</section>

    <section className="admin-content-grid">
      <Card className="chart-card">
        <div className="card-heading"><div><span className="eyebrow">REAL REGISTRATION DATA</span><h2>Participation by event</h2><p>Registration totals for events in your calendar.</p></div></div>
        {data.registrations_by_event.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height={280}><BarChart data={data.registrations_by_event} margin={{ top: 10, right: 12, bottom: 10, left: -18 }}><CartesianGrid stroke="var(--line)" strokeDasharray="4 5" vertical={false} /><XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} interval={0} angle={-15} textAnchor="end" height={55} /><YAxis allowDecimals={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip cursor={{ fill: 'var(--chart-hover)' }} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--ink)' }} /><Bar dataKey="registrations" name="Registrations" fill="#5B4BDB" radius={[6, 6, 0, 0]} maxBarSize={40} /></BarChart></ResponsiveContainer></div> : <EmptyState title="No event data yet" description="Registration activity will appear when events are created." />}
      </Card>
      <Card className="activity-card">
        <div className="card-heading"><div><span className="eyebrow">ADMINISTRATIVE AUDIT</span><h2>Recent activity</h2><p>Recent account and management actions.</p></div><Link className="text-link" to="/admin/activity">View log <ArrowUpRight size={14} /></Link></div>
        {data.recent_activity.length ? <ol className="activity-list">{data.recent_activity.slice(0, 7).map(activity => <li key={activity.audit_id}><span className={`activity-dot activity-${activity.actor_role}`} /><div><strong>{activity.action.replaceAll('.', ' ')}</strong><span>{activity.actor_role} · {activity.resource_type}{activity.resource_id ? ` #${activity.resource_id}` : ''}</span></div><time>{new Date(activity.created_at.replace(' ', 'T') + 'Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</time></li>)}</ol> : <EmptyState title="No activity recorded yet" description="Administrative activity will appear here." />}
      </Card>
    </section>
    <section className="portal-section">
      <div className="section-heading"><div><span className="eyebrow">CAMPUS COMMUNITIES</span><h2>Club membership insights</h2><p>Active participation across student clubs.</p></div></div>
      <div className="admin-metrics">
        <Card className="metric-card metric-teal"><span className="eyebrow">ACTIVE MEMBERSHIPS</span><strong>{data.active_club_memberships.toLocaleString('en-IN')}</strong></Card>
        <Card className="metric-card metric-violet"><span className="eyebrow">STUDENTS WITHOUT A CLUB</span><strong>{data.students_without_membership.toLocaleString('en-IN')}</strong></Card>
        <Card className="metric-card metric-gold"><span className="eyebrow">MEMBERS BY CLUB</span>{data.club_memberships_by_club.length ? data.club_memberships_by_club.slice(0, 5).map(item => <p key={item.label}>{item.label} <strong>{item.members}</strong></p>) : <p>No clubs available.</p>}</Card>
      </div>
    </section>
    <Card className="quick-actions-panel"><div><span className="eyebrow">KEEP THINGS MOVING</span><h2>Quick actions</h2></div><Link to="/admin/students"><CirclePlus size={18} /> Add a student <ArrowRightIcon /></Link><Link to="/admin/clubs"><CirclePlus size={18} /> Create a club <ArrowRightIcon /></Link><Link to="/admin/events"><CirclePlus size={18} /> Schedule an event <ArrowRightIcon /></Link></Card>
  </div>;
}

function ArrowRightIcon() { return <ArrowUpRight size={15} />; }
function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="search-field"><Search size={16} /><input value={value} onChange={event => onChange(event.target.value)} type="search" placeholder={placeholder} /><span className="visually-hidden">Search</span></label>;
}

const studentSchema = z.object({
  fname: z.string().trim().min(1, 'Enter a first name.').max(60),
  lname: z.string().trim().min(1, 'Enter a last name.').max(60),
  year: z.coerce.number().int().min(1).max(4),
  department_code: z.string().min(1, 'Choose a department.'),
});
type StudentValues = z.infer<typeof studentSchema>;
type StudentInput = z.input<typeof studentSchema>;

export function AdminStudentsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [department, setDepartment] = useState('');
  const [year, setYear] = useState('');
  const [membership, setMembership] = useState('');
  const [accountStatus, setAccountStatus] = useState('');
  const [editing, setEditing] = useState<Student | null | undefined>(undefined);
  const queryClient = useQueryClient();
  const notify = useToast();
  const params = new URLSearchParams({ page: String(page), limit: '25' });
  if (search.trim()) params.set('search', search.trim());
  if (department) params.set('department_code', department);
  if (year) params.set('year', year);
  if (membership) params.set('membership', membership);
  if (accountStatus) params.set('account_status', accountStatus);
  const students = useQuery({
    queryKey: ['admin', 'students', page, search, department, year, membership, accountStatus],
    queryFn: () => api<PageResult<Student>>(`/admin/students?${params}`),
    placeholderData: previous => previous,
  });
  const config = useQuery({
    queryKey: ['public-config'],
    queryFn: () => api<{ departments: Department[]; academic_years: number[] }>('/public/config'),
    staleTime: Infinity,
  });
  const form = useForm<StudentInput, unknown, StudentValues>({ resolver: zodResolver(studentSchema) });
  useEffect(() => { setPage(1); }, [search, department, year, membership, accountStatus]);

  const save = useMutation({
    mutationFn: (values: StudentValues) => editing
      ? api(`/admin/students/${editing.student_id}`, { method: 'PATCH', body: JSON.stringify(values) })
      : api('/admin/students', { method: 'POST', body: JSON.stringify(values) }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['admin', 'students'] }); await queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] }); notify(editing ? 'Student details updated.' : 'Student record added.'); setEditing(undefined); },
    onError: error => notify(error instanceof Error ? error.message : 'Could not save this student.', 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api<void>(`/admin/students/${id}`, { method: 'DELETE' }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['admin'] }); notify('Student record deleted.'); },
    onError: error => notify(error instanceof Error ? error.message : 'Could not delete this student.', 'error'),
  });
  const status = useMutation({
    mutationFn: (student: Student) => api(`/admin/students/${student.student_id}/status`, { method: 'PATCH', body: JSON.stringify({ account_status: student.account_status === 'active' ? 'suspended' : 'active' }) }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['admin', 'students'] }); notify('Student account status updated.'); },
    onError: error => notify(error instanceof Error ? error.message : 'Could not update account status.', 'error'),
  });

  function openForm(student?: Student) {
    form.reset(student ? {
      fname: student.fname,
      lname: student.lname,
      year: student.year,
      department_code: student.department_code ?? '',
    } : { fname: '', lname: '', year: 1, department_code: '' });
    setEditing(student ?? null);
  }

  return <div className="portal-content">
    <PageTitle eyebrow="CAMPUS COMMUNITY" title="Students" description="Manage student records and account access." action={<Button onClick={() => openForm()}><CirclePlus size={16} /> Add student</Button>} />
    <Card className="table-card">
      <div className="table-toolbar"><div><h2>Student directory</h2><p>Personal information is visible to authorized administrators only.</p></div><div className="toolbar-filters"><SearchBox value={search} onChange={setSearch} placeholder="Search name, USN, email…" /><select className="select-control" aria-label="Filter by department" value={department} onChange={event => setDepartment(event.target.value)}><option value="">All departments</option>{config.data?.departments.map(item => <option value={item.department_code} key={item.department_code}>{item.department_name}</option>)}</select><select className="select-control" aria-label="Filter by academic year" value={year} onChange={event => setYear(event.target.value)}><option value="">All years</option>{(config.data?.academic_years ?? [1, 2, 3, 4]).map(item => <option value={item} key={item}>{item} Year</option>)}</select><select className="select-control" aria-label="Filter by club membership" value={membership} onChange={event => setMembership(event.target.value)}><option value="">All membership states</option><option value="active">Has active membership</option><option value="none">No active membership</option></select><select className="select-control" aria-label="Filter by account status" value={accountStatus} onChange={event => setAccountStatus(event.target.value)}><option value="">All account states</option><option value="active">Active account</option><option value="suspended">Suspended account</option><option value="no_account">No login account</option></select></div></div>
      {students.isLoading ? <PageLoader /> : students.isError ? <QueryError /> : students.data?.items.length ? <div className="responsive-table"><table><thead><tr><th>Student</th><th>USN</th><th>Year / department</th><th>Account</th><th>Actions</th></tr></thead><tbody>
        {students.data.items.map(student => <tr key={student.student_id}><td><Link to={`/admin/students/${student.student_id}`} className="text-link"><strong>{student.full_name}</strong></Link><small>{student.email ?? 'No account email'}</small></td><td>{student.usn ?? <span className="muted-value">Not provided</span>}</td><td>Year {student.year}<small>{student.department_name ?? 'Unspecified (legacy)'}</small></td><td><Badge className={student.has_account ? '' : 'badge-neutral'}>{student.has_account ? student.account_status : 'No account'}</Badge></td><td><div className="table-actions"><Button variant="secondary" className="icon-action" onClick={() => openForm(student)} aria-label={`Edit ${student.full_name}`}><Pencil size={15} /></Button>{student.has_account && <Button variant="secondary" className="text-action" onClick={() => status.mutate(student)}>{student.account_status === 'active' ? 'Suspend' : 'Reactivate'}</Button>}<Button variant="danger" className="icon-action" onClick={() => window.confirm(`Delete ${student.full_name} and their registrations?`) && remove.mutate(student.student_id)} aria-label={`Delete ${student.full_name}`}><Trash2 size={15} /></Button></div></td></tr>)}
      </tbody></table></div> : <EmptyState title="No students found" description={search ? 'Try another search.' : 'Add a student record to get started.'} />}
      {students.data && <Pagination page={students.data.page} limit={students.data.limit} total={students.data.total} onPageChange={setPage} />}
    </Card>
    <Modal open={editing !== undefined} onOpenChange={open => !open && setEditing(undefined)} title={editing ? 'Edit student record' : 'Add student record'} description="Student accounts and login identifiers are created separately through student signup.">
      <form className="modal-form" onSubmit={form.handleSubmit(values => save.mutate(values))}>
        <div className="form-row"><label className="form-field"><span>First name</span><input {...form.register('fname')} />{form.formState.errors.fname && <small className="field-error">{form.formState.errors.fname.message}</small>}</label><label className="form-field"><span>Last name</span><input {...form.register('lname')} />{form.formState.errors.lname && <small className="field-error">{form.formState.errors.lname.message}</small>}</label></div>
        <div className="form-row"><label className="form-field"><span>Year</span><select {...form.register('year')}>{(config.data?.academic_years ?? [1, 2, 3, 4]).map(item => <option value={item} key={item}>{item} Year</option>)}</select>{form.formState.errors.year && <small className="field-error">{form.formState.errors.year.message}</small>}</label><label className="form-field"><span>Department</span><select {...form.register('department_code')}><option value="">Choose department</option>{config.data?.departments.map(item => <option value={item.department_code} key={item.department_code}>{item.department_name}</option>)}</select>{form.formState.errors.department_code && <small className="field-error">{form.formState.errors.department_code.message}</small>}</label></div>
        <div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setEditing(undefined)}>Cancel</Button><Button disabled={save.isPending}>{save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Add student'}</Button></div>
      </form>
    </Modal>
  </div>;
}

interface AdminStudentProfile {
  student: Student;
  club_memberships: { club_id: number; club_name: string; status: string; joined_at: string | null; designation: string }[];
  registrations: (Registration & { registered_at: string | null; start_time: string; end_date: string; end_time: string })[];
  waitlist_history: { action: string; position: number | null; created_at: string | null; event_name: string; event_id: number }[];
  activity: { type: string; created_at: string | null; resource_type: string; resource_id: string | null; details: string | null }[];
}

function formatStudentDate(value: string | null | undefined, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) {
  if (!value) return 'Not recorded';
  const date = new Date(`${value.replace(' ', 'T')}${value.includes('Z') || /[+-]\d{2}:\d{2}$/.test(value) ? '' : 'Z'}`);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString('en-IN', options);
}

export function AdminStudentDetailPage() {
  const { studentId = '' } = useParams();
  const query = useQuery({
    queryKey: ['admin', 'student', studentId],
    queryFn: () => api<AdminStudentProfile>(`/admin/students/${studentId}`),
    enabled: /^\d+$/.test(studentId),
  });
  if (query.isLoading) return <PageLoader label="Loading student profile…" />;
  if (query.isError || !query.data) return <div className="portal-content"><QueryError message="This student profile could not be loaded." /></div>;
  const { student } = query.data;
  const registrations = query.data.registrations ?? [];
  const club_memberships = query.data.club_memberships ?? [];
  const waitlist_history = query.data.waitlist_history ?? [];
  const activity = query.data.activity ?? [];
  return <div className="portal-content">
    <PageTitle eyebrow="CAMPUS COMMUNITY / STUDENT PROFILE" title={student.full_name} description="Authorized student record and participation history." action={<Link className="button button-secondary" to="/admin/students"><ArrowLeft size={15} /> Student directory</Link>} />
    <section className="admin-content-grid">
      <Card><span className="eyebrow">STUDENT INFORMATION</span><h2>{student.full_name}</h2><p>{student.email ?? 'No account email'} · {student.usn ?? 'No USN'}</p><p>{student.department_name ?? 'Unspecified (legacy)'} · Year {student.year}</p><p>Account: {student.has_account ? student.account_status : 'No account'}</p><p>Created: {formatStudentDate(student.created_at, { dateStyle: 'medium', timeStyle: 'short' })}</p></Card>
      <Card><span className="eyebrow">CLUB MEMBERSHIPS</span><h2>{club_memberships.filter(item => item.status === 'active').length} active memberships</h2>{club_memberships.length ? club_memberships.map((membership, index) => <p key={`${membership.club_name}-${index}`}><Link className="text-link" to={`/admin/clubs/${membership.club_id}`}>{membership.club_name}</Link> · {membership.designation} · {membership.status} · joined {formatStudentDate(membership.joined_at)}</p>) : <p>No membership records are available.</p>}</Card>
    </section>
    <section className="portal-section">
      <div className="section-heading"><div><span className="eyebrow">EVENT PARTICIPATION</span><h2>Registrations</h2></div></div>
      <Card className="table-card">{registrations.length ? <div className="responsive-table"><table><thead><tr><th>Event</th><th>Schedule</th><th>Registration</th><th>Fee</th><th>Status</th></tr></thead><tbody>{registrations.map(item => <tr key={item.reg_id}><td><Link className="text-link" to={`/admin/events/${item.event_id}`}><strong>{item.event_name}</strong></Link><small>{item.club_name}</small></td><td>{item.event_date} · {item.start_time}–{item.end_time}</td><td>{formatStudentDate(item.registered_at, { dateStyle: 'medium', timeStyle: 'short' })}</td><td>₹{Number(item.entry_fee).toFixed(2)}</td><td><Badge>{item.status ?? 'confirmed'}{item.waitlist_position ? ` #${item.waitlist_position}` : ''}</Badge></td></tr>)}</tbody></table></div> : <EmptyState title="No event registrations" description="This student has no event registration history." />}</Card>
    </section>
    <section className="admin-content-grid">
      <Card><span className="eyebrow">WAITLIST HISTORY</span><h2>Waitlist activity</h2>{waitlist_history.length ? <ol className="activity-list">{waitlist_history.map((item, index) => <li key={`${item.event_id}-${item.action}-${item.created_at}-${index}`}><span className="activity-dot activity-student" /><div><strong>{item.event_name}: {item.action.replaceAll('_', ' ')}</strong><span>{item.position ? `Position #${item.position}` : ''}</span></div><time>{formatStudentDate(item.created_at)}</time></li>)}</ol> : <p>No waitlist history.</p>}</Card>
      <Card><span className="eyebrow">ACTIVITY TIMELINE</span><h2>Recent activity</h2>{activity.length ? <ol className="activity-list">{activity.map((item, index) => <li key={`${item.type}-${item.created_at}-${index}`}><span className="activity-dot activity-student" /><div><strong>{item.type.replaceAll('.', ' ')}</strong><span>{item.resource_type}{item.resource_id ? ` #${item.resource_id}` : ''}</span></div><time>{formatStudentDate(item.created_at)}</time></li>)}</ol> : <p>No tracked activity yet.</p>}</Card>
    </section>
  </div>;
}

interface OrganizerAccount {
  admin_id: number;
  email: string;
  club_id: number;
  club_name: string;
  created_at: string;
}

interface AdminClubProfile {
  club: Club;
  memberships: {
    membership_id: number;
    student_id: number;
    student_name: string;
    usn: string | null;
    email: string | null;
    year: number;
    department_name: string | null;
    designation: string;
    status: string;
    joined_at: string;
  }[];
  events: Event[];
}

export function AdminClubDetailPage() {
  const { clubId = '' } = useParams();
  const query = useQuery({
    queryKey: ['admin', 'club', clubId],
    queryFn: () => api<AdminClubProfile>(`/admin/clubs/${clubId}`),
    enabled: /^\d+$/.test(clubId),
  });
  if (query.isLoading) return <PageLoader label="Loading club details…" />;
  if (query.isError || !query.data) return <div className="portal-content"><QueryError message="This club and its participation details could not be loaded." /></div>;
  const { club, memberships, events } = query.data;
  return <div className="portal-content">
    <PageTitle eyebrow="CAMPUS COMMUNITY / CLUB DETAILS" title={club.club_name} description="Club members and events hosted by this community." action={<Link className="button button-secondary" to="/admin/clubs"><ArrowLeft size={15} /> Club directory</Link>} />
    <section className="admin-content-grid">
      <Card><span className="eyebrow">MEMBERS</span><h2>{memberships.filter(item => item.status === 'active').length} active members</h2><p>{memberships.length} membership records, including past members.</p></Card>
      <Card><span className="eyebrow">EVENTS</span><h2>{events.length} events</h2><p>All events hosted by this club.</p></Card>
    </section>
    <section className="portal-section">
      <div className="section-heading"><div><span className="eyebrow">COMMUNITY</span><h2>Members</h2></div></div>
      <Card className="table-card">{memberships.length ? <div className="responsive-table"><table><thead><tr><th>Student</th><th>Year / department</th><th>Designation</th><th>Status</th><th>Joined</th></tr></thead><tbody>{memberships.map(member => <tr key={member.membership_id}><td><Link className="text-link" to={`/admin/students/${member.student_id}`}><strong>{member.student_name}</strong></Link><small>{member.usn ?? 'No USN'}{member.email ? ` · ${member.email}` : ''}</small></td><td>Year {member.year}<small>{member.department_name ?? 'Unspecified department'}</small></td><td>{member.designation.replaceAll('_', ' ')}</td><td><Badge className={member.status === 'active' ? '' : 'badge-neutral'}>{member.status}</Badge></td><td>{new Date(member.joined_at.replace(' ', 'T') + 'Z').toLocaleDateString('en-IN')}</td></tr>)}</tbody></table></div> : <EmptyState title="No membership history" description="Students who join this club will appear here." />}</Card>
    </section>
    <section className="portal-section">
      <div className="section-heading"><div><span className="eyebrow">CLUB CALENDAR</span><h2>Events</h2></div></div>
      <Card className="table-card">{events.length ? <div className="responsive-table"><table><thead><tr><th>Event</th><th>Schedule</th><th>Registration</th><th>Status</th></tr></thead><tbody>{events.map(event => <tr key={event.event_id}><td><Link className="text-link" to={`/admin/events/${event.event_id}`}><strong>{event.event_name}</strong></Link><small>{event.category}</small></td><td>{event.event_date} · {event.start_time}–{event.end_time}<small>{event.location}</small></td><td>{event.confirmed_count} confirmed · {event.waitlist_count} waiting</td><td><Badge>{event.lifecycle_status.replaceAll('_', ' ')}</Badge></td></tr>)}</tbody></table></div> : <EmptyState title="No events yet" description="Events created for this club will be listed here." />}</Card>
    </section>
  </div>;
}

export function AdminOrganizersPage() {
  const [email, setEmail] = useState('');
  const [clubId, setClubId] = useState('');
  const [credential, setCredential] = useState<{ email: string; password: string } | null>(null);
  const queryClient = useQueryClient();
  const notify = useToast();
  const organizers = useQuery({
    queryKey: ['admin', 'organizers'],
    queryFn: () => api<OrganizerAccount[]>('/admin/organizers'),
  });
  const clubs = useQuery({
    queryKey: ['admin', 'clubs', 'organizer-options'],
    queryFn: () => api<PageResult<Club>>('/admin/clubs?limit=100'),
  });
  const create = useMutation({
    mutationFn: () => api<{ email: string; temporary_password: string }>('/admin/organizers', {
      method: 'POST',
      body: JSON.stringify({ email, club_id: Number(clubId) }),
    }),
    onSuccess: async result => {
      setCredential({ email: result.email, password: result.temporary_password });
      setEmail('');
      setClubId('');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'organizers'] });
      notify('Organizer account created. Save the temporary password now.');
    },
    onError: error => notify(error instanceof Error ? error.message : 'Could not create organizer account.', 'error'),
  });
  return <div className="portal-content">
    <PageTitle eyebrow="ACCESS MANAGEMENT" title="Organizers" description="Create club-scoped event manager accounts." />
    <Card className="table-card">
      <div className="table-toolbar"><div><h2>Create organizer account</h2><p>The temporary password is shown once and is not stored in the audit log.</p></div></div>
      <form className="modal-form" onSubmit={event => { event.preventDefault(); create.mutate(); }}>
        <div className="form-row"><label className="form-field"><span>Gmail address</span><input type="email" required value={email} onChange={event => setEmail(event.target.value)} /></label><label className="form-field"><span>Assigned club</span><select required value={clubId} onChange={event => setClubId(event.target.value)}><option value="">Choose club</option>{clubs.data?.items.map(club => <option key={club.club_id} value={club.club_id}>{club.club_name}</option>)}</select></label></div>
        <div className="modal-actions"><Button disabled={create.isPending || !clubs.data?.items.length}>{create.isPending ? 'Creating…' : 'Create organizer'}</Button></div>
      </form>
      {credential && <div className="auth-notice" role="status"><strong>Copy this temporary credential and share it securely.</strong><p>{credential.email}</p><code>{credential.password}</code></div>}
    </Card>
    <Card className="table-card"><div className="table-toolbar"><div><h2>Organizer accounts</h2><p>Each account can manage events and registrations for its assigned club only.</p></div></div>
      {organizers.isLoading ? <PageLoader /> : organizers.isError ? <QueryError /> : organizers.data?.length ? <div className="responsive-table"><table><thead><tr><th>Account</th><th>Assigned club</th><th>Created</th></tr></thead><tbody>{organizers.data.map(organizer => <tr key={organizer.admin_id}><td>{organizer.email}</td><td>{organizer.club_name}</td><td>{new Date(organizer.created_at.replace(' ', 'T') + 'Z').toLocaleDateString('en-IN')}</td></tr>)}</tbody></table></div> : <EmptyState title="No organizers" description="Create an organizer account to delegate event management." />}
    </Card>
  </div>;
}

export function AdminSettingsPage() {
  const [confirmationMinutes, setConfirmationMinutes] = useState('');
  const queryClient = useQueryClient();
  const notify = useToast();
  const settings = useQuery({
    queryKey: ['admin', 'settings', 'waitlist'],
    queryFn: () => api<{ confirmation_minutes: number }>('/admin/settings/waitlist'),
  });
  useEffect(() => {
    if (settings.data) setConfirmationMinutes(String(settings.data.confirmation_minutes));
  }, [settings.data?.confirmation_minutes]);
  const save = useMutation({
    mutationFn: () => api<{ confirmation_minutes: number }>('/admin/settings/waitlist', {
      method: 'PATCH',
      body: JSON.stringify({ confirmation_minutes: Number(confirmationMinutes) }),
    }),
    onSuccess: async result => {
      setConfirmationMinutes(String(result.confirmation_minutes));
      await queryClient.invalidateQueries({ queryKey: ['admin', 'settings', 'waitlist'] });
      notify('Waitlist settings saved.');
    },
    onError: error => notify(error instanceof Error ? error.message : 'Could not save waitlist settings.', 'error'),
  });
  return <div className="portal-content">
    <PageTitle eyebrow="CAMPUS WORKSPACE" title="Settings" description="Configure how students are offered places from the waitlist." />
    <Card className="table-card">
      <div className="table-toolbar"><div><h2><SettingsIcon size={18} /> Waitlist confirmation window</h2><p>Choose how long a promoted student has to confirm their place.</p></div></div>
      {settings.isLoading ? <PageLoader /> : settings.isError ? <QueryError /> : <form className="modal-form" onSubmit={event => { event.preventDefault(); save.mutate(); }}>
        <label className="form-field"><span>Confirmation deadline (minutes)</span><input type="number" min={5} max={1440} step={1} required value={confirmationMinutes} onChange={event => setConfirmationMinutes(event.target.value)} /><small>Allowed range: 5–1,440 minutes. The setting applies to new offers; existing deadlines remain unchanged.</small></label>
        <div className="modal-actions"><Button disabled={save.isPending || !confirmationMinutes}>{save.isPending ? 'Saving…' : 'Save settings'}</Button></div>
      </form>}
    </Card>
  </div>;
}

const clubSchema = z.object({
  club_name: z.string().trim().min(1, 'Enter a club name.').max(100),
  description: z.string().trim().min(1, 'Enter a club description.').max(5000),
  category: z.string().trim().min(1, 'Choose a category.').max(80),
  founding_year: z.string().refine(value => !value || (/^\d{4}$/.test(value) && Number(value) >= 1800 && Number(value) <= new Date().getFullYear()), 'Enter a valid founding year.'),
  founder_name: z.string().trim().max(120),
  president_name: z.string().trim().min(1, 'Enter the current president name.').max(120),
  president_email: z.string().trim().email('Enter a valid president email.').max(254),
  president_phone: z.string().trim().min(5, 'Enter a president phone number.').max(30),
  mission: z.string().trim().max(5000),
  contact_email: z.string().trim().refine(value => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'Enter a valid contact email.').max(254),
  contact_phone: z.string().trim().max(30),
  logo_path: z.string(),
  banner_path: z.string(),
});
type ClubValues = z.infer<typeof clubSchema>;

export function AdminClubsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Club | null | undefined>(undefined);
  const [logoPreview, setLogoPreview] = useState<string>();
  const [bannerPreview, setBannerPreview] = useState<string>();
  useEffect(() => () => {
    if (logoPreview?.startsWith('blob:')) URL.revokeObjectURL(logoPreview);
    if (bannerPreview?.startsWith('blob:')) URL.revokeObjectURL(bannerPreview);
  }, [logoPreview, bannerPreview]);
  const queryClient = useQueryClient();
  const notify = useToast();
  const clubs = usePagedData<Club>('/admin/clubs', 'clubs', page, search);
  const form = useForm<ClubValues>({ resolver: zodResolver(clubSchema) });
  useEffect(() => { setPage(1); }, [search]);
  const save = useMutation({
    mutationFn: (values: ClubValues) => {
      const payload = {
        ...values,
        founding_year: values.founding_year ? Number(values.founding_year) : null,
        logo_path: values.logo_path || null,
        banner_path: values.banner_path || null,
      };
      return editing
        ? api(`/admin/clubs/${editing.club_id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : api('/admin/clubs', { method: 'POST', body: JSON.stringify(payload) });
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['admin', 'clubs'] }); await queryClient.invalidateQueries({ queryKey: ['public'] }); await queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] }); notify(editing ? 'Club updated.' : 'Club created.'); setEditing(undefined); },
    onError: error => notify(error instanceof Error ? error.message : 'Could not save this club.', 'error'),
  });
  const uploadImage = useMutation({
    mutationFn: ({ file }: { kind: 'logo' | 'banner'; file: File }) => {
      const data = new FormData();
      data.append('image', file);
      return api<{ image_path: string }>('/admin/club-images', { method: 'POST', body: data });
    },
    onSuccess: (result, variables) => {
      form.setValue(`${variables.kind}_path`, result.image_path, { shouldDirty: true });
      if (variables.kind === 'logo') setLogoPreview(result.image_path);
      else setBannerPreview(result.image_path);
      notify(`${variables.kind === 'logo' ? 'Logo' : 'Banner'} uploaded. Save the club to apply it.`);
    },
    onError: error => notify(error instanceof Error ? error.message : 'Could not upload this image.', 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api<void>(`/admin/clubs/${id}`, { method: 'DELETE' }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['admin'] }); await queryClient.invalidateQueries({ queryKey: ['public'] }); notify('Club deleted.'); },
    onError: error => notify(error instanceof Error ? error.message : 'Could not delete this club.', 'error'),
  });
  function openForm(club?: Club) {
    form.reset({
      club_name: club?.club_name ?? '',
      description: club?.description ?? '',
      category: club?.category ?? '',
      founding_year: club?.founding_year ? String(club.founding_year) : '',
      founder_name: club?.founder_name ?? '',
      president_name: club?.president_name ?? '',
      president_email: club?.president_email ?? '',
      president_phone: club?.president_phone ?? '',
      mission: club?.mission ?? '',
      contact_email: club?.contact_email ?? '',
      contact_phone: club?.contact_phone ?? '',
      logo_path: club?.logo_path ?? '',
      banner_path: club?.banner_path ?? '',
    });
    setLogoPreview(club?.logo_path ?? undefined);
    setBannerPreview(club?.banner_path ?? undefined);
    setEditing(club ?? null);
  }
  function chooseClubImage(kind: 'logo' | 'banner', file?: File) {
    if (!file) return;
    const preview = URL.createObjectURL(file);
    if (kind === 'logo') setLogoPreview(preview);
    else setBannerPreview(preview);
    uploadImage.mutate({ kind, file });
  }
  function clearClubImage(kind: 'logo' | 'banner') {
    form.setValue(`${kind}_path`, '', { shouldDirty: true });
    if (kind === 'logo') setLogoPreview(undefined);
    else setBannerPreview(undefined);
  }
  return <div className="portal-content">
    <PageTitle eyebrow="WORKSPACE / CLUBS" title="Clubs" description="Grow the campus communities students can discover." action={<Button onClick={() => openForm()}><CirclePlus size={16} /> Add club</Button>} />
    <Card className="table-card">
      <div className="table-toolbar"><div><h2>All clubs</h2><p>Clubs are part of the public campus directory.</p></div><SearchBox value={search} onChange={setSearch} placeholder="Search clubs…" /></div>
      {clubs.isLoading ? <PageLoader /> : clubs.isError ? <QueryError /> : clubs.data?.items.length ? <div className="responsive-table"><table><thead><tr><th>Club</th><th>Club ID</th><th>Actions</th></tr></thead><tbody>{clubs.data.items.map((club, index) => <tr key={club.club_id}><td><div className={`table-club-mark club-color-${index % 5}`}>{club.club_name.charAt(0).toUpperCase()}</div><Link className="text-link" to={`/admin/clubs/${club.club_id}`}><strong>{club.club_name}</strong></Link></td><td>{club.club_id}</td><td><div className="table-actions"><Button variant="secondary" className="icon-action" onClick={() => openForm(club)} aria-label={`Edit ${club.club_name}`}><Pencil size={15} /></Button><Button variant="danger" className="icon-action" onClick={() => window.confirm(`Delete ${club.club_name}? Clubs with events must be cleared first.`) && remove.mutate(club.club_id)} aria-label={`Delete ${club.club_name}`}><Trash2 size={15} /></Button></div></td></tr>)}</tbody></table></div> : <EmptyState title="No clubs found" description={search ? 'Try another search.' : 'Create the first campus club.'} />}
      {clubs.data && <Pagination page={clubs.data.page} limit={clubs.data.limit} total={clubs.data.total} onPageChange={setPage} />}
    </Card>
    <Modal open={editing !== undefined} onOpenChange={open => !open && setEditing(undefined)} title={editing ? 'Edit club' : 'Create a club'} description="Share the club's purpose and current leadership with campus.">
      <form className="modal-form" onSubmit={form.handleSubmit(values => save.mutate(values))}>
        <label className="form-field"><span>Club name</span><input {...form.register('club_name')} placeholder="e.g. Robotics Club" />{form.formState.errors.club_name && <small className="field-error">{form.formState.errors.club_name.message}</small>}</label>
        <label className="form-field"><span>Description</span><textarea rows={3} {...form.register('description')} placeholder="What does this club do?" />{form.formState.errors.description && <small className="field-error">{form.formState.errors.description.message}</small>}</label>
        <div className="form-row"><label className="form-field"><span>Category</span><input {...form.register('category')} placeholder="Technology, arts, sports…" />{form.formState.errors.category && <small className="field-error">{form.formState.errors.category.message}</small>}</label><label className="form-field"><span>Founding year</span><input type="number" min="1800" max={new Date().getFullYear()} {...form.register('founding_year')} />{form.formState.errors.founding_year && <small className="field-error">{form.formState.errors.founding_year.message}</small>}</label></div>
        <div className="form-row"><label className="form-field"><span>Founder</span><input {...form.register('founder_name')} /></label><label className="form-field"><span>Mission / objectives</span><textarea rows={2} {...form.register('mission')} /></label></div>
        <h3>Current president</h3>
        <div className="form-row"><label className="form-field"><span>Name</span><input {...form.register('president_name')} />{form.formState.errors.president_name && <small className="field-error">{form.formState.errors.president_name.message}</small>}</label><label className="form-field"><span>Public email</span><input type="email" {...form.register('president_email')} />{form.formState.errors.president_email && <small className="field-error">{form.formState.errors.president_email.message}</small>}</label></div>
        <div className="form-row"><label className="form-field"><span>Public phone</span><input type="tel" {...form.register('president_phone')} />{form.formState.errors.president_phone && <small className="field-error">{form.formState.errors.president_phone.message}</small>}</label><label className="form-field"><span>Club contact email (optional)</span><input type="email" {...form.register('contact_email')} />{form.formState.errors.contact_email && <small className="field-error">{form.formState.errors.contact_email.message}</small>}</label></div>
        <label className="form-field"><span>Club contact phone (optional)</span><input type="tel" {...form.register('contact_phone')} /></label>
        <div className="form-row">
          <label className="form-field"><span>Club logo (JPEG, PNG, WebP; up to 5 MB)</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { chooseClubImage('logo', event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />{logoPreview && <img className="club-image-preview club-image-preview-logo" src={logoPreview} alt="Club logo preview" />}<Button type="button" variant="ghost" onClick={() => clearClubImage('logo')}>Remove logo</Button></label>
          <label className="form-field"><span>Club banner (JPEG, PNG, WebP; up to 5 MB)</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { chooseClubImage('banner', event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />{bannerPreview && <img className="club-image-preview" src={bannerPreview} alt="Club banner preview" />}<Button type="button" variant="ghost" onClick={() => clearClubImage('banner')}>Remove banner</Button></label>
        </div>
        <div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setEditing(undefined)}>Cancel</Button><Button disabled={save.isPending || uploadImage.isPending}>{save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create club'}</Button></div>
      </form>
    </Modal>
  </div>;
}

export function OrganizerDashboardPage() {
  const [editing, setEditing] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberPage, setMemberPage] = useState(1);
  const queryClient = useQueryClient();
  const notify = useToast();
  const clubQuery = useQuery({
    queryKey: ['organizer', 'club'],
    queryFn: () => api<{ club: Club; events: Event[] }>('/organizer/club'),
  });
  const membersParams = new URLSearchParams({ page: String(memberPage), limit: '8' });
  if (memberSearch.trim()) membersParams.set('search', memberSearch.trim());
  const membersQuery = useQuery({
    queryKey: ['organizer', 'members', memberPage, memberSearch],
    queryFn: () => api<PageResult<{ membership_id: number; student_id: number; student_name: string; usn: string | null; year: number; department_name: string | null; designation: string; joined_at: string }>>(`/organizer/members?${membersParams}`),
    placeholderData: previous => previous,
  });
  const form = useForm<ClubValues>({ resolver: zodResolver(clubSchema) });
  useEffect(() => { setMemberPage(1); }, [memberSearch]);
  function openEditor() {
    const club = clubQuery.data?.club;
    if (!club) return;
    form.reset({
      club_name: club.club_name,
      description: club.description ?? '',
      category: club.category ?? 'Other',
      founding_year: club.founding_year ? String(club.founding_year) : '',
      founder_name: club.founder_name ?? '',
      president_name: club.president_name ?? '',
      president_email: club.president_email ?? '',
      president_phone: club.president_phone ?? '',
      mission: club.mission ?? '',
      contact_email: club.contact_email ?? '',
      contact_phone: club.contact_phone ?? '',
      logo_path: club.logo_path ?? '',
      banner_path: club.banner_path ?? '',
    });
    setEditing(true);
  }
  const save = useMutation({
    mutationFn: (values: ClubValues) => api('/organizer/club', {
      method: 'PATCH',
      body: JSON.stringify({
        ...values,
        founding_year: values.founding_year ? Number(values.founding_year) : null,
        logo_path: values.logo_path || null,
        banner_path: values.banner_path || null,
      }),
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['organizer', 'club'] });
      await queryClient.invalidateQueries({ queryKey: ['public'] });
      notify('Club profile updated.');
      setEditing(false);
    },
    onError: error => notify(error instanceof Error ? error.message : 'Could not update your club.', 'error'),
  });
  const uploadImage = useMutation({
    mutationFn: ({ file }: { kind: 'logo' | 'banner'; file: File }) => {
      const data = new FormData();
      data.append('image', file);
      return api<{ image_path: string }>(`/organizer/clubs/${clubQuery.data?.club.club_id}/images`, { method: 'POST', body: data });
    },
    onSuccess: (result, variables) => form.setValue(`${variables.kind}_path`, result.image_path, { shouldDirty: true }),
    onError: error => notify(error instanceof Error ? error.message : 'Could not upload this image.', 'error'),
  });
  if (clubQuery.isLoading) return <PageLoader label="Loading your club workspace…" />;
  if (clubQuery.isError || !clubQuery.data) return <div className="portal-content"><QueryError message="Your assigned club workspace could not be loaded." /></div>;
  const { club, events } = clubQuery.data;
  const upcoming = events.filter(event => !['cancelled', 'completed', 'ongoing'].includes(event.lifecycle_status));
  const registrationTotal = events.reduce((sum, event) => sum + event.confirmed_count, 0);
  return <div className="portal-content">
    <PageTitle eyebrow="ORGANIZER WORKSPACE" title={club.club_name} description="Manage your assigned club, members, and events." action={<Button onClick={openEditor}><Pencil size={15} /> Edit club profile</Button>} />
    <section className="admin-metrics">
      <Card className="metric-card metric-teal"><span className="eyebrow">ACTIVE MEMBERS</span><strong>{club.active_member_count ?? 0}</strong></Card>
      <Card className="metric-card metric-violet"><span className="eyebrow">EVENTS</span><strong>{club.event_count ?? events.length}</strong></Card>
      <Card className="metric-card metric-gold"><span className="eyebrow">UPCOMING</span><strong>{upcoming.length}</strong></Card>
      <Card className="metric-card metric-coral"><span className="eyebrow">CONFIRMED REGISTRATIONS</span><strong>{registrationTotal}</strong></Card>
    </section>
    <Card className="organizer-club-summary">
      {club.logo_path ? <img src={club.logo_path} alt={`${club.club_name} logo`} /> : <span className="club-detail-icon">{club.club_name.charAt(0).toUpperCase()}</span>}
      <div><span className="eyebrow">{club.category || 'CAMPUS COMMUNITY'}</span><h2>{club.club_name}</h2><p>{club.description || 'Add a description to help students discover your club.'}</p><Link className="text-link" to={`/clubs/${club.club_id}`}>View public club page <ArrowUpRight size={14} /></Link></div>
      <div className="organizer-shortcuts"><Link className="button button-primary" to="/organizer/events">Manage events <CalendarDays size={15} /></Link><Link className="button button-secondary" to="/organizer/members">Member directory <Users size={15} /></Link><Link className="button button-secondary" to="/organizer/registrations">View registrations <ArrowUpRight size={15} /></Link></div>
    </Card>
    <section className="portal-section">
      <div className="section-heading"><div><span className="eyebrow">YOUR COMMUNITY</span><h2>Member directory</h2><p>Only active members of your assigned club are shown.</p></div><Link className="text-link" to="/organizer/members">All members <ArrowUpRight size={14} /></Link></div>
      <Card className="table-card"><div className="table-toolbar"><div><h2>Active members</h2></div><SearchBox value={memberSearch} onChange={setMemberSearch} placeholder="Search members by name or USN…" /></div>
        {membersQuery.isLoading ? <PageLoader /> : membersQuery.isError ? <QueryError message="Your member directory could not be loaded." /> : membersQuery.data?.items.length ? <div className="responsive-table"><table><thead><tr><th>Student</th><th>Year / department</th><th>Role</th><th>Joined</th></tr></thead><tbody>{membersQuery.data.items.map(member => <tr key={member.membership_id}><td><strong>{member.student_name}</strong><small>{member.usn ?? 'No USN'}</small></td><td>Year {member.year}<small>{member.department_name ?? 'Department unavailable'}</small></td><td>{member.designation.replaceAll('_', ' ')}</td><td>{formatStudentDate(member.joined_at)}</td></tr>)}</tbody></table></div> : <EmptyState title="No members found" description={memberSearch ? 'Try another name or USN.' : 'Students who join your club will appear here.'} />}
        {membersQuery.data && <Pagination page={membersQuery.data.page} limit={membersQuery.data.limit} total={membersQuery.data.total} onPageChange={setMemberPage} />}
      </Card>
    </section>
    <section className="portal-section"><div className="section-heading"><div><span className="eyebrow">CLUB CALENDAR</span><h2>Upcoming events</h2></div><Link className="text-link" to="/organizer/events">Manage all events <ArrowUpRight size={14} /></Link></div>
      {upcoming.length ? <div className="event-grid">{upcoming.slice(0, 3).map(event => <Card className="student-summary-card" key={event.event_id}><Badge>{event.lifecycle_status.replaceAll('_', ' ')}</Badge><h3>{event.event_name}</h3><p>{event.event_date} · {event.start_time} · {event.location}</p><p>{event.confirmed_count}/{event.capacity} confirmed · {event.waitlist_count} waiting</p><Link className="text-link" to={`/organizer/events/${event.event_id}`}>View event details <ArrowUpRight size={14} /></Link></Card>)}</div> : <Card><EmptyState title="No upcoming events" description="Create an event for your club to get started." /></Card>}
    </section>
    <Modal open={editing} onOpenChange={setEditing} title="Edit your club" description="Update club details and public leadership information.">
      <form className="modal-form" onSubmit={form.handleSubmit(values => save.mutate(values))}>
        <label className="form-field"><span>Club name</span><input {...form.register('club_name')} /></label>
        <label className="form-field"><span>Description</span><textarea rows={3} {...form.register('description')} /></label>
        <div className="form-row"><label className="form-field"><span>Category</span><input {...form.register('category')} /></label><label className="form-field"><span>Founding year</span><input type="number" {...form.register('founding_year')} /></label></div>
        <label className="form-field"><span>Founder</span><input {...form.register('founder_name')} /></label>
        <label className="form-field"><span>Mission / objectives</span><textarea rows={2} {...form.register('mission')} /></label>
        <h3>Current president (public contact)</h3>
        <div className="form-row"><label className="form-field"><span>Name</span><input {...form.register('president_name')} /></label><label className="form-field"><span>Email</span><input type="email" {...form.register('president_email')} /></label></div>
        <label className="form-field"><span>Phone</span><input type="tel" {...form.register('president_phone')} /></label>
        <div className="form-row"><label className="form-field"><span>Upload logo</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { const file = event.currentTarget.files?.[0]; if (file) uploadImage.mutate({ kind: 'logo', file }); event.currentTarget.value = ''; }} />{form.watch('logo_path') && <img className="club-image-preview club-image-preview-logo" src={form.watch('logo_path')} alt="Club logo preview" />}<Button type="button" variant="ghost" onClick={() => form.setValue('logo_path', '', { shouldDirty: true })}>Remove logo</Button></label><label className="form-field"><span>Upload banner</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { const file = event.currentTarget.files?.[0]; if (file) uploadImage.mutate({ kind: 'banner', file }); event.currentTarget.value = ''; }} />{form.watch('banner_path') && <img className="club-image-preview" src={form.watch('banner_path')} alt="Club banner preview" />}<Button type="button" variant="ghost" onClick={() => form.setValue('banner_path', '', { shouldDirty: true })}>Remove banner</Button></label></div>
        <input type="hidden" {...form.register('contact_email')} /><input type="hidden" {...form.register('contact_phone')} />
        <div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button><Button disabled={save.isPending || uploadImage.isPending}>{save.isPending ? 'Saving…' : 'Save club profile'}</Button></div>
      </form>
    </Modal>
  </div>;
}

export function OrganizerMembersPage() {
  const [search, setSearch] = useState('');
  const [year, setYear] = useState('');
  const [department, setDepartment] = useState('');
  const [page, setPage] = useState(1);
  const config = useQuery({
    queryKey: ['public-config'],
    queryFn: () => api<{ departments: Department[] }>('/public/config'),
    staleTime: Infinity,
  });
  const params = new URLSearchParams({ page: String(page), limit: '25' });
  if (search.trim()) params.set('search', search.trim());
  if (year) params.set('year', year);
  if (department) params.set('department_code', department);
  const members = useQuery({
    queryKey: ['organizer', 'members', page, search, year, department],
    queryFn: () => api<PageResult<{ membership_id: number; student_name: string; usn: string | null; year: number; department_name: string | null; designation: string; joined_at: string }>>(`/organizer/members?${params}`),
    placeholderData: previous => previous,
  });
  useEffect(() => { setPage(1); }, [search, year, department]);
  return <div className="portal-content"><PageTitle eyebrow="ORGANIZER WORKSPACE" title="Members" description="Search active members of your assigned club." />
    <Card className="table-card"><div className="table-toolbar"><div><h2>Member directory</h2><p>Student email and private account information are not shown.</p></div><div className="toolbar-filters"><SearchBox value={search} onChange={setSearch} placeholder="Search name or USN…" /><select className="select-control" aria-label="Filter by academic year" value={year} onChange={event => setYear(event.target.value)}><option value="">All years</option>{[1, 2, 3, 4].map(item => <option value={item} key={item}>{item} Year</option>)}</select><select className="select-control" aria-label="Filter by department" value={department} onChange={event => setDepartment(event.target.value)}><option value="">All departments</option>{config.data?.departments.map(item => <option value={item.department_code} key={item.department_code}>{item.department_name}</option>)}</select></div></div>
    {members.isLoading ? <PageLoader /> : members.isError ? <QueryError /> : members.data?.items.length ? <div className="responsive-table"><table><thead><tr><th>Student</th><th>Year / department</th><th>Club role</th><th>Joined</th></tr></thead><tbody>{members.data.items.map(member => <tr key={member.membership_id}><td><strong>{member.student_name}</strong><small>{member.usn ?? 'No USN'}</small></td><td>Year {member.year}<small>{member.department_name ?? 'Department unavailable'}</small></td><td>{member.designation.replaceAll('_', ' ')}</td><td>{formatStudentDate(member.joined_at)}</td></tr>)}</tbody></table></div> : <EmptyState title="No members found" description={search ? 'Try another search.' : 'No active memberships exist yet.'} />}
    {members.data && <Pagination page={members.data.page} limit={members.data.limit} total={members.data.total} onPageChange={setPage} />}
    </Card>
  </div>;
}

const eventSchema = z.object({
  event_name: z.string().trim().min(1, 'Enter an event name.').max(120),
  description: z.string().trim().max(5000),
  category: z.enum(['Workshop', 'Seminar', 'Cultural', 'Sports', 'Competition', 'Fest', 'Other']),
  organizer_id: z.string(),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date.').refine(value => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }, 'Choose a valid calendar date.'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose an end date.'),
  start_time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Choose a start time.'),
  end_time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Choose an end time.'),
  location: z.string().trim().min(1, 'Enter a location.').max(120),
  club_id: z.coerce.number().int().positive('Choose a club.'),
  entry_fee: z.coerce.number().finite().min(0).max(10000000),
  capacity: z.coerce.number().int().min(1).max(1000000),
  registration_opens_at: z.string(),
  registration_closes_at: z.string(),
  status: z.enum(['draft', 'published']),
});
type EventValues = z.infer<typeof eventSchema>;
type EventInput = z.input<typeof eventSchema>;

export function AdminEventsPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [club, setClub] = useState('');
  const [editing, setEditing] = useState<Event | null | undefined>(undefined);
  const queryClient = useQueryClient();
  const notify = useToast();
  const params = new URLSearchParams({ page: String(page), limit: '25' });
  if (search.trim()) params.set('search', search.trim());
  if (club) params.set('club_id', club);
  const events = useQuery({ queryKey: ['admin', 'events', page, search, club], queryFn: () => api<PageResult<Event>>(`/admin/events?${params}`), placeholderData: previous => previous });
  const clubs = useQuery({ queryKey: ['admin', 'clubs', 'dropdown'], queryFn: () => api<PageResult<Club>>('/admin/clubs?limit=100') });
  const organizers = useQuery({
    queryKey: ['admin', 'organizers'],
    queryFn: () => api<OrganizerAccount[]>('/admin/organizers'),
    enabled: user?.role === 'admin',
  });
  const form = useForm<EventInput, unknown, EventValues>({ resolver: zodResolver(eventSchema) });
  useEffect(() => { setPage(1); }, [search, club]);
  const save = useMutation({
    mutationFn: (values: EventValues) => editing
      ? api(`/admin/events/${editing.event_id}`, { method: 'PATCH', body: JSON.stringify({ ...values, organizer_id: values.organizer_id ? Number(values.organizer_id) : null, timezone: 'Asia/Kolkata', registration_opens_at: values.registration_opens_at || null, registration_closes_at: values.registration_closes_at || null }) })
      : api('/admin/events', { method: 'POST', body: JSON.stringify({ ...values, organizer_id: values.organizer_id ? Number(values.organizer_id) : null, timezone: 'Asia/Kolkata', registration_opens_at: values.registration_opens_at || null, registration_closes_at: values.registration_closes_at || null }) }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['admin'] }); await queryClient.invalidateQueries({ queryKey: ['public'] }); notify(editing ? 'Event updated.' : 'Event scheduled.'); setEditing(undefined); },
    onError: error => notify(error instanceof Error ? error.message : 'Could not save this event.', 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api<void>(`/admin/events/${id}`, { method: 'DELETE' }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['admin'] }); await queryClient.invalidateQueries({ queryKey: ['public'] }); notify('Event deleted.'); },
    onError: error => notify(error instanceof Error ? error.message : 'Could not delete this event.', 'error'),
  });
  function openForm(event?: Event) {
    const today = new Date();
    const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    form.reset({
      event_name: event?.event_name ?? '',
      description: event?.description ?? '',
      category: (event?.category as EventValues['category']) ?? 'Other',
      organizer_id: event?.organizer_id ? String(event.organizer_id) : !event && user?.role === 'organizer' ? String(user.id) : '',
      event_date: event?.event_date.split('T')[0] ?? localDate,
      end_date: event?.end_date?.split('T')[0] ?? event?.event_date.split('T')[0] ?? localDate,
      start_time: event?.start_time ?? '09:00',
      end_time: event?.end_time ?? '10:00',
      location: event?.location ?? '',
      club_id: event?.club_id ?? 0,
      entry_fee: event?.entry_fee ?? 0,
      capacity: event?.capacity ?? 100,
      registration_opens_at: event?.registration_opens_at ?? '',
      registration_closes_at: event?.registration_closes_at ?? '',
      status: event?.status === 'draft' ? 'draft' : 'published',
    });
    setEditing(event ?? null);
  }
  return <div className="portal-content">
    <PageTitle eyebrow="WORKSPACE / EVENTS" title="Events" description="Put meaningful campus moments on the calendar." action={<Button onClick={() => openForm()}><CirclePlus size={16} /> Schedule event</Button>} />
    <Card className="table-card">
      <div className="table-toolbar"><div><h2>Campus calendar</h2><p>Manage events and their organizing communities.</p></div><div className="toolbar-filters"><SearchBox value={search} onChange={setSearch} placeholder="Search events…" /><select className="select-control" aria-label="Filter by club" value={club} onChange={event => setClub(event.target.value)}><option value="">All clubs</option>{clubs.data?.items.map(item => <option value={item.club_id} key={item.club_id}>{item.club_name}</option>)}</select></div></div>
      {events.isLoading ? <PageLoader /> : events.isError ? <QueryError /> : events.data?.items.length ? <div className="responsive-table"><table><thead><tr><th>Event</th><th>Schedule</th><th>Fee / capacity</th><th>Status</th><th>Club</th><th>Actions</th></tr></thead><tbody>{events.data.items.map(event => <tr key={event.event_id}><td><Link className="text-link" to={`/${user?.role === 'organizer' ? 'organizer' : 'admin'}/events/${event.event_id}`}><strong>{event.event_name}</strong></Link><small>{event.category}</small></td><td>{new Date(`${event.event_date.split('T')[0]}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}<small>{event.start_time}–{event.end_time} · {event.location}</small></td><td>{event.entry_fee === 0 ? 'Free' : `₹${event.entry_fee.toFixed(2)}`}<small>{event.confirmed_count}/{event.capacity} confirmed · {event.waitlist_count} waiting</small></td><td><Badge>{event.lifecycle_status.replaceAll('_', ' ')}</Badge></td><td><Link className="text-link" to={user?.role === 'organizer' ? '/organizer/events' : `/admin/clubs/${event.club_id}`}><Badge>{event.club_name}</Badge></Link></td><td><div className="table-actions"><Button variant="secondary" className="icon-action" onClick={() => openForm(event)} aria-label={`Edit ${event.event_name}`}><Pencil size={15} /></Button><Button variant="danger" className="icon-action" onClick={() => window.confirm(`Cancel ${event.event_name}? Registered students will be notified.`) && remove.mutate(event.event_id)} aria-label={`Cancel ${event.event_name}`}><Trash2 size={15} /></Button></div></td></tr>)}</tbody></table></div> : <EmptyState title="No events found" description={search || club ? 'Try changing your filters.' : 'Schedule the first campus event.'} />}
      {events.data && <Pagination page={events.data.page} limit={events.data.limit} total={events.data.total} onPageChange={setPage} />}
    </Card>
    <Modal open={editing !== undefined} onOpenChange={open => !open && setEditing(undefined)} title={editing ? 'Edit event' : 'Schedule an event'} description="Event details appear in the public campus calendar.">
      <form className="modal-form" onSubmit={form.handleSubmit(values => save.mutate(values))}>
        <label className="form-field"><span>Event name</span><input {...form.register('event_name')} placeholder="e.g. Annual Hackathon" />{form.formState.errors.event_name && <small className="field-error">{form.formState.errors.event_name.message}</small>}</label>
        <label className="form-field"><span>Description</span><textarea {...form.register('description')} rows={3} /></label>
        <div className="form-row"><label className="form-field"><span>Category</span><select {...form.register('category')}>{['Workshop', 'Seminar', 'Cultural', 'Sports', 'Competition', 'Fest', 'Other'].map(category => <option key={category}>{category}</option>)}</select></label><label className="form-field"><span>Organizer / host</span><select {...form.register('organizer_id')}><option value="">Unassigned</option>{user?.role === 'organizer' ? <option value={user.id}>{user.email}</option> : organizers.data?.filter(item => item.club_id === (form.watch('club_id') || editing?.club_id)).map(item => <option value={item.admin_id} key={item.admin_id}>{item.email}</option>)}</select></label></div>
        <p className="privacy-note">Schedule times use campus local time (Asia/Kolkata).</p>
        <div className="form-row"><label className="form-field"><span>Event date</span><input {...form.register('event_date')} type="date" />{form.formState.errors.event_date && <small className="field-error">{form.formState.errors.event_date.message}</small>}</label><label className="form-field"><span>Start time</span><input {...form.register('start_time')} type="time" />{form.formState.errors.start_time && <small className="field-error">{form.formState.errors.start_time.message}</small>}</label></div>
        <div className="form-row"><label className="form-field"><span>End date</span><input {...form.register('end_date')} type="date" />{form.formState.errors.end_date && <small className="field-error">{form.formState.errors.end_date.message}</small>}</label><label className="form-field"><span>End time</span><input {...form.register('end_time')} type="time" />{form.formState.errors.end_time && <small className="field-error">{form.formState.errors.end_time.message}</small>}</label></div>
        <label className="form-field"><span>Location</span><input {...form.register('location')} placeholder="e.g. Main auditorium" />{form.formState.errors.location && <small className="field-error">{form.formState.errors.location.message}</small>}</label>
        <label className="form-field"><span>Organizing club</span><select {...form.register('club_id')}><option value="0">Select a club</option>{clubs.data?.items.map(item => <option value={item.club_id} key={item.club_id}>{item.club_name}</option>)}</select>{form.formState.errors.club_id && <small className="field-error">{form.formState.errors.club_id.message}</small>}</label>
        <div className="form-row"><label className="form-field"><span>Entry fee (₹)</span><input {...form.register('entry_fee')} type="number" min="0" step="0.01" />{form.formState.errors.entry_fee && <small className="field-error">{form.formState.errors.entry_fee.message}</small>}</label><label className="form-field"><span>Maximum participants</span><input {...form.register('capacity')} type="number" min="1" step="1" />{form.formState.errors.capacity && <small className="field-error">{form.formState.errors.capacity.message}</small>}</label></div>
        <div className="form-row"><label className="form-field"><span>Registration opens</span><input {...form.register('registration_opens_at')} type="datetime-local" /></label><label className="form-field"><span>Registration closes</span><input {...form.register('registration_closes_at')} type="datetime-local" /></label></div>
        <label className="form-field"><span>Publication</span><select {...form.register('status')}><option value="published">Published</option>{(!editing || editing.status === 'draft') && <option value="draft">Draft</option>}</select></label>
        <div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setEditing(undefined)}>Cancel</Button><Button disabled={save.isPending}>{save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Schedule event'}</Button></div>
      </form>
    </Modal>
  </div>;
}

interface AdminEventRegistration extends Registration {
  student_id: number;
  student_name: string;
  year: number;
  department_name: string | null;
  registered_at: string;
}

interface AdminEventProfile {
  event: Event;
  registrations: AdminEventRegistration[];
}

export function AdminEventDetailPage() {
  const { eventId = '' } = useParams();
  const { user } = useAuth();
  const isOrganizer = user?.role === 'organizer';
  const basePath = isOrganizer ? '/organizer' : '/admin';
  const query = useQuery({
    queryKey: ['admin', 'event', eventId],
    queryFn: () => api<AdminEventProfile>(`/admin/events/${eventId}`),
    enabled: /^\d+$/.test(eventId),
  });
  if (query.isLoading) return <PageLoader label="Loading event details…" />;
  if (query.isError || !query.data) return <div className="portal-content"><QueryError message="This event and its registration details could not be loaded." /></div>;
  const { event, registrations } = query.data;
  return <div className="portal-content">
    <PageTitle eyebrow="CAMPUS CALENDAR / EVENT DETAILS" title={event.event_name} description="Event information and every student registration." action={<Link className="button button-secondary" to={`${basePath}/events`}><ArrowLeft size={15} /> Events</Link>} />
    <section className="admin-content-grid">
      <Card><span className="eyebrow">EVENT INFORMATION</span><h2>{event.event_name}</h2><p>{event.description || 'No description provided.'}</p><p>{event.event_date} · {event.start_time}–{event.end_time}</p><p>{event.location} · {event.category}</p><p>Hosted by {isOrganizer ? event.club_name : <Link className="text-link" to={`/admin/clubs/${event.club_id}`}>{event.club_name}</Link>}</p><p>Status: <Badge>{event.lifecycle_status.replaceAll('_', ' ')}</Badge></p><p>Entry fee: {event.entry_fee === 0 ? 'Free' : `₹${event.entry_fee.toFixed(2)}`}</p></Card>
      <Card><span className="eyebrow">PARTICIPATION</span><h2>{registrations.filter(item => ['confirmed', 'promotion_pending'].includes(item.status ?? '')).length} confirmed</h2><p>{registrations.length} total registrations · {event.waitlist_count} waitlisted</p><p>{event.available_slots} places available of {event.capacity}</p></Card>
    </section>
    <section className="portal-section">
      <div className="section-heading"><div><span className="eyebrow">STUDENT PARTICIPATION</span><h2>Registrations</h2></div></div>
      <Card className="table-card">{registrations.length ? <div className="responsive-table"><table><thead><tr><th>Student</th><th>Year / department</th><th>USN</th><th>Fee</th><th>Status</th><th>Registered</th></tr></thead><tbody>{registrations.map(item => <tr key={item.reg_id}><td>{isOrganizer ? <strong>{item.student_name}</strong> : <Link className="text-link" to={`/admin/students/${item.student_id}`}><strong>{item.student_name}</strong></Link>}<small>{item.email ?? 'No email'}</small></td><td>Year {item.year}<small>{item.department_name ?? 'Unspecified department'}</small></td><td>{item.usn ?? 'Legacy record'}</td><td>₹{Number(item.entry_fee).toFixed(2)}</td><td><Badge>{item.status ?? 'confirmed'}{item.waitlist_position ? ` #${item.waitlist_position}` : ''}</Badge></td><td>{item.registered_at ? new Date(item.registered_at.replace(' ', 'T') + 'Z').toLocaleString('en-IN') : '—'}</td></tr>)}</tbody></table></div> : <EmptyState title="No registrations yet" description="Students who register for this event will appear here." />}</Card>
    </section>
  </div>;
}

export function AdminRegistrationsPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const notify = useToast();
  const params = new URLSearchParams({ page: String(page), limit: '25' });
  if (search.trim()) params.set('search', search.trim());
  const registrations = useQuery({ queryKey: ['admin', 'registrations', page, search], queryFn: () => api<PageResult<Registration>>(`/admin/registrations?${params}`), placeholderData: previous => previous });
  const remove = useMutation({
    mutationFn: (id: number) => api<void>(`/admin/registrations/${id}`, { method: 'DELETE' }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['admin'] }); notify('Registration cancelled.'); },
    onError: error => notify(error instanceof Error ? error.message : 'Could not cancel this registration.', 'error'),
  });
  useEffect(() => { setPage(1); }, [search]);
  return <div className="portal-content">
    <PageTitle eyebrow="CAMPUS PARTICIPATION" title="Registrations" description="Review event sign-ups and manage cancellations." />
    <Card className="table-card"><div className="table-toolbar"><div><h2>All registrations</h2><p>Student registration records are restricted to administrators and their owners.</p></div><SearchBox value={search} onChange={setSearch} placeholder="Search student, USN, event…" /></div>
      {registrations.isLoading ? <PageLoader /> : registrations.isError ? <QueryError /> : registrations.data?.items.length ? <div className="responsive-table"><table><thead><tr><th>Student</th><th>Event</th><th>Club</th><th>Entry fee</th><th>Actions</th></tr></thead><tbody>{registrations.data.items.map(item => <tr key={item.reg_id}><td>{user?.role === 'admin' && item.student_id ? <Link className="text-link" to={`/admin/students/${item.student_id}`}><strong>{item.student_name}</strong></Link> : <strong>{item.student_name}</strong>}<small>{item.usn ?? 'Legacy record'} {item.email ? `· ${item.email}` : ''}</small></td><td><Link className="text-link" to={`/${user?.role === 'organizer' ? 'organizer' : 'admin'}/events/${item.event_id}`}>{item.event_name}</Link></td><td><Link className="text-link" to={user?.role === 'organizer' ? '/organizer/events' : `/admin/clubs/${item.club_id}`}><Badge>{item.club_name}</Badge></Link></td><td>₹ {Number(item.entry_fee).toFixed(2)}</td><td><Button variant="danger" className="text-action" onClick={() => window.confirm(`Cancel ${item.student_name}’s registration for ${item.event_name}?`) && remove.mutate(item.reg_id)}><X size={14} /> Cancel</Button></td></tr>)}</tbody></table></div> : <EmptyState title="No registrations found" description={search ? 'Try another search.' : 'Student registrations will appear here.'} />}
      {registrations.data && <Pagination page={registrations.data.page} limit={registrations.data.limit} total={registrations.data.total} onPageChange={setPage} />}
    </Card>
  </div>;
}

export function AdminActivityPage() {
  const activity = useQuery({ queryKey: ['admin', 'activity'], queryFn: () => api<PageResult<DashboardData['recent_activity'][number]>>('/admin/audit-logs?limit=100') });
  return <div className="portal-content">
    <PageTitle eyebrow="ADMINISTRATIVE AUDIT" title="Activity log" description="A record of administrative and student account actions." />
    <Card className="table-card"><div className="table-toolbar"><div><h2>Recent activity</h2><p>Passwords, session identifiers, and unnecessary personal data are never logged.</p></div><span className="table-count">{activity.data?.total ?? '—'} records</span></div>
      {activity.isLoading ? <PageLoader /> : activity.isError ? <QueryError /> : activity.data?.items.length ? <div className="responsive-table"><table><thead><tr><th>Action</th><th>Actor</th><th>Resource</th><th>Resource ID</th><th>Time</th></tr></thead><tbody>{activity.data.items.map(item => <tr key={item.audit_id}><td><strong>{item.action.replaceAll('.', ' ')}</strong></td><td><Badge className={item.actor_role === 'admin' ? 'badge-admin' : ''}>{item.actor_role}</Badge><small>ID {item.actor_id}</small></td><td>{item.resource_type}</td><td>{item.resource_id ?? '—'}</td><td>{new Date(`${item.created_at.replace(' ', 'T')}Z`).toLocaleString('en-IN')}</td></tr>)}</tbody></table></div> : <EmptyState title="No activity recorded yet" description="Actions will show up here as the application is used." />}
    </Card>
  </div>;
}
