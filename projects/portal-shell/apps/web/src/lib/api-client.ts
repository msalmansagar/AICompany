import { auth } from './auth';

const API_BASE = process.env['API_URL'] ?? 'http://localhost:4001';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Builds a request init object with the Authorization header populated from the
 * current Auth.js session. Must only be called from Server Components or
 * Server Actions (not from Client Components).
 */
async function buildServerHeaders(extraHeaders?: Record<string, string>): Promise<HeadersInit> {
  const session = await auth();
  const accessToken = (session as unknown as Record<string, unknown>)?.['accessToken'];

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };

  if (typeof accessToken === 'string') {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  return headers;
}

/**
 * Typed GET helper for server-side API calls.
 * Throws ApiError on non-2xx responses.
 */
export async function serverGet<T>(path: string): Promise<T> {
  const headers = await buildServerHeaders();
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(`GET ${path} failed with status ${response.status}`, response.status, body);
  }

  return response.json() as Promise<T>;
}

/**
 * Typed POST helper for server-side API calls.
 * Throws ApiError on non-2xx responses.
 */
export async function serverPost<TBody, TResponse>(
  path: string,
  body: TBody
): Promise<TResponse> {
  const headers = await buildServerHeaders();
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const responseBody = await response.json().catch(() => null);
    throw new ApiError(
      `POST ${path} failed with status ${response.status}`,
      response.status,
      responseBody
    );
  }

  return response.json() as Promise<TResponse>;
}

/**
 * Client-side fetch wrapper. Throws ApiError on non-2xx responses.
 */
export async function clientFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const base = process.env['API_URL'] ?? 'http://localhost:4001';
  const url = path.startsWith('http') ? path : `${base}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(
      `${options.method ?? 'GET'} ${path} failed with ${response.status}`,
      response.status,
      body
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

/** Typed client-side GET */
export function clientGet<T>(path: string): Promise<T> {
  return clientFetch<T>(path, { method: 'GET' });
}

/** Typed client-side POST */
export function clientPost<T>(path: string, body: unknown): Promise<T> {
  return clientFetch<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

/** Typed client-side PATCH */
export function clientPatch<T>(path: string, body: unknown): Promise<T> {
  return clientFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
}

/** Typed client-side DELETE */
export function clientDelete(path: string): Promise<void> {
  return clientFetch<void>(path, { method: 'DELETE' });
}
