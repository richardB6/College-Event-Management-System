import { useState } from 'react';
import { Link, NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { Bell, CalendarDays, ChevronDown, Compass, LayoutDashboard, LogOut, Menu, Moon, Settings, Shield, Sun, Users, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { PageLoader, useTheme } from './ui';
import { api } from '../lib/api';
import type { Notification } from '../lib/types';

function Brand() {
  return <Link className="brand" to="/"><span className="brand-mark">C</span><span>clubhub</span></Link>;
}

export function PublicLayout() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  return <>
    <header className="public-nav">
      <Brand />
      <nav aria-label="Public navigation">
        <NavLink to="/">Explore</NavLink>
        <NavLink to="/clubs">Clubs</NavLink>
        <NavLink to="/events">Events</NavLink>
      </nav>
      <div className="public-nav-actions">
        <button className="icon-button" onClick={toggleTheme} aria-label="Toggle color theme">{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
        {user?.role === 'student' ? <Link className="button button-primary button-small" to="/student">My portal</Link> : <Link className="button button-secondary button-small" to="/student/login">Student sign in</Link>}
        <Link className="button button-quiet button-small admin-entry" to="/admin/login"><Shield size={15} /> Admin</Link>
      </div>
    </header>
    <Outlet />
    <footer className="public-footer">
      <Brand /><span>Made for campus life.</span>
      <div><Link to="/clubs">Explore clubs</Link><Link to="/events">Events</Link><Link to="/student/register">Join your community</Link></div>
      <small>© {new Date().getFullYear()} ClubHub</small>
    </footer>
  </>;
}

function PortalNav({ admin }: { admin: boolean }) {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const queryClient = useQueryClient();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notifications = useQuery({
    queryKey: ['notifications', user?.role],
    queryFn: () => api<{ items: Notification[]; unread: number }>(`${user?.role === 'organizer' ? '/organizer' : '/student'}/notifications?limit=8`),
    enabled: user?.role === 'student' || user?.role === 'organizer',
    refetchInterval: 60_000,
  });
  const markRead = useMutation({
    mutationFn: (id: number) => api<void>(`${user?.role === 'organizer' ? '/organizer' : '/student'}/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markAllRead = useMutation({
    mutationFn: () => api<void>(`${user?.role === 'organizer' ? '/organizer' : '/student'}/notifications/read-all`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const links = user?.role === 'organizer'
    ? [
      { to: '/organizer/events', label: 'My events', icon: CalendarDays },
      { to: '/organizer/registrations', label: 'Registrations', icon: Users },
    ]
    : admin
    ? [
      { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/admin/students', label: 'Students', icon: Users },
      { to: '/admin/clubs', label: 'Clubs', icon: Compass },
      { to: '/admin/events', label: 'Events', icon: CalendarDays },
      { to: '/admin/organizers', label: 'Organizers', icon: Users },
      { to: '/admin/registrations', label: 'Registrations', icon: ChevronDown },
      { to: '/admin/activity', label: 'Activity log', icon: Shield },
      { to: '/admin/settings', label: 'Settings', icon: Settings },
    ]
    : [
      { to: '/student', label: 'My dashboard', icon: LayoutDashboard, end: true },
      { to: '/clubs', label: 'Explore clubs', icon: Compass },
      { to: '/events', label: 'Discover events', icon: CalendarDays },
    ];

  async function handleSignOut() {
    await signOut();
    setOpen(false);
  }

  return <>
    <button className="mobile-menu-button" onClick={() => setOpen(value => !value)} aria-label={open ? 'Close navigation' : 'Open navigation'}>{open ? <X /> : <Menu />}</button>
    <aside className={`portal-sidebar ${open ? 'portal-sidebar-open' : ''}`}>
      <Brand />
      <span className="sidebar-label">{user?.role === 'organizer' ? 'ORGANIZER WORKSPACE' : admin ? 'ADMIN WORKSPACE' : 'STUDENT PORTAL'}</span>
      <nav aria-label={user?.role === 'organizer' ? 'Organizer navigation' : admin ? 'Admin navigation' : 'Student navigation'}>
        {links.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}><Icon size={17} /><span>{label}</span></NavLink>)}
      </nav>
      <div className="sidebar-bottom">
        <button className="sidebar-user" onClick={toggleTheme} aria-label="Toggle color theme">{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}<span>{theme === 'dark' ? 'Light appearance' : 'Dark appearance'}</span></button>
        <div className="sidebar-profile"><span className="profile-avatar">{(user?.full_name ?? user?.email ?? 'C').charAt(0).toUpperCase()}</span><span><strong>{admin ? user?.email : user?.full_name}</strong><small>{user?.role === 'organizer' ? 'Club organizer' : admin ? 'Administrator' : user?.usn}</small></span></div>
        <button className="sidebar-user" onClick={() => void handleSignOut()}><LogOut size={17} /><span>Sign out</span></button>
      </div>
    </aside>
    {open && <button className="sidebar-scrim" onClick={() => setOpen(false)} aria-label="Close navigation" />}
    <div className="portal-topbar">
      <span>{location.pathname.startsWith('/admin') ? 'Campus workspace' : 'Your campus community'}</span>
      <div className="topbar-actions">
        {(user?.role === 'student' || user?.role === 'organizer') && <div className="notification-control">
          <button className="icon-button notification-button" aria-label={`Notifications${notifications.data?.unread ? `, ${notifications.data.unread} unread` : ''}`} aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen(value => !value)}>
            <Bell size={18} />{Boolean(notifications.data?.unread) && <span className="notification-count">{notifications.data?.unread}</span>}
          </button>
          {notificationsOpen && <section className="notification-popover" aria-label="Notifications">
            <div className="notification-heading"><strong>Notifications</strong><button type="button" className="text-link" disabled={!notifications.data?.unread || markAllRead.isPending} onClick={() => markAllRead.mutate()}>Mark all read</button></div>
            {notifications.isError ? <p className="notification-empty">Notifications couldn’t be loaded.</p>
              : notifications.data?.items.length ? <ul>{notifications.data.items.map(item => <li className={item.read_at ? '' : 'notification-unread'} key={item.notification_id}>
                <Link to={item.event_id ? '/events' : '/student'} onClick={() => { if (!item.read_at) markRead.mutate(item.notification_id); setNotificationsOpen(false); }}>
                  <span>{item.message}</span><time>{new Date(item.created_at.replace(' ', 'T') + 'Z').toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</time>
                </Link>
              </li>)}</ul> : <p className="notification-empty">You’re all caught up.</p>}
          </section>}
        </div>}
        <span className="topbar-status"><i /> {user?.role === 'organizer' ? 'Organizer access' : admin ? 'Admin access' : 'Student account'}</span>
      </div>
    </div>
  </>;
}

function ProtectedPortal({ role }: { role: 'admin' | 'organizer' | 'student' }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <PageLoader />;
  if (!user || user.role !== role) {
    return <Navigate to={role === 'student' ? '/student/login' : '/admin/login'} replace state={{ from: location.pathname }} />;
  }
  return <div className="portal-shell">
    <PortalNav admin={role !== 'student'} />
    <main className="portal-main"><Outlet /></main>
  </div>;
}

export function StudentGuard() { return <ProtectedPortal role="student" />; }
export function AdminGuard() { return <ProtectedPortal role="admin" />; }
export function OrganizerGuard() { return <ProtectedPortal role="organizer" />; }

export function RouteFallback() {
  const { isLoading } = useAuth();
  return isLoading ? <PageLoader /> : <Navigate to="/" replace />;
}

export function StudentOnlyRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  return <Navigate to={user?.role === 'student' ? '/student' : '/student/login'} replace />;
}
