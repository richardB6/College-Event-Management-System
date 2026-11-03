import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext';
import { ToastProvider } from '../components/ui';
import { HomePage } from './PublicPages';

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

  afterEach(() => vi.unstubAllGlobals());

  it('uses live public data and keeps the hero as the only landing-page image', async () => {
    renderHome();
    expect(await screen.findByText('Campus Showcase')).toBeInTheDocument();
    expect(await screen.findByText('12')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(1));
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'University students gathered at a campus event');
  });
});
