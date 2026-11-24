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
      club_memberships: [{ club_id: 7, club_name: 'Legacy Club', status: 'active', joined_at: null, designation: 'member' }],
      registrations: [{
        reg_id: 19,
        event_id: 4,
        event_name: 'Legacy Event',
        club_name: 'Legacy Club',
        registered_at: null,
        start_time: '10:00',
        end_date: '2099-06-15',
        end_time: '11:00',
        entry_fee: 0,
      }],
      waitlist_history: [{ action: 'joined', position: 1, created_at: null, event_name: 'Legacy Event', event_id: 4 }],
      activity: [{
        type: 'account.created',
        created_at: null,
        resource_type: 'student',
        resource_id: '121',
        details: null,
      }],
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
    expect(screen.getByText('account created')).toBeInTheDocument();
    expect(screen.getAllByText('Not recorded')).toHaveLength(3);
  });
});
