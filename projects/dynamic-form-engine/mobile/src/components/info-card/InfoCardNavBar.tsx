import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  isFirstScreen: boolean;
  isLastScreen: boolean;
  allowSkip: boolean;
  backLabel: string;
  continueLabel: string;
  startLabel: string;
  skipLabel: string;
  onBack: () => void;
  onContinue: () => void;
  onSkip: () => void;
}

export function InfoCardNavBar({
  isFirstScreen,
  isLastScreen,
  allowSkip,
  backLabel,
  continueLabel,
  startLabel,
  skipLabel,
  onBack,
  onContinue,
  onSkip,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.leftSlot}>
        {!isFirstScreen && (
          <Pressable
            style={styles.backButton}
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={backLabel}
          >
            <Text style={styles.backText}>{backLabel}</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.rightSlot}>
        {allowSkip && (
          <Pressable
            style={styles.skipButton}
            onPress={onSkip}
            accessibilityRole="button"
            accessibilityLabel={skipLabel}
          >
            <Text style={styles.skipText}>{skipLabel}</Text>
          </Pressable>
        )}
        <Pressable
          style={styles.primaryButton}
          onPress={onContinue}
          accessibilityRole="button"
          accessibilityLabel={isLastScreen ? startLabel : continueLabel}
        >
          <Text style={styles.primaryText}>
            {isLastScreen ? startLabel : continueLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  leftSlot: { minWidth: 80 },
  rightSlot: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  backText: { fontSize: 14, color: '#555', fontWeight: '500' },
  skipButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  skipText: { fontSize: 14, color: '#888', fontWeight: '500' },
  primaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#0078d4',
  },
  primaryText: { fontSize: 14, color: '#fff', fontWeight: '600' },
});
