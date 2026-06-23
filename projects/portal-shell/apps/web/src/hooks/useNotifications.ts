'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { PortalNotification } from '@portal/types';
import { usePortalConfig } from '../contexts/PortalConfigContext';

const NOTIFICATIONS_QUERY_KEY = ['notifications'] as const;
const UNREAD_COUNT_QUERY_KEY = ['notifications', 'unread-count'] as const;

async function fetchNotifications(limit: number): Promise<PortalNotification[]> {
  const response = await fetch(`/api/notifications?limit=${limit}`);
  if (!response.ok) throw new Error('Failed to fetch notifications');
  const data = (await response.json()) as { items: PortalNotification[] };
  return data.items;
}

async function fetchUnreadCount(): Promise<number> {
  const response = await fetch('/api/notifications/unread-count');
  if (!response.ok) return 0;
  const data = (await response.json()) as { count: number };
  return data.count;
}

async function markAsRead(id: string): Promise<void> {
  const response = await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
  if (!response.ok) throw new Error('Failed to mark notification as read');
}

async function markAllAsRead(): Promise<void> {
  const response = await fetch('/api/notifications/mark-all-read', { method: 'POST' });
  if (!response.ok) throw new Error('Failed to mark all notifications as read');
}

/**
 * Returns the list of notifications, polled at the interval defined in portal config.
 */
export function useNotifications(limit = 50) {
  const { notificationPollIntervalSeconds } = usePortalConfig();

  return useQuery({
    queryKey: [...NOTIFICATIONS_QUERY_KEY, limit],
    queryFn: () => fetchNotifications(limit),
    refetchInterval: notificationPollIntervalSeconds * 1000,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
}

/**
 * Returns the unread notification count, polled at the interval from portal config.
 */
export function useUnreadNotificationCount() {
  const { notificationPollIntervalSeconds } = usePortalConfig();

  return useQuery({
    queryKey: UNREAD_COUNT_QUERY_KEY,
    queryFn: fetchUnreadCount,
    refetchInterval: notificationPollIntervalSeconds * 1000,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
}

/**
 * Returns a mutation for marking a single notification as read.
 * Invalidates the notifications and unread-count queries on success.
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markAsRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: UNREAD_COUNT_QUERY_KEY });
    },
  });
}

/**
 * Returns a mutation for marking all notifications as read.
 * Invalidates the notifications and unread-count queries on success.
 */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markAllAsRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: UNREAD_COUNT_QUERY_KEY });
    },
  });
}
