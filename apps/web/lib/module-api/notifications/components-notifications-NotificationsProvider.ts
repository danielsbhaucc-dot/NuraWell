// Public API of the "notifications" module (re-export only; other modules import this, not the internal file).
export { NotificationsProvider, useNotificationsDrawer } from '@/components/notifications/NotificationsProvider';
export type { NotificationChannel, NotificationItem } from '@/components/notifications/NotificationsProvider';
