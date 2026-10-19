'use client';

import { Suspense, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PublicAiPresence } from '@/components/ai/PublicAiPresence';

function BridgeInner() {
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/auth/ops-session-ticket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
          credentials: 'include',
        });
        const j = (await res.json()) as { ingestUrl?: string; error?: string; code?: string };
        if (cancelled) return;
        if (j.code === 'device_unverified') {
          window.location.href = '/device-check';
          return;
        }
        if (!res.ok || !j.ingestUrl) {
          setErr(j.error || 'משהו השתבש. נסה להתנתק ולהתחבר מחדש.');
          return;
        }
        window.location.href = j.ingestUrl;
      } catch {
        if (!cancelled) setErr('שגיאת רשת.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (err) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center" dir="rtl">
        <p className="text-red-700">{err}</p>
        <div className="mt-5">
          <PublicAiPresence compact />
        </div>
        <a href="/home" className="mt-4 inline-block text-teal-700 underline">
          חזרה לקורסים
        </a>
      </div>
    );
  }

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4" dir="rtl">
      <Loader2 className="h-10 w-10 animate-spin text-teal-600" aria-hidden />
      <p className="text-slate-700">רגע…</p>
      <PublicAiPresence compact />
    </div>
  );
}

export function BridgeClient() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4" dir="rtl">
          <Loader2 className="h-10 w-10 animate-spin text-teal-600" aria-hidden />
          <PublicAiPresence compact />
        </div>
      }
    >
      <BridgeInner />
    </Suspense>
  );
}
