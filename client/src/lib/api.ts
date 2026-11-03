let csrfToken: string | undefined;

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchCsrfToken(): Promise<string> {
  if (!csrfToken) {
    const response = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
    const data = (await response.json()) as { csrfToken: string; error?: string };
    if (!response.ok) throw new ApiError(data.error ?? 'Could not start a secure session.', response.status);
    csrfToken = data.csrfToken;
  }
  return csrfToken;
}

export async function refreshCsrfToken(): Promise<void> {
  csrfToken = undefined;
  await fetchCsrfToken();
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('X-CSRF-Token', await fetchCsrfToken());

  const response = await fetch(`/api${path}`, {
    ...init,
    method,
    headers,
    credentials: 'same-origin',
  });
  if (response.status === 204) return undefined as T;

  const payload = (await response.json()) as { error?: string } & T;
  if (!response.ok) {
    if (response.status === 403 && method !== 'GET') csrfToken = undefined;
    throw new ApiError(payload.error ?? 'The request could not be completed.', response.status);
  }
  return payload;
}
