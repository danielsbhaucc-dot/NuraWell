'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

function BridgeInner() {
  const sp = useSearchParams();
  const next = sp.get('next') || '';
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!next) {
      setErr('חסר קישור לפאנל Ops.');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/auth/ops-session-ticket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ next }),
          credentials: 'include',
        });
        const j = (await res.json()) as { ingestUrl?: string; error?: string };
        if (cancelled) return;
        if (!res.ok || !j.ingestUrl) {
          setErr(j.error || 'לא ניתן ליצור גישה לפאנל. נסה להתנתק ולהתחבר מחדש.');
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
  }, [next]);

  if (err) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center" dir="rtl">
        <p className="text-red-700">{err}</p>
        <a href="/courses" className="mt-4 inline-block text-teal-700 underline">
          חזרה לקורסים
        </a>
      </div>
    );
  }

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4" dir="rtl">
      <Loader2 className="h-10 w-10 animate-spin text-teal-600" aria-hidden />
      <p className="text-slate-700">מעביר אותך לפאנל הניהול…</p>
    </div>
  );
}

export default function BridgeToOpsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center" dir="rtl">
          <Loader2 className="h-10 w-10 animate-spin text-teal-600" aria-hidden />
        </div>
      }
    >
      <BridgeInner />
    </Suspense>
  );
}
