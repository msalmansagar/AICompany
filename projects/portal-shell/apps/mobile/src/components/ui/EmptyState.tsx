import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

export function EmptyState({
  icon = 'document-outline',
  title,
  body,
  actionLabel,
  onAction,
  testID,
}: EmptyStateProps): React.JSX.Element {
  return (
    <View testID={testID} style={styles.container} accessibilityRole="text">
      <Ionicons name={icon} size={52} color={Colors.grey70} style={styles.icon} />
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <Button
          title={actionLabel}
          onPress={onAction}
          variant="secondary"
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  icon: {
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  action: {
    marginTop: 20,
    alignSelf: 'center',
  },
});
