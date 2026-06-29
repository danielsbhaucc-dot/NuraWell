'use client';

import type { User } from '@supabase/supabase-js';
import { NotificationsProvider } from '@/components/notifications/NotificationsProvider';
import { ChallengeNotificationsBell } from './ChallengeNotificationsBell';

type Props = {
  user: User;
  children: React.ReactNode;
};

export function ChallengeShell({ user, children }: Props) {
  return (
    <NotificationsProvider userId={user.id} user={user}>
      <ChallengeNotificationsBell />
      {children}
    </NotificationsProvider>
  );
}
