import React from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { SafeAreaView } from '../../../src/components/ui/SafeAreaView';
import { Header } from '../../../src/components/navigation/Header';
import { ServiceDetail } from '../../../src/components/services/ServiceDetail';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { Skeleton } from '../../../src/components/ui/Skeleton';
import { Colors } from '../../../src/constants/Colors';
import { t, getCurrentLocale } from '../../../src/i18n';
import { useServiceDetail } from '../../../src/hooks/useServices';

export default function ServiceDetailScreen(): React.JSX.Element {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { data: service, isLoading, isError, refetch } = useServiceDetail(code ?? '');

  const isAr = getCurrentLocale() === 'ar';
  const title = service ? (isAr ? service.titleAr : service.title) : '';

  function handleApply(): void {
    if (!service) return;

    // Deep-link to web portal form — construct URL from API base
    const apiBase = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:4001';
    const formUrl = `${apiBase}/portal/services/${service.code}/apply`;

    Linking.openURL(formUrl).catch(() => {
      Alert.alert(t('common.error'), t('errors.network'));
    });
  }

  if (isLoading) {
    return (
      <SafeAreaView>
        <Header title={t('services.detail.loading')} showBackButton />
        <View style={styles.skeletonContainer}>
          <Skeleton height={220} borderRadius={0} />
          <View style={styles.skeletonBody}>
            <Skeleton height={14} width="40%" style={styles.skeletonLine} />
            <Skeleton height={28} style={styles.skeletonLine} />
            <Skeleton height={16} style={styles.skeletonLine} />
            <Skeleton height={16} width="80%" style={styles.skeletonLine} />
            <Skeleton height={16} width="60%" style={styles.skeletonLine} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (isError || !service) {
    return (
      <SafeAreaView>
        <Header title={t('services.title')} showBackButton />
        <EmptyState
          icon="cloud-offline-outline"
          title={t('services.detail.error')}
          actionLabel={t('common.retry')}
          onAction={() => void refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView>
      <Header title={title} showBackButton />
      <ServiceDetail service={service} onApply={handleApply} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  skeletonContainer: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  skeletonBody: {
    padding: 16,
    gap: 10,
  },
  skeletonLine: {
    marginBottom: 0,
  },
});
