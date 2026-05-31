import { appConfig } from '../config/appConfig';

const CLIENT_PLATFORM_HEADER = 'mobile';

export interface ApiOptions {
  locale?: string;
}

export async function apiGet<T>(path: string, accessToken: string, options?: ApiOptions): Promise<T> {
  const response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
    method: 'GET',
    headers: buildHeaders(accessToken, options?.locale),
  });
  return handleResponse<T>(response);
}

export async function apiPost<TBody, TResponse>(
  path: string,
  body: TBody,
  accessToken: string,
  options?: ApiOptions,
): Promise<TResponse> {
  const response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
    method: 'POST',
    headers: buildHeaders(accessToken, options?.locale),
    body: JSON.stringify(body),
  });
  return handleResponse<TResponse>(response);
}

export async function apiDelete(path: string, accessToken: string): Promise<void> {
  const response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
    method: 'DELETE',
    headers: buildHeaders(accessToken),
  });
  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }
}

function buildHeaders(accessToken: string, locale?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'X-Client-Platform': CLIENT_PLATFORM_HEADER,
    Accept: 'application/json',
  };
  if (locale) headers['Accept-Language'] = locale;
  return headers;
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
