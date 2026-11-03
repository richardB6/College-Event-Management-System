export type Role = 'student' | 'admin';

export interface AuthUser {
  id: number;
  role: Role;
  email?: string;
  usn?: string;
  full_name?: string;
}

export interface Student {
  student_id: number;
  usn: string | null;
  email: string | null;
  fname: string;
  lname: string;
  full_name: string;
  year: number;
  branch: string;
  account_status: string;
  has_account: boolean;
  created_at: string;
}

export interface Club {
  club_id: number;
  club_name: string;
}

export interface Event {
  event_id: number;
  event_name: string;
  event_date: string;
  location: string;
  club_id: number;
  club_name: string;
}

export interface Registration {
  reg_id: number;
  student_id?: number;
  event_id: number;
  entry_fee: number;
  student_name?: string;
  usn?: string | null;
  email?: string | null;
  event_name: string;
  event_date?: string;
  location?: string;
  club_name: string;
}

export interface PageResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export interface DashboardData {
  students: number;
  clubs: number;
  events: number;
  registrations: number;
  registrations_by_event: { label: string; registrations: number }[];
  recent_activity: {
    audit_id: number;
    actor_id: number;
    actor_role: Role;
    action: string;
    resource_type: string;
    resource_id: string | null;
    created_at: string;
  }[];
}
