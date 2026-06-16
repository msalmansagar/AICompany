import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api } from '../lib/api';
import {
  storeTokens,
  storeUserProfile,
  clearAllTokens,
  getStoredUserProfile,
} from '../lib/auth-store';
import type { AuthResult, UserProfile } from '@portal/types';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const AUTH_QUERY_KEYS = {
  user: ['auth', 'user'] as const,
} as const;

// ---------------------------------------------------------------------------
// Current user
// ---------------------------------------------------------------------------

export function useCurrentUser() {
  return useQuery<UserProfile | null>({
    queryKey: AUTH_QUERY_KEYS.user,
    queryFn: getStoredUserProfile,
    // User profile from SecureStore is always fresh — do not refetch
    staleTime: Infinity,
  });
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

interface LoginParams {
  email: string;
  password: string;
}

interface AuthApiResponse {
  data: AuthResult;
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ email, password }: LoginParams): Promise<AuthResult> => {
      const response = await api.post<AuthApiResponse>('/api/auth/login', { email, password });
      return response.data;
    },
    onSuccess: async (result: AuthResult): Promise<void> => {
      await storeTokens(result.accessToken, result.refreshToken);
      await storeUserProfile(result.user);
      queryClient.setQueryData<UserProfile>(AUTH_QUERY_KEYS.user, result.user);
      router.replace('/(tabs)/dashboard');
    },
  });
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (): Promise<void> => api.post('/api/auth/logout', {}),
    onSettled: async (): Promise<void> => {
      await clearAllTokens();
      queryClient.clear();
      router.replace('/auth/login');
    },
  });
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

interface RegisterParams {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  preferredLanguage: 'en' | 'ar';
}

export function useRegister() {
  return useMutation({
    mutationFn: (params: RegisterParams): Promise<void> =>
      api.post('/api/auth/register', params),
  });
}

// ---------------------------------------------------------------------------
// Forgot password
// ---------------------------------------------------------------------------

export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string): Promise<void> =>
      api.post('/api/auth/forgot-password', { email }),
  });
}

// ---------------------------------------------------------------------------
// Silent token refresh
// ---------------------------------------------------------------------------

interface RefreshApiResponse {
  data: { accessToken: string; refreshToken: string };
}

export function useRefreshToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (refreshToken: string): Promise<void> => {
      const response = await api.post<RefreshApiResponse>('/api/auth/refresh', { refreshToken });
      await storeTokens(response.data.accessToken, response.data.refreshToken);
    },
    onError: async (): Promise<void> => {
      // Refresh failed — clear session and redirect to login
      await clearAllTokens();
      queryClient.clear();
      router.replace('/auth/login');
    },
  });
}
