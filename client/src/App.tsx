import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminGuard, PublicLayout, StudentGuard } from './components/Layout';
import { PageLoader } from './components/ui';

const AdminDashboardPage = lazy(() => import('./pages/AdminPages').then(page => ({ default: page.AdminDashboardPage })));
const AdminStudentsPage = lazy(() => import('./pages/AdminPages').then(page => ({ default: page.AdminStudentsPage })));
const AdminClubsPage = lazy(() => import('./pages/AdminPages').then(page => ({ default: page.AdminClubsPage })));
const AdminEventsPage = lazy(() => import('./pages/AdminPages').then(page => ({ default: page.AdminEventsPage })));
const AdminRegistrationsPage = lazy(() => import('./pages/AdminPages').then(page => ({ default: page.AdminRegistrationsPage })));
const AdminActivityPage = lazy(() => import('./pages/AdminPages').then(page => ({ default: page.AdminActivityPage })));
const AdminLoginPage = lazy(() => import('./pages/AuthPages').then(page => ({ default: page.AdminLoginPage })));
const StudentLoginPage = lazy(() => import('./pages/AuthPages').then(page => ({ default: page.StudentLoginPage })));
const StudentRegisterPage = lazy(() => import('./pages/AuthPages').then(page => ({ default: page.StudentRegisterPage })));
const ClubDetailPage = lazy(() => import('./pages/PublicPages').then(page => ({ default: page.ClubDetailPage })));
const ClubsPage = lazy(() => import('./pages/PublicPages').then(page => ({ default: page.ClubsPage })));
const EventsPage = lazy(() => import('./pages/PublicPages').then(page => ({ default: page.EventsPage })));
const HomePage = lazy(() => import('./pages/PublicPages').then(page => ({ default: page.HomePage })));
const StudentDashboardPage = lazy(() => import('./pages/StudentPortal').then(page => ({ default: page.StudentDashboardPage })));

export default function App() {
  return <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="clubs" element={<ClubsPage />} />
        <Route path="clubs/:clubId" element={<ClubDetailPage />} />
        <Route path="events" element={<EventsPage />} />
      </Route>
      <Route path="student/login" element={<StudentLoginPage />} />
      <Route path="student/register" element={<StudentRegisterPage />} />
      <Route path="student" element={<StudentGuard />}>
        <Route index element={<StudentDashboardPage />} />
      </Route>
      <Route path="admin/login" element={<AdminLoginPage />} />
      <Route path="admin" element={<AdminGuard />}>
        <Route index element={<AdminDashboardPage />} />
        <Route path="students" element={<AdminStudentsPage />} />
        <Route path="clubs" element={<AdminClubsPage />} />
        <Route path="events" element={<AdminEventsPage />} />
        <Route path="registrations" element={<AdminRegistrationsPage />} />
        <Route path="activity" element={<AdminActivityPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </Suspense>;
}
