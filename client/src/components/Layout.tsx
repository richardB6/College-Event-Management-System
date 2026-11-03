import { useState } from 'react';
import { Link, NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { CalendarDays, ChevronDown, Compass, LayoutDashboard, LogOut, Menu, Moon, Shield, Sun, Users, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { PageLoader, useTheme } from './ui';

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
  const links = admin
    ? [
      { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/admin/students', label: 'Students', icon: Users },
      { to: '/admin/clubs', label: 'Clubs', icon: Compass },
      { to: '/admin/events', label: 'Events', icon: CalendarDays },
      { to: '/admin/registrations', label: 'Registrations', icon: ChevronDown },
      { to: '/admin/activity', label: 'Activity log', icon: Shield },
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
      <span className="sidebar-label">{admin ? 'ADMIN WORKSPACE' : 'STUDENT PORTAL'}</span>
      <nav aria-label={admin ? 'Admin navigation' : 'Student navigation'}>
        {links.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}><Icon size={17} /><span>{label}</span></NavLink>)}
      </nav>
      <div className="sidebar-bottom">
        <button className="sidebar-user" onClick={toggleTheme} aria-label="Toggle color theme">{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}<span>{theme === 'dark' ? 'Light appearance' : 'Dark appearance'}</span></button>
        <div className="sidebar-profile"><span className="profile-avatar">{(user?.full_name ?? user?.email ?? 'C').charAt(0).toUpperCase()}</span><span><strong>{admin ? user?.email : user?.full_name}</strong><small>{admin ? 'Administrator' : user?.usn}</small></span></div>
        <button className="sidebar-user" onClick={() => void handleSignOut()}><LogOut size={17} /><span>Sign out</span></button>
      </div>
    </aside>
    {open && <button className="sidebar-scrim" onClick={() => setOpen(false)} aria-label="Close navigation" />}
    <div className="portal-topbar"><span>{location.pathname.startsWith('/admin') ? 'Campus workspace' : 'Your campus community'}</span><span className="topbar-status"><i /> {admin ? 'Admin access' : 'Student account'}</span></div>
  </>;
}

function ProtectedPortal({ admin }: { admin: boolean }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <PageLoader />;
  if (!user || user.role !== (admin ? 'admin' : 'student')) {
    return <Navigate to={admin ? '/admin/login' : '/student/login'} replace state={{ from: location.pathname }} />;
  }
  return <div className="portal-shell">
    <PortalNav admin={admin} />
    <main className="portal-main"><Outlet /></main>
  </div>;
}

export function StudentGuard() { return <ProtectedPortal admin={false} />; }
export function AdminGuard() { return <ProtectedPortal admin />; }

export function RouteFallback() {
  const { isLoading } = useAuth();
  return isLoading ? <PageLoader /> : <Navigate to="/" replace />;
}

export function StudentOnlyRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  return <Navigate to={user?.role === 'student' ? '/student' : '/student/login'} replace />;
}
