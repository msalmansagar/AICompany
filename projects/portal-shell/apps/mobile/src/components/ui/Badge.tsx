import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/Colors';

type BadgeVariant = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  testID?: string;
}

const VARIANT_COLORS: Record<BadgeVariant, { background: string; text: string }> = {
  primary: { background: Colors.primaryLight, text: Colors.primaryDark },
  success: { background: Colors.successLight, text: Colors.success },
  warning: { background: Colors.warningLight, text: Colors.warning },
  error: { background: Colors.errorLight, text: Colors.error },
  info: { background: Colors.infoLight, text: Colors.info },
  neutral: { background: Colors.grey30, text: Colors.grey110 },
};

export function Badge({ label, variant = 'neutral', testID }: BadgeProps): React.JSX.Element {
  const colors = VARIANT_COLORS[variant];

  return (
    <View
      testID={testID}
      style={[styles.badge, { backgroundColor: colors.background }]}
      accessibilityRole="text"
    >
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 20,
    paddingVertical: 3,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
});
