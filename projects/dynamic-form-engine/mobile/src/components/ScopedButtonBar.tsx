// ScopedButtonBar (mobile) — DFE-BTN-001 renders tab/section scoped buttons (Theme A)
// in the React Native renderer. Presentational: the parent supplies the dispatch via
// onActivate. Renders nothing when the placement has no visible buttons, so existing
// button-less forms are unchanged. Confirmation uses a native Alert.

import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ScopedButton } from '@qdb/shared';

interface Props {
  buttons?: ScopedButton[];
  disabled?: boolean;
  onActivate: (button: ScopedButton) => void;
}

export function ScopedButtonBar({ buttons, disabled = false, onActivate }: Props) {
  const visible = (buttons ?? [])
    .filter((button) => button.isVisible && button.isActive)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  if (visible.length === 0) return null;

  return (
    <View style={styles.bar}>
      {visible.map((button) => (
        <Pressable
          key={button.id}
          style={[button.isPrimary ? styles.primary : styles.secondary, disabled && styles.disabled]}
          disabled={disabled}
          onPress={() => handlePress(button, onActivate)}
          accessibilityRole="button"
          accessibilityLabel={button.label}
          accessibilityState={{ disabled }}
        >
          <Text style={button.isPrimary ? styles.primaryText : styles.secondaryText}>{button.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function handlePress(button: ScopedButton, onActivate: (button: ScopedButton) => void): void {
  if (button.confirmationRequired) {
    Alert.alert(button.label, button.confirmationMessage ?? 'Are you sure you want to continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => onActivate(button) },
    ]);
    return;
  }
  onActivate(button);
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  primary: { flex: 1, backgroundColor: '#0078d4', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondary: { borderWidth: 1, borderColor: '#0078d4', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 14, alignItems: 'center' },
  secondaryText: { color: '#0078d4', fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
