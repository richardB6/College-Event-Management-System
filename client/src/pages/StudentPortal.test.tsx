import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext';
import { ToastProvider } from '../components/ui';
import { StudentDashboardPage } from './StudentPortal';

function dashboardEvent(id: number) {
  return {
    event_id: id,
    event_name: `Campus Event ${id}`,
    description: 'Campus event',
    category: 'Workshop',
    organizer: 'Coding Club',
    organizer_id: null,
    event_date: '2099-06-10',
    start_time: '10:00',
    end_date: '2099-06-10',
    end_time: '11:00',
    timezone: 'Asia/Kolkata',
    location: 'Main Hall',
    club_id: 1,
    club_name: 'Coding Club',
    entry_fee: 0,
    capacity: 10,
    confirmed_count: 0,
    available_slots: 10,
    waitlist_count: 0,
    registration_opens_at: null,
    registration_closes_at: null,
    status: 'published',
    lifecycle_status: 'registration_open',
  };
}

describe('student dashboard registration preview', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('keeps the three-event preview and registers the selected dashboard event', async () => {
    const events = [1, 2, 3, 4].map(dashboardEvent);
    const submissions: unknown[] = [];
    let registered = false;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      let payload: unknown;
      let status = 200;
      if (path.endsWith('/auth/me')) {
        payload = { user: { id: 8, role: 'student', usn: '2BU24CS008', full_name: 'Test Student' } };
      } else if (path.endsWith('/auth/csrf')) {
        payload = { csrfToken: 'test-token' };
      } else if (path.endsWith('/student/profile')) {
        payload = {
          student_id: 8, usn: '2BU24CS008', email: 'test@gmail.com', fname: 'Test', lname: 'Student',
          full_name: 'Test Student', year: 2, branch: 'Computer Science', department_code: 'CSE',
          department_name: 'Computer Science', account_status: 'active', has_account: true, created_at: '2099-01-01',
        };
      } else if (path.endsWith('/public/events')) {
        payload = events.map(event => ({ ...event, confirmed_count: registered && event.event_id === 1 ? 1 : 0, available_slots: registered && event.event_id === 1 ? 9 : 10 }));
      } else if (path.endsWith('/student/registrations') && init?.method === 'POST') {
        submissions.push(JSON.parse(String(init.body)));
        registered = true;
        payload = { reg_id: 23, status: 'confirmed', waitlist_position: null };
        status = 201;
      } else if (path.endsWith('/student/registrations')) {
        payload = registered ? [{
          reg_id: 23, event_id: 1, event_name: 'Campus Event 1', club_name: 'Coding Club',
          event_date: '2099-06-10', entry_fee: 0, status: 'confirmed',
        }] : [];
      } else if (path.endsWith('/public/clubs') || path.endsWith('/student/memberships')) {
        payload = [];
      } else if (path.endsWith('/public/config')) {
        payload = { departments: [], academic_years: [1, 2, 3, 4] };
      } else if (path.includes('/student/notifications')) {
        payload = { items: [], unread: 0 };
      } else {
        payload = {};
      }
      return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
    }));

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthProvider><ToastProvider><StudentDashboardPage /></ToastProvider></AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/Showing 3 of 4 upcoming events/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Campus Event 3' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Campus Event 4' })).not.toBeInTheDocument();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Register' }))[0]);

    await waitFor(() => expect(submissions).toEqual([{ event_id: 1 }]));
    expect(await screen.findByRole('button', { name: 'Registered' })).toBeInTheDocument();
  });
});
