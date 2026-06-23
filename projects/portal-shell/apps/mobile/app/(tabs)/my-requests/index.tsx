import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';

import { SafeAreaView } from '../../../src/components/ui/SafeAreaView';
import { Header } from '../../../src/components/navigation/Header';
import { RequestCard } from '../../../src/components/requests/RequestCard';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { Skeleton } from '../../../src/components/ui/Skeleton';
import { Colors } from '../../../src/constants/Colors';
import { t } from '../../../src/i18n';
import { useRequests } from '../../../src/hooks/useRequests';
import type { RequestStatus, UserRequest } from '@portal/types';

// ---------------------------------------------------------------------------
// Filter chip configuration
// ---------------------------------------------------------------------------

type FilterOption = 'all' | RequestStatus;

interface FilterChipConfig {
  key: FilterOption;
  labelKey: string;
}

const FILTER_CHIPS: FilterChipConfig[] = [
  { key: 'all', labelKey: 'requests.filterAll' },
  { key: 'submitted', labelKey: 'requests.filterSubmitted' },
  { key: 'under-review', labelKey: 'requests.filterUnderReview' },
  { key: 'approved', labelKey: 'requests.filterApproved' },
  { key: 'rejected', labelKey: 'requests.filterRejected' },
  { key: 'pending-docs', labelKey: 'requests.filterPendingDocs' },
];

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function MyRequestsScreen(): React.JSX.Element {
  const [activeFilter, setActiveFilter] = useState<FilterOption>('all');
  const { data: requests, isLoading, isError, refetch } = useRequests();

  const filteredRequests = useMemo<UserRequest[]>(() => {
    if (!requests) return [];
    if (activeFilter === 'all') return requests;
    return requests.filter((r) => r.status === activeFilter);
  }, [requests, activeFilter]);

  function navigateToDetail(id: string): void {
    router.push(`/(tabs)/my-requests/${id}`);
  }

  return (
    <SafeAreaView>
      <Header title={t('requests.title')} />

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipContent}
      >
        {FILTER_CHIPS.map((chip) => {
          const isActive = chip.key === activeFilter;
          return (
            <Pressable
              key={chip.key}
              onPress={() => setActiveFilter(chip.key)}
              style={[styles.chip, isActive && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              testID={`filter-chip-${chip.key}`}
            >
              <Text style={[styles.chipLabel, isActive && styles.chipLabelActive]}>
                {t(chip.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {isLoading ? (
        <View style={styles.skeletonContainer}>
          {[1, 2, 3, 4].map((k) => (
            <Skeleton key={k} height={90} style={styles.skeletonCard} />
          ))}
        </View>
      ) : isError ? (
        <EmptyState
          icon="cloud-offline-outline"
          title={t('errors.network')}
          actionLabel={t('common.retry')}
          onAction={() => void refetch()}
          testID="requests-error-state"
        />
      ) : (
        <FlashList
          data={filteredRequests}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <RequestCard request={item} onPress={navigateToDetail} />
          )}
          estimatedItemSize={108}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <EmptyState
              icon="document-outline"
              title={t('requests.empty')}
              testID="requests-empty-state"
            />
          }
          showsVerticalScrollIndicator={false}
          testID="requests-list"
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  chipScroll: {
    flexGrow: 0,
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  chipContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  chip: {
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: Colors.grey20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  chipLabelActive: {
    color: Colors.white,
  },
  skeletonContainer: {
    padding: 16,
    gap: 12,
  },
  skeletonCard: {
    borderRadius: 10,
  },
  listContent: {
    paddingTop: 12,
    paddingBottom: 24,
  },
});
