import * as SecureStore from 'expo-secure-store';
import { SECURE_KEYS } from './auth-store';

const API_BASE = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:4001';

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  public readonly status: number;
  public readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function buildAuthHeader(): Promise<Record<string, string>> {
  const token = await SecureStore.getItemAsync(SECURE_KEYS.ACCESS_TOKEN);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const authHeader = await buildAuthHeader();

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      `${(options.method ?? 'GET')} ${path} failed with status ${response.status}`,
      body,
    );
  }

  // 204 No Content — return undefined cast to T
  if (response.status === 204) return undefined as T;

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API surface
// ---------------------------------------------------------------------------

export const api = {
  get: <T>(path: string): Promise<T> => apiFetch<T>(path),

  post: <T>(path: string, body: unknown): Promise<T> =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),

  patch: <T>(path: string, body: unknown): Promise<T> =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),

  delete: (path: string): Promise<void> =>
    apiFetch<void>(path, { method: 'DELETE' }),
} as const;
