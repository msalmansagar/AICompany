import { appConfig } from '../config/appConfig';

const CLIENT_PLATFORM_HEADER = 'mobile';

export async function apiGet<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
    method: 'GET',
    headers: buildHeaders(accessToken),
  });
  return handleResponse<T>(response);
}

export async function apiPost<TBody, TResponse>(
  path: string,
  body: TBody,
  accessToken: string
): Promise<TResponse> {
  const response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
    method: 'POST',
    headers: buildHeaders(accessToken),
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

function buildHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'X-Client-Platform': CLIENT_PLATFORM_HEADER,
    Accept: 'application/json',
  };
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
