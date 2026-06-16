import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BiometricState {
  isSupported: boolean;
  isEnrolled: boolean;
  biometricType: LocalAuthentication.AuthenticationType[];
  authenticate: () => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBiometric(): BiometricState {
  const [isSupported, setIsSupported] = useState(false);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [biometricType, setBiometricType] = useState<LocalAuthentication.AuthenticationType[]>([]);

  useEffect(() => {
    async function detectCapabilities(): Promise<void> {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const supportedTypes = hasHardware
        ? await LocalAuthentication.supportedAuthenticationTypesAsync()
        : [];

      setIsSupported(hasHardware);
      setIsEnrolled(enrolled);
      setBiometricType(supportedTypes);
    }

    void detectCapabilities();
  }, []);

  const authenticate = useCallback(async (): Promise<boolean> => {
    // MB-001 fix: detect capabilities fresh on every call to avoid the race condition
    // where isSupported/isEnrolled are still false (initial state) when this is called
    // on app mount, which would bypass biometric verification entirely.
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();

    if (!hasHardware || !enrolled) return true;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Verify your identity to access the portal',
      fallbackLabel: 'Use PIN',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });

    return result.success;
  }, []);

  return { isSupported, isEnrolled, biometricType, authenticate };
}
