import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, GraduationCap, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '../components/ui';

const gmail = z.string().trim().email('Enter a valid email address.')
  .refine(value => value.toLowerCase().endsWith('@gmail.com'), 'Use a Gmail address.');
const password = z.string().min(12, 'Use at least 12 characters.')
  .max(128, 'Password must be 128 characters or fewer.')
  .regex(/[a-z]/, 'Add a lowercase letter.')
  .regex(/[A-Z]/, 'Add an uppercase letter.')
  .regex(/\d/, 'Add a number.');

const loginSchema = z.object({
  usn: z.string().trim().min(1, 'Enter your university seat number.'),
  password: z.string().min(1, 'Enter your password.'),
});
const adminSchema = z.object({ email: gmail, password: z.string().min(1, 'Enter your password.') });
const registrationSchema = (pattern: string) => z.object({
  usn: z.string().trim().toUpperCase().refine(value => {
    try { return new RegExp(pattern, 'i').test(value); } catch { return false; }
  }, 'Enter a USN that matches the university format.'),
  full_name: z.string().trim().min(2, 'Enter your full name.').max(120),
  email: gmail,
  password,
  password_confirmation: z.string(),
  year: z.coerce.number().int().min(1).max(8),
  branch: z.string().trim().min(1, 'Enter your branch.').max(80),
}).refine(value => value.password === value.password_confirmation, {
  path: ['password_confirmation'],
  message: 'Passwords do not match.',
});

type LoginValues = z.infer<typeof loginSchema>;
type AdminValues = z.infer<typeof adminSchema>;
type RegistrationSchema = ReturnType<typeof registrationSchema>;
type RegistrationInput = z.input<RegistrationSchema>;
type RegistrationValues = z.output<RegistrationSchema>;

function PasswordField({ label, registration, error, autoComplete = 'current-password' }: {
  label: string;
  registration: UseFormRegisterReturn;
  error?: string;
  autoComplete?: 'current-password' | 'new-password';
}) {
  const [visible, setVisible] = useState(false);
  return <label className="form-field">
    <span>{label}</span>
    <span className="password-wrap">
      <input {...registration} type={visible ? 'text' : 'password'} autoComplete={autoComplete} />
      <button type="button" className="password-toggle" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(value => !value)}>
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </span>
    {error && <small className="field-error">{error}</small>}
  </label>;
}

function AuthFrame({ children, admin = false }: { children: React.ReactNode; admin?: boolean }) {
  const Icon = admin ? ShieldCheck : GraduationCap;
  return <main className="auth-page">
    <div className={`auth-art ${admin ? 'auth-art-admin' : ''}`} aria-hidden="true">
      <Link to="/" className="brand auth-brand"><span className="brand-mark">C</span><span>clubhub</span></Link>
      <div className="auth-art-copy">
        <span className="auth-art-icon"><Icon size={22} /></span>
        <span className="eyebrow">{admin ? 'CAMPUS WORKSPACE' : 'YOUR CAMPUS, YOUR COMMUNITY'}</span>
        <h2>{admin ? 'A better campus starts with the people behind it.' : 'There’s more to college than the classroom.'}</h2>
        <p>{admin ? 'The tools you need to bring your university community together.' : 'Find your people, try something new, and make this year yours.'}</p>
      </div>
      <span className="auth-art-footer">ClubHub · Campus life, connected</span>
    </div>
    <section className="auth-panel">{children}</section>
  </main>;
}

export function StudentLoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const notice = (location.state as { message?: string } | null)?.message;
  const notify = useToast();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async values => {
    try {
      await signIn('/auth/student/login', { ...values, usn: values.usn.toUpperCase() });
      navigate((location.state as { from?: string } | null)?.from ?? '/student', { replace: true });
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Sign in failed.', 'error');
    }
  });

  return <AuthFrame>
    <div className="auth-content">
      <Link to="/" className="auth-mobile-brand"><span className="brand-mark">C</span> clubhub</Link>
      <span className="eyebrow">STUDENT PORTAL</span>
      <h1>Welcome back</h1>
      <p className="auth-subtitle">Sign in to pick up where campus life left off.</p>
      {notice && <p className="auth-notice" role="status">{notice}</p>}
      <form className="auth-form" onSubmit={onSubmit}>
        <label className="form-field"><span>University seat number</span><input {...register('usn')} placeholder="e.g. 2BU24CS001" autoComplete="username" autoCapitalize="characters" />{errors.usn && <small className="field-error">{errors.usn.message}</small>}</label>
        <PasswordField label="Password" registration={register('password')} error={errors.password?.message} />
        <button className="button button-primary auth-submit" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : 'Sign in'} <span>→</span></button>
      </form>
      <p className="auth-switch">New to ClubHub? <Link to="/student/register">Create your student account</Link></p>
      <Link className="auth-admin-link" to="/admin/login">Administrator? Sign in here →</Link>
    </div>
  </AuthFrame>;
}

