'use client';

import { NotificationsBellButton } from '@/components/notifications/NotificationsBellButton';

export function ChallengeNotificationsBell() {
  return (
    <div className="fixed end-4 top-4 z-40 safe-area-top">
      <NotificationsBellButton variant="challenge" />
    </div>
  );
}
