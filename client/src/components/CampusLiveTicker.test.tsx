import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext';
import { ToastProvider } from './ui';
import type { Event, Notification } from '../lib/types';
import { CampusLiveTicker } from './CampusLiveTicker';

const event: Event = {
  event_id: 1,
  event_name: 'Robotics Challenge',
  description: '',
  category: 'Workshop',
  organizer: 'Robotics Club',
  organizer_id: null,
  event_date: '2099-06-10',
  start_time: '10:00',
  end_date: '2099-06-10',
  end_time: '11:00',
  timezone: 'Asia/Kolkata',
  location: 'Main Hall',
  club_id: 4,
  club_name: 'Robotics Club',
  entry_fee: 0,
  capacity: 10,
  confirmed_count: 1,
  available_slots: 9,
  waitlist_count: 0,
  registration_opens_at: null,
  registration_closes_at: null,
  status: 'published',
  lifecycle_status: 'registration_open',
};

function LocationMarker() {
  return <output data-testid="route-location">{useLocation().pathname}</output>;
}

function renderTicker(notifications: Notification[], events = [event]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path.endsWith('/auth/me')) {
      return new Response(JSON.stringify({ user: { id: 8, role: 'student', full_name: 'Test Student' } }), { status: 200 });
    }
    if (path.includes('/student/notifications')) {
      return new Response(JSON.stringify({ items: notifications, unread: notifications.length }), { status: 200 });
    }
    return new Response('{}', { status: init?.method === 'PATCH' ? 204 : 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/student']}>
        <AuthProvider>
          <ToastProvider>
            <Routes><Route path="*" element={<CampusLiveTicker events={events} />} /></Routes>
            <LocationMarker />
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetchMock;
}

function notification(id: number, type: string, message: string): Notification {
  return {
    notification_id: id,
    notification_type: type,
    category: type === 'event_announcement' ? 'event_announcements' : 'registrations',
    message,
    event_id: event.event_id,
    club_id: event.club_id,
    link: `/events/${event.event_id}`,
    created_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
    read_at: null,
  };
}

describe('Campus Live Updates ticker', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows scoped notification data, pauses, resumes, and links to the event without marking it read', async () => {
    const fetchMock = renderTicker([
      notification(1, 'registration_confirmation', "You're registered for Robotics Challenge!"),
      notification(2, 'event_announcement', 'Robotics Club announces its next event.'),
    ]);

    expect(await screen.findByRole('link', { name: /You're registered for Robotics Challenge!/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Campus Live Updates' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pause campus announcements' }));
    expect(screen.getByRole('button', { name: 'Resume campus announcements' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Resume campus announcements' }));
    expect(screen.getByRole('button', { name: 'Pause campus announcements' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /You're registered for Robotics Challenge!/ }));
    await waitFor(() => expect(screen.getByTestId('route-location')).toHaveTextContent('/events/1'));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
  });

  it('uses a static empty state when no recent announcements are available', async () => {
    renderTicker([]);
    expect(await screen.findByText('No new campus announcements right now. Stay tuned!')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /campus announcements/ })).not.toBeInTheDocument();
  });

  it('hides registration announcements after an event is cancelled', async () => {
    const cancelledEvent = { ...event, lifecycle_status: 'cancelled' };
    renderTicker([
      notification(3, 'registration_confirmation', "You're registered for Robotics Challenge!"),
      notification(4, 'event_cancelled', 'Robotics Challenge has been cancelled.'),
    ], [cancelledEvent]);

    expect(await screen.findByRole('link', { name: 'Robotics Challenge has been cancelled.' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /You're registered for Robotics Challenge!/ })).not.toBeInTheDocument();
  });
});
