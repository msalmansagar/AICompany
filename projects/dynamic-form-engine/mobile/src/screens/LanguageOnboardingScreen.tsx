/**
 * LanguageOnboardingScreen — shown ONCE at first app launch when no language
 * preference exists in AsyncStorage (OQ-005, FR-016, AC-009).
 *
 * User selects EN or AR. The selection is persisted via persistLanguage().
 * If Arabic is selected, applyRtlIfChanged(true) is called BEFORE the main
 * app shell mounts — the reload happens here, not mid-session.
 *
 * RTL layout of this screen itself: rendered LTR because I18nManager has not
 * yet been updated (no stored preference exists). After selection and reload
 * the app opens in the correct direction.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { applyRtlIfChanged } from '../i18n/RtlManager';
import { persistLanguage, isRtlLanguage } from '../i18n/useLanguageStore';
import type { SupportedLanguageCode } from '../i18n/constants';

interface LanguageOnboardingScreenProps {
  readonly onComplete: (selected: SupportedLanguageCode) => void;
}

const LANGUAGE_OPTIONS: Array<{ code: SupportedLanguageCode; label: string; nativeLabel: string }> =
  [
    { code: 'en', label: 'English', nativeLabel: 'English' },
    { code: 'ar', label: 'Arabic', nativeLabel: 'العربية' },
  ];

export function LanguageOnboardingScreen({
  onComplete,
}: LanguageOnboardingScreenProps): React.JSX.Element {
  const [selected, setSelected] = useState<SupportedLanguageCode | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  async function handleContinue(): Promise<void> {
    if (!selected) return;
    setIsApplying(true);
    try {
      await persistLanguage(selected);
      const needsRtl = isRtlLanguage(selected);
      await applyRtlIfChanged(needsRtl);
      // If applyRtlIfChanged triggered a reload, this line is never reached.
      // If direction was already correct (English selected), call onComplete.
      onComplete(selected);
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Failed to apply language selection.'
      );
      setIsApplying(false);
    }
  }

  return (
    <View style={styles.container} testID="language-onboarding-screen">
      <Text style={styles.title} accessibilityRole="header">
        Choose your language
      </Text>
      <Text style={styles.subtitle} accessibilityRole="text">
        اختر لغتك
      </Text>

      <View style={styles.optionsContainer}>
        {LANGUAGE_OPTIONS.map((option) => {
          const isActive = selected === option.code;
          return (
            <TouchableOpacity
              key={option.code}
              style={[styles.option, isActive && styles.optionActive]}
              onPress={() => setSelected(option.code)}
              accessibilityRole="radio"
              accessibilityState={{ checked: isActive }}
              accessibilityLabel={`${option.label} — ${option.nativeLabel}`}
              testID={`language-option-${option.code}`}
            >
              <Text style={[styles.optionLabel, isActive && styles.optionLabelActive]}>
                {option.nativeLabel}
              </Text>
              {option.code !== option.nativeLabel && option.label !== option.nativeLabel && (
                <Text style={styles.optionSubLabel}>{option.label}</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[styles.continueButton, !selected && styles.continueButtonDisabled]}
        onPress={handleContinue}
        disabled={!selected || isApplying}
        accessibilityRole="button"
        accessibilityLabel="Continue with selected language"
        testID="language-onboarding-continue"
      >
        {isApplying ? (
          <ActivityIndicator color="#fff" accessibilityLabel="Applying language" />
        ) : (
          <Text style={styles.continueButtonText}>Continue / متابعة</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 20,
    color: '#1a1a2e',
    marginBottom: 40,
    textAlign: 'center',
  },
  optionsContainer: {
    width: '100%',
    gap: 16,
    marginBottom: 40,
  },
  option: {
    width: '100%',
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  optionActive: {
    borderColor: '#0078d4',
    backgroundColor: '#e8f3fc',
  },
  optionLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  optionLabelActive: {
    color: '#0078d4',
  },
  optionSubLabel: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  continueButton: {
    width: '100%',
    backgroundColor: '#0078d4',
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  continueButtonDisabled: {
    backgroundColor: '#b0bec5',
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
