import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext';
import { ToastProvider } from '../components/ui';
import { EventDetailPage, EventsPage, HomePage } from './PublicPages';

const event = {
  event_id: 17,
  event_name: 'Campus Showcase',
  description: 'Campus event',
  category: 'Workshop',
  organizer: 'Coding Club',
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

function renderHome() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthProvider>
          <ToastProvider><HomePage /></ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderAt(path: string, page: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <ToastProvider>
            <Routes>
              <Route path="/events" element={page} />
              <Route path="/events/:eventId" element={page} />
            </Routes>
            <LocationMarker />
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function LocationMarker() {
  const location = useLocation();
  return <>
    <output data-testid="route-location">{location.pathname}</output>
    <output data-testid="route-state">{JSON.stringify(location.state)}</output>
  </>;
}

function mockStudentRegistrationFetch(initialStatus?: 'confirmed' | 'waitlisted') {
  const submissions: unknown[] = [];
  let registrationStatus = initialStatus;
  const responseEvent = () => registrationStatus === 'waitlisted'
    ? { ...event, confirmed_count: event.capacity, available_slots: 0, waitlist_count: 1, lifecycle_status: 'full' }
    : registrationStatus
      ? { ...event, confirmed_count: 1, available_slots: event.capacity - 1 }
      : event;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    let payload: unknown;
    let status = 200;
    if (path.endsWith('/auth/me')) {
      payload = { user: { id: 8, role: 'student', usn: '2BU24CS008', full_name: 'Test Student' } };
    } else if (path.endsWith('/auth/csrf')) {
      payload = { csrfToken: 'test-token' };
    } else if (path.endsWith('/public/events/17')) {
      payload = responseEvent();
    } else if (path.endsWith('/public/events')) {
      payload = [responseEvent()];
    } else if (path.endsWith('/public/clubs')) {
      payload = [{ club_id: 1, club_name: 'Coding Club' }];
    } else if (path.endsWith('/student/registrations') && init?.method === 'POST') {
      submissions.push(JSON.parse(String(init.body)));
      registrationStatus = 'confirmed';
      payload = { reg_id: 23, status: 'confirmed', waitlist_position: null };
      status = 201;
    } else if (path.endsWith('/student/registrations')) {
      payload = registrationStatus ? [{
        reg_id: 23,
        event_id: event.event_id,
        event_name: event.event_name,
        club_name: event.club_name,
        status: registrationStatus,
      }] : [];
    } else {
      payload = { students: 12, clubs: 1, events: 1 };
    }
    return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, submissions };
}

describe('public landing page', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      const payload = path.endsWith('/auth/me')
        ? { user: null }
        : path.endsWith('/public/clubs')
          ? [{ club_id: 1, club_name: 'Coding Club' }]
          : path.endsWith('/public/events')
            ? [{
              event_id: 1,
              event_name: 'Campus Showcase',
              description: 'Campus event',
              category: 'Workshop',
              organizer: 'Coding Club',
              event_date: '2099-06-10',
              start_time: '10:00',
              end_date: '2099-06-10',
              end_time: '11:00',
              timezone: 'Asia/Kolkata',
              location: 'Main Hall',
              club_id: 1,
              club_name: 'Coding Club',
              entry_fee: 0,
              capacity: 100,
              confirmed_count: 0,
              available_slots: 100,
              waitlist_count: 0,
              registration_opens_at: null,
              registration_closes_at: null,
              status: 'published',
              lifecycle_status: 'registration_open',
            }]
            : { students: 12, clubs: 1, events: 1 };
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('uses live public data and keeps the hero as the only landing-page image', async () => {
    renderHome();
    expect(await screen.findByText('Campus Showcase')).toBeInTheDocument();
    expect(await screen.findByText('12')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(1));
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'University students gathered at a campus event');
  });

  it('registers the selected event from All Events without leaving the listing', async () => {
    const { submissions } = mockStudentRegistrationFetch();
    renderAt('/events', <EventsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Register' }));

    await waitFor(() => expect(submissions).toEqual([{ event_id: 17 }]));
    expect(await screen.findByRole('button', { name: 'Registered' })).toBeInTheDocument();
    expect(screen.getByTestId('route-location')).toHaveTextContent('/events');
    expect(document.querySelector('.event-list .event-full-date:last-child')).toHaveTextContent(/9\s+places left/);
  });

  it('registers the selected event directly from its details page', async () => {
    const { submissions } = mockStudentRegistrationFetch();
    renderAt('/events/17', <EventDetailPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Register' }));

    await waitFor(() => expect(submissions).toEqual([{ event_id: 17 }]));
    expect(await screen.findByRole('button', { name: 'Registered' })).toBeInTheDocument();
    expect(screen.getByTestId('route-location')).toHaveTextContent('/events/17');
  });

  it('keeps an existing waitlist placement distinct from a confirmed registration', async () => {
    const { submissions } = mockStudentRegistrationFetch('waitlisted');
    renderAt('/events', <EventsPage />);

    expect(await screen.findByRole('button', { name: 'Waitlisted' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registered' })).not.toBeInTheDocument();
    expect(submissions).toEqual([]);
  });

  it('sends an unauthenticated student to login with a safe event return path without registering', async () => {
    const methods: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method) methods.push(init.method);
      const path = String(input);
      const payload = path.endsWith('/auth/me')
        ? { user: null }
        : path.endsWith('/public/events')
          ? [event]
          : path.endsWith('/public/clubs')
            ? [{ club_id: 1, club_name: 'Coding Club' }]
            : {};
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/events', <EventsPage />);

    fireEvent.click(await screen.findByRole('link', { name: 'Log in to Register' }));

    expect(screen.getByTestId('route-location')).toHaveTextContent('/student/login');
    expect(screen.getByTestId('route-state')).toHaveTextContent('"/events/17"');
    expect(methods).not.toContain('POST');
  });
});
