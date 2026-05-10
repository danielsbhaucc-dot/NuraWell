'use client';

import { AIChatWidget } from './AIChatWidget';

type AIOverlaysClientProps = {
  userId: string;
};

export function AIOverlaysClient({ userId }: AIOverlaysClientProps) {
  return <AIChatWidget userId={userId} />;
}
