import * as SecureStore from 'expo-secure-store';
import type { UserProfile } from '@portal/types';
import {
  SECURE_KEYS,
  storeTokens,
  getAccessToken,
  getRefreshToken,
  clearAllTokens,
  storeUserProfile,
  getStoredUserProfile,
  isBiometricEnabled,
  setBiometricEnabled,
} from '../../src/lib/auth-store';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

const mockUser: UserProfile = {
  id: 'u-001',
  email: 'test@example.com',
  displayName: 'Test User',
  firstName: 'Test',
  lastName: 'User',
  avatarUrl: null,
  roles: ['citizen'],
  linkedEntityIds: [],
  preferredLanguage: 'en',
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

describe('storeTokens', () => {
  it('storeTokens_validTokens_writesAccessAndRefreshToSecureStore', async () => {
    await storeTokens('access-abc', 'refresh-xyz');

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(SECURE_KEYS.ACCESS_TOKEN, 'access-abc');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(SECURE_KEYS.REFRESH_TOKEN, 'refresh-xyz');
    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(2);
  });
});

describe('getAccessToken', () => {
  it('getAccessToken_tokenExists_returnsToken', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('stored-access');

    const result = await getAccessToken();

    expect(SecureStore.getItemAsync).toHaveBeenCalledWith(SECURE_KEYS.ACCESS_TOKEN);
    expect(result).toBe('stored-access');
  });

  it('getAccessToken_noToken_returnsNull', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

    const result = await getAccessToken();

    expect(result).toBeNull();
  });
});

describe('getRefreshToken', () => {
  it('getRefreshToken_tokenExists_returnsToken', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('stored-refresh');

    const result = await getRefreshToken();

    expect(SecureStore.getItemAsync).toHaveBeenCalledWith(SECURE_KEYS.REFRESH_TOKEN);
    expect(result).toBe('stored-refresh');
  });
});

describe('clearAllTokens', () => {
  it('clearAllTokens_always_deletesAccessRefreshAndProfile', async () => {
    await clearAllTokens();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(SECURE_KEYS.ACCESS_TOKEN);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(SECURE_KEYS.REFRESH_TOKEN);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(SECURE_KEYS.USER_PROFILE);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// User profile
// ---------------------------------------------------------------------------

describe('storeUserProfile', () => {
  it('storeUserProfile_validUser_writesJsonStringToSecureStore', async () => {
    await storeUserProfile(mockUser);

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      SECURE_KEYS.USER_PROFILE,
      JSON.stringify(mockUser),
    );
  });
});

describe('getStoredUserProfile', () => {
  it('getStoredUserProfile_noStoredValue_returnsNull', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

    const result = await getStoredUserProfile();

    expect(result).toBeNull();
  });

  it('getStoredUserProfile_validJson_returnsParsedProfile', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(mockUser));

    const result = await getStoredUserProfile();

    expect(result).toEqual(mockUser);
  });

  it('getStoredUserProfile_corruptJson_returnsNull', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('{{invalid json}}');

    const result = await getStoredUserProfile();

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Biometric preference
// ---------------------------------------------------------------------------

describe('isBiometricEnabled', () => {
  it('isBiometricEnabled_noStoredValue_returnsFalse', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

    const result = await isBiometricEnabled();

    expect(result).toBe(false);
  });

  it('isBiometricEnabled_storedValueIsTrue_returnsTrue', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('true');

    const result = await isBiometricEnabled();

    expect(result).toBe(true);
  });

  it('isBiometricEnabled_storedValueIsFalse_returnsFalse', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('false');

    const result = await isBiometricEnabled();

    expect(result).toBe(false);
  });
});

describe('setBiometricEnabled', () => {
  it('setBiometricEnabled_true_writesStringTrueToSecureStore', async () => {
    await setBiometricEnabled(true);

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(SECURE_KEYS.BIOMETRIC_ENABLED, 'true');
  });

  it('setBiometricEnabled_false_writesStringFalseToSecureStore', async () => {
    await setBiometricEnabled(false);

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(SECURE_KEYS.BIOMETRIC_ENABLED, 'false');
  });
});
