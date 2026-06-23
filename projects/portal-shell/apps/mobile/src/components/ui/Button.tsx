import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
} from 'react-native';
import { Colors } from '../../constants/Colors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  isLoading?: boolean;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  style?: ViewStyle;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Button({
  title,
  onPress,
  variant = 'primary',
  isLoading = false,
  disabled = false,
  testID,
  accessibilityLabel,
  style,
}: ButtonProps): React.JSX.Element {
  const isDisabled = disabled || isLoading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      testID={testID}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: isLoading }}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator
          accessibilityRole="progressbar"
          color={variant === 'primary' || variant === 'danger' ? Colors.white : Colors.primary}
          size="small"
        />
      ) : (
        <Text style={[styles.label, styles[`${variant}Label`]]}>{title}</Text>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  base: {
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44, // Minimum touch target per accessibility guidelines
  },
  primary: {
    backgroundColor: Colors.primary,
  },
  secondary: {
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  danger: {
    backgroundColor: Colors.error,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.8,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  primaryLabel: {
    color: Colors.white,
  },
  secondaryLabel: {
    color: Colors.primary,
  },
  ghostLabel: {
    color: Colors.primary,
  },
  dangerLabel: {
    color: Colors.white,
  },
});