export function StudentRegisterPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const notify = useToast();
  const patternQuery = useQuery({ queryKey: ['public-config'], queryFn: () => api<{ usn_pattern: string }>('/public/config'), staleTime: Infinity });
  const pattern = patternQuery.data?.usn_pattern ?? '^2BU\\d{2}[A-Z]{2}\\d{3}$';
  const schema = useMemo(() => registrationSchema(pattern), [pattern]);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegistrationInput, unknown, RegistrationValues>({ resolver: zodResolver(schema), defaultValues: { year: 1 } });

  const onSubmit = handleSubmit(async values => {
    try {
      await signIn('/auth/student/register', { ...values, usn: values.usn.toUpperCase() });
      navigate('/student', { replace: true });
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Account creation failed.', 'error');
    }
  });

  return <AuthFrame>
    <div className="auth-content auth-content-wide">
      <Link to="/" className="auth-mobile-brand"><span className="brand-mark">C</span> clubhub</Link>
      <span className="eyebrow">JOIN YOUR CAMPUS COMMUNITY</span>
      <h1>Create your account</h1>
      <p className="auth-subtitle">A place for your campus life to come together.</p>
      {patternQuery.isError && <p className="inline-error">Could not load the university USN rules. Please refresh and try again.</p>}
      <form className="auth-form registration-form" onSubmit={onSubmit}>
        <label className="form-field"><span>University seat number</span><input {...register('usn')} placeholder="e.g. 2BU24CS001" autoComplete="username" autoCapitalize="characters" />{errors.usn && <small className="field-error">{errors.usn.message}</small>}</label>
        <label className="form-field"><span>Full name</span><input {...register('full_name')} placeholder="Your name as it appears at university" autoComplete="name" />{errors.full_name && <small className="field-error">{errors.full_name.message}</small>}</label>
        <label className="form-field"><span>Gmail address</span><input {...register('email')} type="email" placeholder="you@gmail.com" autoComplete="email" />{errors.email && <small className="field-error">{errors.email.message}</small>}</label>
        <div className="form-row">
          <label className="form-field"><span>Year of study</span><select {...register('year')}><option value="1">Year 1</option><option value="2">Year 2</option><option value="3">Year 3</option><option value="4">Year 4</option><option value="5">Year 5</option><option value="6">Year 6</option></select>{errors.year && <small className="field-error">Choose a year.</small>}</label>
          <label className="form-field"><span>Branch</span><input {...register('branch')} placeholder="e.g. Computer Science" />{errors.branch && <small className="field-error">{errors.branch.message}</small>}</label>
        </div>
        <PasswordField label="Password" registration={register('password')} error={errors.password?.message} autoComplete="new-password" />
        <PasswordField label="Confirm password" registration={register('password_confirmation')} error={errors.password_confirmation?.message} autoComplete="new-password" />
        <p className="privacy-note">Your student profile and activity are visible only to you and authorized administrators. A valid USN format does not independently verify university enrollment.</p>
        <button className="button button-primary auth-submit" disabled={isSubmitting || patternQuery.isLoading || patternQuery.isError}>{isSubmitting ? 'Creating account…' : 'Create student account'} <span>→</span></button>
      </form>
      <p className="auth-switch">Already registered? <Link to="/student/login">Sign in</Link></p>
    </div>
  </AuthFrame>;
}

export function AdminLoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const notify = useToast();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<AdminValues>({ resolver: zodResolver(adminSchema) });
  const onSubmit = handleSubmit(async values => {
    try {
      await signIn('/auth/admin/login', values);
      navigate((location.state as { from?: string } | null)?.from ?? '/admin', { replace: true });
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Sign in failed.', 'error');
    }
  });

  return <AuthFrame admin>
    <div className="auth-content">
      <Link to="/" className="auth-mobile-brand"><span className="brand-mark">C</span> clubhub</Link>
      <span className="eyebrow">ADMINISTRATOR ACCESS</span>
      <h1>Welcome back</h1>
      <p className="auth-subtitle">Sign in to your campus workspace.</p>
      <form className="auth-form" onSubmit={onSubmit}>
        <label className="form-field"><span>Administrator Gmail</span><input {...register('email')} type="email" placeholder="admin@gmail.com" autoComplete="username" />{errors.email && <small className="field-error">{errors.email.message}</small>}</label>
        <PasswordField label="Password" registration={register('password')} error={errors.password?.message} />
        <button className="button button-primary auth-submit" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : 'Sign in to workspace'} <span>→</span></button>
      </form>
      <Link className="auth-admin-link" to="/">← Back to the public site</Link>
      <p className="privacy-note">Administrator accounts are provisioned by authorized staff. Public administrator registration is disabled.</p>
    </div>
  </AuthFrame>;
}
