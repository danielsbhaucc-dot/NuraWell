'use client';

import { AIChatWidget } from './AIChatWidget';
import { NotificationsInbox } from './NotificationsInbox';

type AIOverlaysClientProps = {
  userId: string;
};

export function AIOverlaysClient({ userId }: AIOverlaysClientProps) {
  return (
    <>
      <NotificationsInbox />
      <AIChatWidget userId={userId} />
    </>
  );
}
