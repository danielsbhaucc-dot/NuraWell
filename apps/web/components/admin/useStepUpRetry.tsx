'use client';

import { useEffect, useState } from 'react';
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

/**
 * Bridge for module packages (which can't import app code): a package dispatches
 * `ops:stepup-required` with { detail: { reason, retry } }; this host opens StepUpDialog and calls retry once verified.
 */
export function StepUpEventHost() {
  const [req, setReq] = useState<null | { reason: string; purpose: string; retry: () => void }>(null);
  useEffect(() => {
    const on = (e: Event) => { const d = (e as CustomEvent<{ reason?: string; purpose?: string; retry?: () => void }>).detail; if (d?.retry) setReq({ reason: d.reason ?? 'פעולה רגישה', purpose: d.purpose === 'ops.modules' ? 'ops.modules' : 'ops.sensitive', retry: d.retry }); };
    window.addEventListener('ops:stepup-required', on);
    return () => window.removeEventListener('ops:stepup-required', on);
  }, []);
  return (
    <StepUpDialog open={!!req} purpose={req?.purpose ?? 'ops.sensitive'} reason={req?.reason ?? ''} onClose={() => setReq(null)}
      onVerified={() => { const f = req?.retry; setReq(null); f?.(); }} />
  );
}
