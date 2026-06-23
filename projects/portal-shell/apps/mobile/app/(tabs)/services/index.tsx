import React, { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';

import { SafeAreaView } from '../../../src/components/ui/SafeAreaView';
import { Header } from '../../../src/components/navigation/Header';
import { ServiceCard } from '../../../src/components/services/ServiceCard';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { Skeleton } from '../../../src/components/ui/Skeleton';
import { Colors } from '../../../src/constants/Colors';
import { t, getCurrentLocale } from '../../../src/i18n';
import { useServices } from '../../../src/hooks/useServices';
import type { PortalService } from '@portal/types';

export default function ServicesScreen(): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState('');
  const { data: services, isLoading, isError, refetch } = useServices();

  const isAr = getCurrentLocale() === 'ar';

  const filteredServices = useMemo<PortalService[]>(() => {
    if (!services) return [];
    const lowerQuery = searchQuery.trim().toLowerCase();
    if (!lowerQuery) return services;

    return services.filter((service) => {
      const title = isAr ? service.titleAr : service.title;
      const description = isAr ? service.shortDescriptionAr : service.shortDescription;
      return (
        title.toLowerCase().includes(lowerQuery) ||
        description.toLowerCase().includes(lowerQuery) ||
        service.categoryTag.toLowerCase().includes(lowerQuery)
      );
    });
  }, [services, searchQuery, isAr]);

  function navigateToDetail(code: string): void {
    router.push(`/(tabs)/services/${code}`);
  }

  return (
    <SafeAreaView>
      <Header title={t('services.title')} />

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder={t('services.searchPlaceholder')}
          placeholderTextColor={Colors.textDisabled}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          clearButtonMode="while-editing"
          autoCorrect={false}
          accessibilityLabel={t('services.searchPlaceholder')}
          testID="services-search-input"
        />
      </View>

      {isLoading ? (
        <View style={styles.skeletonContainer}>
          {[1, 2, 3].map((k) => (
            <Skeleton key={k} height={260} style={styles.skeleton} />
          ))}
        </View>
      ) : isError ? (
        <EmptyState
          icon="cloud-offline-outline"
          title={t('errors.network')}
          actionLabel={t('common.retry')}
          onAction={() => void refetch()}
          testID="services-error-state"
        />
      ) : (
        <FlashList
          data={filteredServices}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ServiceCard service={item} onPress={navigateToDetail} />
          )}
          estimatedItemSize={280}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
              title={
                searchQuery
                  ? t('services.emptySearch')
                  : t('services.empty')
              }
              testID="services-empty-state"
            />
          }
          showsVerticalScrollIndicator={false}
          testID="services-list"
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  searchInput: {
    height: 40,
    backgroundColor: Colors.grey20,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  skeletonContainer: {
    padding: 16,
    gap: 16,
  },
  skeleton: {
    borderRadius: 10,
  },
  listContent: {
    paddingTop: 12,
    paddingBottom: 24,
  },
});
