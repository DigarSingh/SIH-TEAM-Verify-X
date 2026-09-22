import { api } from '../api/client';
import type { Announcement, AppNotification, NotificationType, PageMeta, SearchResults } from '../types';

export interface NotificationPage {
  items: AppNotification[];
  meta: PageMeta & { unreadCount: number };
}

export async function listNotifications(params: { page?: number; pageSize?: number; unread?: boolean; type?: NotificationType | '' }): Promise<NotificationPage> {
  const { data, meta } = await api.get<AppNotification[], { unreadCount: number }>('/notifications', {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
    unread: params.unread ? 'true' : undefined,
    type: params.type || undefined,
  });
  return { items: data, meta: meta as NotificationPage['meta'] };
}

export const fetchUnreadCount = async (): Promise<number> => (await api.get<{ unreadCount: number }>('/notifications/unread-count')).data.unreadCount;
export const markNotificationRead = async (id: string) => (await api.patch<AppNotification>(`/notifications/${id}/read`)).data;
export const markAllNotificationsRead = async () => (await api.patch<{ updated: number }>('/notifications/read-all')).data;
export const deleteNotification = async (id: string) => (await api.delete<{ deleted: boolean }>(`/notifications/${id}`)).data;

export const fetchAnnouncements = async () => (await api.get<Announcement[]>('/announcements')).data;

export const searchEverything = async (q: string, limit = 5) => (await api.get<SearchResults>('/search', { q, limit })).data;
