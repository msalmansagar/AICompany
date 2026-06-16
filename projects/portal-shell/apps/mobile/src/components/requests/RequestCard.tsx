import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { UserRequest } from '@portal/types';
import { Card } from '../ui/Card';
import { StatusBadge } from './StatusBadge';
import { Colors } from '../../constants/Colors';
import { t } from '../../i18n';

interface RequestCardProps {
  request: UserRequest;
  onPress: (id: string) => void;
  testID?: string;
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function RequestCard({ request, onPress, testID }: RequestCardProps): React.JSX.Element {
  return (
    <Card onPress={() => onPress(request.id)} testID={testID} style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.serviceTitle} numberOfLines={1} accessibilityRole="text">
          {request.serviceTitle}
        </Text>
        <StatusBadge status={request.status} />
      </View>
      <Text style={styles.refNumber}>
        {t('requests.referenceNumber', { ref: request.referenceNumber })}
      </Text>
      <Text style={styles.submittedDate}>
        {t('requests.submittedOn', { date: formatDate(request.submittedOn) })}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  serviceTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  refNumber: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  submittedDate: {
    fontSize: 12,
    color: Colors.textDisabled,
  },
});
