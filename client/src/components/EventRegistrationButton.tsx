import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from './ui';
import type { Event, Registration } from '../lib/types';

interface EventRegistrationButtonProps {
  event: Event;
  registration?: Registration;
  isPending?: boolean;
  isAnyPending?: boolean;
  isStatusLoading?: boolean;
  isStatusError?: boolean;
  onRegister: (event: Event) => void;
  compact?: boolean;
}

function openingTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export function EventRegistrationButton({
  event,
  registration,
  isPending = false,
  isAnyPending = false,
  isStatusLoading = false,
  isStatusError = false,
  onRegister,
  compact = false,
}: EventRegistrationButtonProps) {
  const { user } = useAuth();
  const registrationOpen = ['registration_open', 'full'].includes(event.lifecycle_status);
  const disabled = isPending || isAnyPending || isStatusLoading || isStatusError
    || user?.role !== 'student'
    || Boolean(registration)
    || !registrationOpen;
  let label = 'Registration unavailable';
  if (event.lifecycle_status === 'cancelled') label = 'Event Cancelled';
  else if (['completed', 'ongoing'].includes(event.lifecycle_status)) label = event.lifecycle_status === 'ongoing' ? 'Event In Progress' : 'Event Ended';
  else if (isStatusLoading && user?.role === 'student') label = 'Checking status…';
  else if (isStatusError && user?.role === 'student') label = 'Status unavailable';
  else if (isPending) label = 'Registering…';
  else if (registration?.status === 'waitlisted') label = 'Waitlisted';
  else if (registration) label = 'Registered';
  else if (user && user.role !== 'student') label = 'Student account required';
  else if (!user && registrationOpen) label = 'Log in to Register';
  else if (event.lifecycle_status === 'published') label = 'Registration Opens Soon';
  else if (event.lifecycle_status === 'registration_closed') label = 'Registration Closed';
  else if (event.lifecycle_status === 'full') label = 'Join Waitlist';
  else if (event.lifecycle_status === 'registration_open') label = 'Register';

  const opensAt = event.lifecycle_status === 'published' ? openingTime(event.registration_opens_at) : null;
  const action = !user && registrationOpen
    ? <Link
      className={`button button-primary${compact ? ' button-small' : ''}`}
      to="/student/login"
      state={{
        from: `/events/${event.event_id}`,
        message: 'Sign in to your student account to register for this event.',
      }}
    >
      {label}
    </Link>
    : <Button
      className={compact ? 'button-small' : ''}
      variant={registration ? 'secondary' : 'primary'}
      type="button"
      disabled={disabled}
      onClick={() => user?.role === 'student' && !disabled ? onRegister(event) : undefined}
    >
      {label}
    </Button>;

  return <span className="event-registration-control">
    {action}
    {opensAt && <small className="event-registration-opening">Opens {opensAt}</small>}
    {isStatusError && user?.role === 'student' && <small className="event-registration-opening" role="status">Refresh to check your registration status.</small>}
  </span>;
}
