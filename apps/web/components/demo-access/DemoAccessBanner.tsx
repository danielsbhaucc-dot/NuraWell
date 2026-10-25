'use client';

import { useEffect, useState } from 'react';
import { FlaskConical, LogOut } from 'lucide-react';

type Status = {
  active: boolean;
  guest_name?: string | null;
  reason?: string;
  expires_at?: string;
};

export function DemoAccessBanner() {
  const [status, setStatus] = useState<Status | null>(null);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/demo-access/status', { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) return;
        const data = (await r.json()) as Status;
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) setStatus({ active: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status?.active) return null;

  const ends = status.expires_at
    ? new Date(status.expires_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
    : null;

  const endSession = async () => {
    setEnding(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/demo-access/end', {
        method: 'POST',
        credentials: 'include',
      });
      const data = (await res.json()) as { ok?: boolean; redirect?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? 'לא ניתן לסיים את הגישה');
        setEnding(false);
        return;
      }
      window.location.href = data.redirect || '/';
    } catch {
      setError('שגיאת רשת');
      setEnding(false);
    }
  };

  return (
    <div className="sticky top-16 z-30 px-3 pt-2 sm:px-4">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 rounded-2xl border border-accent-300/50 bg-linear-to-l from-accent-50 via-secondary-50 to-primary-50 px-3 py-2.5 shadow-xs">
        <div className="min-w-0 flex items-start gap-2">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-secondary-700" />
          <div className="min-w-0">
            <p className="text-xs font-black text-secondary-900">
              מצב משתמש דמו
              {status.guest_name ? ` · ${status.guest_name}` : ''}
            </p>
            <p className="truncate text-[11px] text-secondary-800/80">
              {status.reason ? `למטרה: ${status.reason}` : 'גישה זמנית למערכת'}
              {ends ? ` · עד ${ends}` : ''}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={endSession}
          disabled={ending}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-secondary-800 px-3 py-1.5 text-xs font-bold text-on-dark disabled:opacity-60"
        >
          <LogOut className="h-3.5 w-3.5" />
          {ending ? 'מסיים…' : 'סיים גישה'}
        </button>
      </div>
      {error ? <p className="mx-auto mt-1 max-w-3xl px-1 text-xs text-coral-600">{error}</p> : null}
    </div>
  );
}
