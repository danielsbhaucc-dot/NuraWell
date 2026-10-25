'use client';

import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { PublicAiPresence } from '@/components/ai/PublicAiPresence';

/**
 * Internal Ops on the main site: admin role + trusted device are enforced server-side on /ops and its APIs
 * (an untrusted device is sent to /device-check). The cross-host handoff to the Ops host is paused for now.
 */
export function BridgeClient() {
  useEffect(() => {
    window.location.replace('/ops');
  }, []);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4" dir="rtl">
      <Loader2 className="h-10 w-10 animate-spin text-secondary-600" aria-hidden />
      <p className="text-ink-soft">רגע…</p>
      <PublicAiPresence compact />
    </div>
  );
}
