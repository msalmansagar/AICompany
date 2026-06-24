import { appConfig } from '../config/appConfig';

const CLIENT_PLATFORM_HEADER = 'mobile';
const FETCH_TIMEOUT_MS = 15_000;

export interface ApiOptions {
  /**
   * BCP-47 language code to append as ?lang= query parameter (AG-003).
   * The backend validates this against its allowlist (NFR-007).
   */
  lang?: string;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(0, `Request timed out after ${FETCH_TIMEOUT_MS / 1000}s. Is the backend running at ${appConfig.apiBaseUrl}?`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function apiGet<T>(path: string, accessToken: string, options?: ApiOptions): Promise<T> {
  const url = buildUrl(`${appConfig.apiBaseUrl}${path}`, options?.lang);
  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: buildHeaders(accessToken),
  });
  return handleResponse<T>(response);
}

export async function apiPost<TBody, TResponse>(
  path: string,
  body: TBody,
  accessToken: string,
  options?: ApiOptions,
): Promise<TResponse> {
  const url = buildUrl(`${appConfig.apiBaseUrl}${path}`, options?.lang);
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: buildHeaders(accessToken),
    body: JSON.stringify(body),
  });
  return handleResponse<TResponse>(response);
}

export async function apiDelete(path: string, accessToken: string): Promise<void> {
  const response = await fetchWithTimeout(`${appConfig.apiBaseUrl}${path}`, {
    method: 'DELETE',
    headers: buildHeaders(accessToken),
  });
  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }
}

function buildHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'X-Client-Platform': CLIENT_PLATFORM_HEADER,
    Accept: 'application/json',
  };
}

/**
 * Appends ?lang= query parameter when a language code is provided (AG-003).
 * The backend validates the code against its allowlist — we pass it verbatim.
 */
function buildUrl(base: string, lang?: string): string {
  if (!lang) return base;
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}lang=${encodeURIComponent(lang)}`;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }
  const json = await response.json();
  return json.data as T;
}

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(`API error ${statusCode}: ${message}`);
  }
}
