import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminStudentDetailPage } from './AdminPages';

describe('admin student profile', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows legacy student details when the creation timestamp is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      student: {
        student_id: 121,
        usn: null,
        email: null,
        fname: 'Legacy',
        lname: 'Student',
        full_name: 'Legacy Student',
        year: 4,
        branch: 'CSE',
        department_code: 'CSE',
        department_name: 'Computer Science and Engineering',
        account_status: 'active',
        has_account: false,
        created_at: null,
      },
      club_memberships: [],
      registrations: [],
      waitlist_history: [],
      activity: [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin/students/121']}>
          <Routes>
            <Route path="/admin/students/:studentId" element={<AdminStudentDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findAllByRole('heading', { name: 'Legacy Student' })).toHaveLength(2);
    expect(screen.getByText('Created: Not recorded')).toBeInTheDocument();
  });
});
