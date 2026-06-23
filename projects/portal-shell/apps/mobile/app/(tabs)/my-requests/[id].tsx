import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { SafeAreaView } from '../../../src/components/ui/SafeAreaView';
import { Header } from '../../../src/components/navigation/Header';
import { StatusBadge } from '../../../src/components/requests/StatusBadge';
import { StatusTimeline } from '../../../src/components/requests/StatusTimeline';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { Skeleton } from '../../../src/components/ui/Skeleton';
import { Colors } from '../../../src/constants/Colors';
import { t } from '../../../src/i18n';
import { useRequestDetail } from '../../../src/hooks/useRequests';
import type { RequestDocument } from '@portal/types';

// ---------------------------------------------------------------------------
// Document list item
// ---------------------------------------------------------------------------

function DocumentRow({ document }: { document: RequestDocument }): React.JSX.Element {
  function openDocument(): void {
    void Linking.openURL(document.url);
  }

  return (
    <Pressable
      onPress={openDocument}
      style={styles.documentRow}
      accessibilityRole="link"
      accessibilityLabel={document.name}
    >
      <Text style={styles.documentName} numberOfLines={1}>
        {document.name}
      </Text>
      <Text style={styles.downloadLabel}>{t('requests.detail.downloadDocument')}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function RequestDetailScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: request, isLoading, isError, refetch } = useRequestDetail(id ?? '');

  if (isLoading) {
    return (
      <SafeAreaView>
        <Header title={t('requests.detail.loading')} showBackButton />
        <View style={styles.skeletonContainer}>
          <Skeleton height={80} style={styles.skeletonBlock} />
          <Skeleton height={20} width="60%" style={styles.skeletonBlock} />
          <Skeleton height={120} style={styles.skeletonBlock} />
          <Skeleton height={80} style={styles.skeletonBlock} />
        </View>
      </SafeAreaView>
    );
  }

  if (isError || !request) {
    return (
      <SafeAreaView>
        <Header title={t('requests.title')} showBackButton />
        <EmptyState
          icon="cloud-offline-outline"
          title={t('requests.detail.error')}
          actionLabel={t('common.retry')}
          onAction={() => void refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView>
      <Header title={request.referenceNumber} showBackButton />

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Status header card */}
        <View style={styles.statusCard}>
          <Text style={styles.serviceTitle}>{request.serviceTitle}</Text>
          <View style={styles.statusRow}>
            <StatusBadge status={request.status} />
            <Text style={styles.refText}>
              {t('requests.referenceNumber', { ref: request.referenceNumber })}
            </Text>
          </View>
          <Text style={styles.dateText}>
            {t('requests.submittedOn', {
              date: new Date(request.submittedOn).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              }),
            })}
          </Text>
        </View>

        {/* Timeline */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('requests.detail.timeline')}</Text>
          {request.timeline.length > 0 ? (
            <StatusTimeline entries={request.timeline} />
          ) : (
            <EmptyState icon="time-outline" title={t('requests.detail.timeline')} />
          )}
        </View>

        {/* Documents */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('requests.detail.documents')}</Text>
          {request.documents.length > 0 ? (
            <View style={styles.documentList}>
              {request.documents.map((doc) => (
                <DocumentRow key={doc.id} document={doc} />
              ))}
            </View>
          ) : (
            <Text style={styles.noDocsText}>{t('requests.detail.noDocuments')}</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  skeletonContainer: {
    padding: 16,
    gap: 14,
  },
  skeletonBlock: {
    borderRadius: 10,
    marginBottom: 0,
  },
  statusCard: {
    backgroundColor: Colors.surface,
    padding: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    marginBottom: 16,
  },
  serviceTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  refText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  dateText: {
    fontSize: 12,
    color: Colors.textDisabled,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  documentList: {
    paddingHorizontal: 16,
  },
  documentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  documentName: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
    marginEnd: 12,
  },
  downloadLabel: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
  },
  noDocsText: {
    fontSize: 14,
    color: Colors.textSecondary,
    paddingHorizontal: 16,
    fontStyle: 'italic',
  },
});
