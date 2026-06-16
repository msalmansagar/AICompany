import React from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { SafeAreaView } from '../../src/components/ui/SafeAreaView';
import { Header } from '../../src/components/navigation/Header';
import { NotificationBell } from '../../src/components/notifications/NotificationBell';
import { WelcomeBanner } from '../../src/components/dashboard/WelcomeBanner';
import { QuickStats } from '../../src/components/dashboard/QuickStats';
import { RequestCard } from '../../src/components/requests/RequestCard';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { Skeleton } from '../../src/components/ui/Skeleton';
import { Colors } from '../../src/constants/Colors';
import { t, getCurrentLocale } from '../../src/i18n';
import { useCurrentUser } from '../../src/hooks/useAuth';
import { useRequests, useRequestStats } from '../../src/hooks/useRequests';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../src/lib/api';
import { ApiRoutes } from '../../src/constants/ApiRoutes';
import type { CmsSummary, UserRequest } from '@portal/types';

// ---------------------------------------------------------------------------
// Announcement card (CMS)
// ---------------------------------------------------------------------------

interface AnnouncementCardProps {
  announcement: CmsSummary;
}

function AnnouncementCard({ announcement }: AnnouncementCardProps): React.JSX.Element {
  const isAr = getCurrentLocale() === 'ar';
  const title = isAr ? announcement.titleAr : announcement.title;
  const excerpt = isAr ? announcement.excerptAr : announcement.excerpt;

  return (
    <Card style={styles.announcementCard}>
      <Text style={styles.announcementTitle} numberOfLines={2}>
        {title}
      </Text>
      {excerpt ? (
        <Text style={styles.announcementExcerpt} numberOfLines={3}>
          {excerpt}
        </Text>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Announcements hook
// ---------------------------------------------------------------------------

interface CmsApiResponse {
  data: CmsSummary[];
}

function useLatestAnnouncements() {
  return useQuery<CmsSummary[]>({
    queryKey: ['cms', 'announcements'],
    queryFn: async (): Promise<CmsSummary[]> => {
      const response = await api.get<CmsApiResponse>(ApiRoutes.cms('announcement'));
      return response.data.slice(0, 2);
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function DashboardScreen(): React.JSX.Element {
  const { data: user } = useCurrentUser();
  const { stats, isLoading: statsLoading } = useRequestStats();
  const { data: requests, isLoading: requestsLoading } = useRequests();
  const { data: announcements, isLoading: announcementsLoading } = useLatestAnnouncements();

  const recentRequests: UserRequest[] = requests?.slice(0, 3) ?? [];
  const displayName = user?.displayName ?? user?.firstName ?? '';

  return (
    <SafeAreaView>
      <Header
        title={t('navigation.dashboard')}
        rightElement={
          <NotificationBell onPress={() => router.push('/auth/login')} />
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Welcome banner */}
        {displayName ? <WelcomeBanner displayName={displayName} /> : null}

        {/* Quick stats */}
        <View style={styles.statsContainer}>
          <Text style={styles.sectionLabel}>{t('dashboard.quickStats')}</Text>
          <QuickStats stats={stats} isLoading={statsLoading} testID="dashboard-quick-stats" />
        </View>

        {/* Recent requests */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('dashboard.recentRequests')}</Text>
            <Pressable onPress={() => router.push('/(tabs)/my-requests')} accessibilityRole="link">
              <Text style={styles.viewAllLink}>{t('common.viewAll')}</Text>
            </Pressable>
          </View>

          {requestsLoading ? (
            <View style={styles.skeletonList}>
              {[1, 2, 3].map((k) => (
                <Skeleton key={k} height={88} style={styles.skeletonCard} />
              ))}
            </View>
          ) : recentRequests.length > 0 ? (
            recentRequests.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                onPress={(id) => router.push(`/(tabs)/my-requests/${id}`)}
              />
            ))
          ) : (
            <EmptyState
              icon="document-outline"
              title={t('dashboard.noRecentRequests')}
              testID="dashboard-no-requests"
            />
          )}
        </View>

        {/* Announcements */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('dashboard.latestAnnouncements')}</Text>

          {announcementsLoading ? (
            <View style={styles.skeletonList}>
              {[1, 2].map((k) => (
                <Skeleton key={k} height={80} style={styles.skeletonCard} />
              ))}
            </View>
          ) : (announcements?.length ?? 0) > 0 ? (
            announcements!.map((a) => <AnnouncementCard key={a.id} announcement={a} />)
          ) : (
            <Text style={styles.emptyText}>{t('dashboard.noAnnouncements')}</Text>
          )}
        </View>

        {/* Quick actions */}
        <View style={styles.quickActions}>
          <Button
            title={t('dashboard.applyForService')}
            onPress={() => router.push('/(tabs)/services')}
            variant="primary"
            style={styles.actionButton}
          />
          <Button
            title={t('dashboard.viewAllRequests')}
            onPress={() => router.push('/(tabs)/my-requests')}
            variant="secondary"
            style={styles.actionButton}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  statsContainer: {
    paddingTop: 20,
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  section: {
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  viewAllLink: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '500',
  },
  skeletonList: {
    paddingHorizontal: 16,
    gap: 12,
  },
  skeletonCard: {
    borderRadius: 10,
  },
  announcementCard: {
    marginHorizontal: 16,
    marginBottom: 10,
  },
  announcementTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  announcementExcerpt: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    paddingHorizontal: 16,
    fontStyle: 'italic',
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    marginTop: 28,
  },
  actionButton: {
    flex: 1,
  },
});
