export type Role = 'student' | 'admin' | 'organizer';

export interface AuthUser {
  id: number;
  role: Role;
  email?: string;
  usn?: string;
  full_name?: string;
  club_id?: number | null;
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
  department_code: string | null;
  department_name: string | null;
  account_status: string;
  has_account: boolean;
  created_at: string | null;
}

export interface Club {
  club_id: number;
  club_name: string;
}

export interface ClubMembership {
  membership_id: number;
  club_id: number;
  club_name: string;
  designation: string;
  status: 'active' | 'left' | 'suspended';
  joined_at: string;
}

export interface Event {
  event_id: number;
  event_name: string;
  description: string;
  category: string;
  organizer: string;
  organizer_id: number | null;
  event_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  timezone: string;
  location: string;
  club_id: number;
  club_name: string;
  entry_fee: number;
  capacity: number;
  confirmed_count: number;
  available_slots: number;
  waitlist_count: number;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  status: 'draft' | 'published' | 'cancelled' | 'completed';
  lifecycle_status: string;
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
  start_time?: string;
  end_date?: string;
  end_time?: string;
  location?: string;
  club_name: string;
  status?: 'confirmed' | 'waitlisted' | 'promotion_pending' | 'cancelled' | 'attended' | 'promotion_expired';
  waitlist_position?: number | null;
  promotion_expires_at?: string | null;
  created_at?: string;
}

export interface Notification {
  notification_id: number;
  notification_type: string;
  message: string;
  event_id: number | null;
  created_at: string;
  read_at: string | null;
}

export interface Department {
  department_code: string;
  department_name: string;
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
  students_by_department: { label: string; students: number }[];
  students_by_year: { year: number; students: number }[];
  event_counts: { status: string; count: number }[];
  waitlisted: number;
  scheduling_conflicts: number;
  active_club_memberships: number;
  students_without_membership: number;
  club_memberships_by_club: { label: string; members: number }[];
}
