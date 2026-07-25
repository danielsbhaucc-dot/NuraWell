'use client';

import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';

/**
 * Shows an "Exit Demo" button when the logged-in admin user is in demo mode.
 * Suitable for pages that don't receive is_demo as a direct prop
 * (eating window, interview, completion).
 */
export function DemoExitBanner() {
  const [isDemo, setIsDemo] = useState<boolean | null>(null);
  const [exiting, setExiting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v1/challenge/state', { credentials: 'include' })
      .then((r) => {
        if (!r.ok) return;
        return r.json() as Promise<{ is_demo?: boolean }>;
      })
      .then((d) => setIsDemo(d?.is_demo ?? false))
      .catch(() => setIsDemo(false));
  }, []);

  if (!isDemo) return null;

  const exit = async () => {
    setExiting(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/admin/challenge/demo', { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('server error');
      window.location.href = '/home';
    } catch {
      setError('שגיאה ביציאה מדמו — נסה שוב');
      setExiting(false);
    }
  };

  return (
    <div className="mb-4 space-y-1">
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3">
        <span className="text-sm text-amber-100">מצב דמו</span>
        <button
          type="button"
          onClick={exit}
          disabled={exiting}
          className="inline-flex items-center gap-1 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
        >
          <LogOut className="h-3.5 w-3.5" />
          {exiting ? 'יוצא...' : 'יציאה'}
        </button>
      </div>
      {error ? <p className="text-xs text-red-400 px-1">{error}</p> : null}
    </div>
  );
}
