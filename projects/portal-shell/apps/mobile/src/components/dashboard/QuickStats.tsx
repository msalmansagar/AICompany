import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/Colors';
import { t } from '../../i18n';
import type { RequestStats } from '../../hooks/useRequests';
import { Skeleton } from '../ui/Skeleton';

interface QuickStatsProps {
  stats: RequestStats | null;
  isLoading: boolean;
  testID?: string;
}

interface StatCardProps {
  label: string;
  count: number;
  color: string;
}

function StatCard({ label, count, color }: StatCardProps): React.JSX.Element {
  return (
    <View style={styles.statCard} accessibilityRole="text">
      <Text style={[styles.statCount, { color }]}>{count}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function QuickStats({ stats, isLoading, testID }: QuickStatsProps): React.JSX.Element {
  if (isLoading || !stats) {
    return (
      <View testID={testID} style={styles.container}>
        {[1, 2, 3].map((key) => (
          <View key={key} style={styles.statCard}>
            <Skeleton height={32} width={48} style={styles.skeletonCount} />
            <Skeleton height={12} width={80} style={styles.skeletonLabel} />
          </View>
        ))}
      </View>
    );
  }

  return (
    <View testID={testID} style={styles.container}>
      <StatCard
        label={t('dashboard.submitted')}
        count={stats.submitted}
        color={Colors.statusSubmitted}
      />
      <View style={styles.divider} />
      <StatCard
        label={t('dashboard.underReview')}
        count={stats.underReview}
        color={Colors.statusUnderReview}
      />
      <View style={styles.divider} />
      <StatCard
        label={t('dashboard.approved')}
        count={stats.approved}
        color={Colors.statusApproved}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginTop: -16,
    borderRadius: 10,
    paddingVertical: 16,
    // Card shadow
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statCount: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  divider: {
    width: 1,
    height: '60%',
    backgroundColor: Colors.border,
    alignSelf: 'center',
  },
  skeletonCount: {
    marginBottom: 6,
  },
  skeletonLabel: {
    marginBottom: 0,
  },
});
