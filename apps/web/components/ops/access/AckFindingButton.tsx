'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui';

/** Marks one access-audit finding as reviewed (server records who + when and logs it). */
export function AckFindingButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const ack = async () => {
    setBusy(true); setFailed(false);
    const r = await fetch('/api/v1/ops/access-audit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'ack', id }) }).catch(() => null);
    setBusy(false);
    if (r && (r.ok || r.status === 409)) router.refresh(); else setFailed(true);
  };
  return <Button size="sm" variant="secondary" loading={busy} onClick={() => void ack()}>{failed ? 'נסו שוב' : 'סימון כנבדק'}</Button>;
}
