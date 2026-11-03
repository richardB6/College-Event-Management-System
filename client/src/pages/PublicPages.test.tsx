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
            ? [{ event_id: 1, event_name: 'Campus Showcase', event_date: '2099-06-10', location: 'Main Hall', club_id: 1, club_name: 'Coding Club' }]
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
