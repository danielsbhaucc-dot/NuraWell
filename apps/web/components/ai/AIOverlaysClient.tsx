'use client';

import { AIChatWidget } from './AIChatWidget';
import { AlmogReplyModal } from '../notifications/AlmogReplyModal';

type AIOverlaysClientProps = {
  userId: string;
};

export function AIOverlaysClient({ userId }: AIOverlaysClientProps) {
  return (
    <>
      <AIChatWidget userId={userId} />
      <AlmogReplyModal />
    </>
  );
}
