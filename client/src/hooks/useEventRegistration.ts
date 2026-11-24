import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/ui';
import { ApiError, api } from '../lib/api';
import type { Event, Registration } from '../lib/types';

export function useEventRegistration() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const notify = useToast();
  const inFlight = useRef(false);
  const registrations = useQuery({
    queryKey: ['student', 'registrations'],
    queryFn: () => api<Registration[]>('/student/registrations'),
    enabled: user?.role === 'student',
  });

  const mutation = useMutation({
    mutationFn: async (event: Event) => {
      try {
        return await api<{ reg_id: number; status: string; waitlist_position: number | null }>('/student/registrations', {
          method: 'POST',
          body: JSON.stringify({ event_id: event.event_id }),
        });
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== 'SCHEDULE_CONFLICT') throw error;
        const details = error.details && typeof error.details === 'object'
          ? error.details as { conflicts?: { event_name: string; event_date: string; start_time: string; end_time: string }[] }
          : undefined;
        const conflicts = (Array.isArray(details?.conflicts) ? details.conflicts : [])
          .map(item => `${item.event_name} (${item.event_date}, ${item.start_time}–${item.end_time})`)
          .join('\n');
        if (!window.confirm(`${error.message}${conflicts ? `\n\n${conflicts}` : ''}\n\nRegister anyway? Your decision will be recorded.`)) {
          return { cancelled: true as const };
        }

        return api<{ reg_id: number; status: string; waitlist_position: number | null }>('/student/registrations', {
          method: 'POST',
          body: JSON.stringify({ event_id: event.event_id, allow_conflicts: true }),
        });
      }
    },
    onSuccess: async (result, event) => {
      if ('cancelled' in result) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['student', 'registrations'] }),
        queryClient.invalidateQueries({ queryKey: ['public', 'events'] }),
        queryClient.invalidateQueries({ queryKey: ['public', 'event', String(event.event_id)] }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      ]);
      notify(result.status === 'waitlisted'
        ? `You're on the waitlist for ${event.event_name} at position #${result.waitlist_position}.`
        : `You're registered for ${event.event_name}.`);
    },
    onError: error => notify(error instanceof Error ? error.message : 'Registration failed.', 'error'),
    onSettled: () => { inFlight.current = false; },
  });

  function register(event: Event) {
    if (inFlight.current) return;
    inFlight.current = true;
    mutation.mutate(event);
  }

  function getRegistration(eventId: number) {
    return registrations.data
      ?.filter(item => item.event_id === eventId && ['confirmed', 'waitlisted', 'promotion_pending'].includes(item.status ?? ''))
      .sort((a, b) => b.reg_id - a.reg_id)[0];
  }

  return {
    registrations,
    getRegistration,
    register,
    pendingEventId: mutation.isPending ? mutation.variables?.event_id : undefined,
    isPending: mutation.isPending,
  };
}
