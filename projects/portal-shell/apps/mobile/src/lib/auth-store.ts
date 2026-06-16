import * as SecureStore from 'expo-secure-store';
import type { UserProfile } from '@portal/types';

// ---------------------------------------------------------------------------
// Key constants
// ---------------------------------------------------------------------------

export const SECURE_KEYS = {
  ACCESS_TOKEN: 'portal_access_token',
  REFRESH_TOKEN: 'portal_refresh_token',
  USER_PROFILE: 'portal_user_profile',
  BIOMETRIC_ENABLED: 'portal_biometric_enabled',
} as const;

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

export async function storeTokens(accessToken: string, refreshToken: string): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(SECURE_KEYS.ACCESS_TOKEN, accessToken),
    SecureStore.setItemAsync(SECURE_KEYS.REFRESH_TOKEN, refreshToken),
  ]);
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(SECURE_KEYS.ACCESS_TOKEN);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(SECURE_KEYS.REFRESH_TOKEN);
}

export async function clearAllTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(SECURE_KEYS.ACCESS_TOKEN),
    SecureStore.deleteItemAsync(SECURE_KEYS.REFRESH_TOKEN),
    SecureStore.deleteItemAsync(SECURE_KEYS.USER_PROFILE),
  ]);
}

// ---------------------------------------------------------------------------
// User profile
// ---------------------------------------------------------------------------

export async function storeUserProfile(user: UserProfile): Promise<void> {
  await SecureStore.setItemAsync(SECURE_KEYS.USER_PROFILE, JSON.stringify(user));
}

export async function getStoredUserProfile(): Promise<UserProfile | null> {
  const raw = await SecureStore.getItemAsync(SECURE_KEYS.USER_PROFILE);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserProfile;
  } catch {
    // Corrupt stored data — treat as missing
    return null;
  }
}

// ---------------------------------------------------------------------------
// Biometric preference
// ---------------------------------------------------------------------------

export async function isBiometricEnabled(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(SECURE_KEYS.BIOMETRIC_ENABLED);
  return value === 'true';
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(SECURE_KEYS.BIOMETRIC_ENABLED, String(enabled));
}
