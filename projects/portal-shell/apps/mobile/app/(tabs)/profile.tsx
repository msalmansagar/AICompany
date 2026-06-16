import React from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import * as Updates from 'expo-updates';

import { SafeAreaView } from '../../src/components/ui/SafeAreaView';
import { Header } from '../../src/components/navigation/Header';
import { Avatar } from '../../src/components/ui/Avatar';
import { Button } from '../../src/components/ui/Button';
import { Colors } from '../../src/constants/Colors';
import { t, getCurrentLocale, setLocale } from '../../src/i18n';
import { useCurrentUser, useLogout } from '../../src/hooks/useAuth';
import {
  isBiometricEnabled,
  setBiometricEnabled,
} from '../../src/lib/auth-store';
import { requestNotificationPermissions } from '../../src/lib/notifications';
import { useBiometric } from '../../src/hooks/useBiometric';
import { useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Setting row component
// ---------------------------------------------------------------------------

interface SettingRowProps {
  label: string;
  description?: string;
  rightElement: React.ReactNode;
}

function SettingRow({ label, description, rightElement }: SettingRowProps): React.JSX.Element {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingText}>
        <Text style={styles.settingLabel}>{label}</Text>
        {description ? <Text style={styles.settingDesc}>{description}</Text> : null}
      </View>
      <View style={styles.settingRight}>{rightElement}</View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ProfileScreen(): React.JSX.Element {
  const { data: user } = useCurrentUser();
  const logoutMutation = useLogout();
  const { isSupported: biometricSupported } = useBiometric();

  const [biometricOn, setBiometricOn] = useState(false);
  const [notificationsOn, setNotificationsOn] = useState(false);
  const isAr = getCurrentLocale() === 'ar';

  useEffect(() => {
    async function loadPreferences(): Promise<void> {
      const bioEnabled = await isBiometricEnabled();
      setBiometricOn(bioEnabled);
    }
    void loadPreferences();
  }, []);

  async function handleBiometricToggle(value: boolean): Promise<void> {
    await setBiometricEnabled(value);
    setBiometricOn(value);
  }

  async function handleNotificationsToggle(value: boolean): Promise<void> {
    if (value) {
      const granted = await requestNotificationPermissions();
      setNotificationsOn(granted);
    } else {
      setNotificationsOn(false);
    }
  }

  function handleLanguageToggle(useArabic: boolean): void {
    const newLocale = useArabic ? 'ar' : 'en';
    setLocale(newLocale);

    Alert.alert(
      t('profile.languageChangedTitle'),
      t('profile.languageChangedMessage'),
      [
        { text: t('profile.later'), style: 'cancel' },
        {
          text: t('profile.restartNow'),
          onPress: () => {
            // expo-updates reload applies RTL direction after restart
            void Updates.reloadAsync();
          },
        },
      ],
    );
  }

  function handleSignOut(): void {
    Alert.alert(
      t('profile.signOutConfirmTitle'),
      t('profile.signOutConfirmMessage'),
      [
        { text: t('profile.signOutConfirmNo'), style: 'cancel' },
        {
          text: t('profile.signOutConfirmYes'),
          style: 'destructive',
          onPress: () => logoutMutation.mutate(),
        },
      ],
    );
  }

  return (
    <SafeAreaView>
      <Header title={t('profile.title')} />

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* User card */}
        {user ? (
          <View style={styles.userCard}>
            <Avatar
              displayName={user.displayName}
              imageUrl={user.avatarUrl}
              size={64}
            />
            <View style={styles.userInfo}>
              <Text style={styles.displayName}>{user.displayName}</Text>
              <Text style={styles.email}>{user.email}</Text>
            </View>
          </View>
        ) : null}

        {/* Settings list */}
        <View style={styles.settingsSection}>
          <Text style={styles.sectionLabel}>{t('profile.settings')}</Text>

          {/* Language */}
          <SettingRow
            label={t('profile.language')}
            rightElement={
              <View style={styles.languageToggle}>
                <Text style={[styles.langOption, !isAr && styles.langOptionActive]}>
                  {t('profile.languageEn')}
                </Text>
                <Switch
                  value={isAr}
                  onValueChange={handleLanguageToggle}
                  trackColor={{ false: Colors.grey40, true: Colors.primary }}
                  thumbColor={Colors.white}
                  accessibilityLabel={t('profile.language')}
                  testID="profile-language-switch"
                />
                <Text style={[styles.langOption, isAr && styles.langOptionActive]}>
                  {t('profile.languageAr')}
                </Text>
              </View>
            }
          />

          {/* Biometric */}
          {biometricSupported ? (
            <SettingRow
              label={t('profile.biometricLogin')}
              description={t('profile.biometricLoginDesc')}
              rightElement={
                <Switch
                  value={biometricOn}
                  onValueChange={(v) => void handleBiometricToggle(v)}
                  trackColor={{ false: Colors.grey40, true: Colors.primary }}
                  thumbColor={Colors.white}
                  accessibilityLabel={t('profile.biometricLogin')}
                  testID="profile-biometric-switch"
                />
              }
            />
          ) : null}

          {/* Notifications */}
          <SettingRow
            label={t('profile.notifications')}
            description={t('profile.notificationsDesc')}
            rightElement={
              <Switch
                value={notificationsOn}
                onValueChange={(v) => void handleNotificationsToggle(v)}
                trackColor={{ false: Colors.grey40, true: Colors.primary }}
                thumbColor={Colors.white}
                accessibilityLabel={t('profile.notifications')}
                testID="profile-notifications-switch"
              />
            }
          />
        </View>

        {/* Sign out */}
        <View style={styles.signOutSection}>
          <Button
            title={t('profile.signOut')}
            onPress={handleSignOut}
            variant="danger"
            isLoading={logoutMutation.isPending}
            testID="profile-sign-out-button"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 20,
    gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  userInfo: {
    flex: 1,
  },
  displayName: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  settingsSection: {
    marginTop: 24,
    backgroundColor: Colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  settingText: {
    flex: 1,
    marginEnd: 12,
  },
  settingLabel: {
    fontSize: 15,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  settingDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  settingRight: {
    flexShrink: 0,
  },
  languageToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  langOption: {
    fontSize: 13,
    color: Colors.textDisabled,
  },
  langOptionActive: {
    color: Colors.primary,
    fontWeight: '600',
  },
  signOutSection: {
    padding: 24,
  },
});
