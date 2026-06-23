import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { Colors } from '../../constants/Colors';

interface InputProps extends TextInputProps {
  label: string;
  error?: string;
  testID?: string;
}

export function Input({ label, error, testID, style, ...rest }: InputProps): React.JSX.Element {
  const [isFocused, setIsFocused] = useState(false);

  const borderColor = error
    ? Colors.error
    : isFocused
      ? Colors.primary
      : Colors.borderStrong;

  return (
    <View style={styles.container}>
      <Text style={styles.label} accessibilityLabel={label}>
        {label}
      </Text>
      <TextInput
        {...rest}
        testID={testID}
        style={[styles.input, { borderColor }, style]}
        onFocus={(e) => {
          setIsFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          rest.onBlur?.(e);
        }}
        accessibilityLabel={label}
        accessibilityHint={error}
        accessibilityInvalid={Boolean(error)}
        placeholderTextColor={Colors.textDisabled}
      />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  input: {
    height: 44,
    borderWidth: 1.5,
    borderRadius: 6,
    paddingHorizontal: 12,
    fontSize: 15,
    color: Colors.textPrimary,
    backgroundColor: Colors.white,
  },
  error: {
    fontSize: 12,
    color: Colors.error,
    marginTop: 4,
    marginStart: 2,
  },
});
