'use client';

import { useState } from 'react';
import { StepUpDialog } from '@/components/admin/StepUpDialog';

/** If a response is a step-up 403, opens StepUpDialog and re-runs `retry` once verified. */
export function useStepUpRetry(reason: string) {
  const [pending, setPending] = useState<null | (() => void)>(null);
  const needsStepUp = async (r: Response, retry: () => void) => {
    if (r.status !== 403) return false;
    const j = (await r.clone().json().catch(() => null)) as { stepUp?: boolean } | null;
    if (!j?.stepUp) return false;
    setPending(() => retry);
    return true;
  };
  const dialog = (
    <StepUpDialog open={!!pending} purpose="ops.sensitive" reason={reason} onClose={() => setPending(null)}
      onVerified={() => { const f = pending; setPending(null); f?.(); }} />
  );
  return { needsStepUp, dialog };
}
