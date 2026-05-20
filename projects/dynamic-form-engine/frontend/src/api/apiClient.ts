import axios, { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import type { ApiResponse } from '@dfe/shared';
import { acquireBearerToken } from '../auth/tokenService';

const apiClient = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await acquireBearerToken();
  config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

apiClient.interceptors.response.use(
  (response: AxiosResponse<ApiResponse<unknown>>) => {
    const envelope = response.data;

    if (!envelope.success) {
      const message = envelope.error?.message ?? 'An unexpected error occurred';
      const error = new ApiClientError(message, envelope.error?.code ?? 'UNKNOWN', response.status);
      throw error;
    }

    // Unwrap the envelope so callers receive the typed data directly.
    return { ...response, data: envelope.data };
  },
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response) {
      const envelope = error.response.data as ApiResponse<unknown> | undefined;
      const message = envelope?.error?.message ?? error.message;
      const code = envelope?.error?.code ?? 'HTTP_ERROR';
      throw new ApiClientError(message, code, error.response.status);
    }
    throw error;
  },
);

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export default apiClient;
