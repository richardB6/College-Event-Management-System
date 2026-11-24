import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Notification, Role } from '../lib/types';

export interface RecentNotifications {
  items: Notification[];
  unread: number;
}

export function useRecentNotifications(role: Role | null | undefined, poll = false) {
  const base = role === 'organizer' ? '/organizer' : '/student';
  return useQuery({
    queryKey: ['notifications', 'recent', role],
    queryFn: () => api<RecentNotifications>(`${base}/notifications?limit=100`),
    enabled: role === 'student' || role === 'organizer',
    staleTime: 30_000,
    refetchInterval: poll ? 60_000 : false,
  });
}
