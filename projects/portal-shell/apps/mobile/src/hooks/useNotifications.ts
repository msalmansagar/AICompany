import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ApiRoutes } from '../constants/ApiRoutes';
import type { PortalNotification } from '@portal/types';

interface NotificationsApiResponse {
  data: PortalNotification[];
}

// Poll every 60 seconds — aligns with the portal config refetchInterval default
const POLL_INTERVAL_MS = 60_000;

export const NOTIFICATIONS_QUERY_KEY = ['notifications'] as const;

export function useNotifications() {
  return useQuery<PortalNotification[]>({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: async (): Promise<PortalNotification[]> => {
      const response = await api.get<NotificationsApiResponse>(ApiRoutes.notifications);
      return response.data;
    },
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useUnreadNotificationCount(): number {
  const { data: notifications } = useNotifications();
  if (!notifications) return 0;
  return notifications.filter((n) => !n.isRead).length;
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string): Promise<void> =>
      api.post(ApiRoutes.notificationMarkRead(id), {}),
    onSuccess: (_data, id): void => {
      queryClient.setQueryData<PortalNotification[]>(NOTIFICATIONS_QUERY_KEY, (previous) =>
        previous
          ? previous.map((n) => (n.id === id ? { ...n, isRead: true } : n))
          : previous,
      );
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (): Promise<void> => api.post(ApiRoutes.notificationsMarkAllRead, {}),
    onSuccess: (): void => {
      queryClient.setQueryData<PortalNotification[]>(NOTIFICATIONS_QUERY_KEY, (previous) =>
        previous ? previous.map((n) => ({ ...n, isRead: true })) : previous,
      );
    },
  });
}
