'use client';

import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';

/**
 * מציג כפתור "יציאה מדמו" כשהמשתמש המחובר נמצא במצב דמו מנהל.
 * מתאים לשימוש בדפים שאינם מקבלים את is_demo כ-prop ישיר (חלון אכילה, ריאיון, סיום).
 */
export function DemoExitBanner() {
  const [isDemo, setIsDemo] = useState<boolean | null>(null);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    fetch('/api/v1/challenge/state', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { is_demo?: boolean }) => setIsDemo(d.is_demo ?? false))
      .catch(() => setIsDemo(false));
  }, []);

  if (!isDemo) return null;

  const exit = async () => {
    setExiting(true);
    await fetch('/api/v1/admin/challenge/demo', { method: 'DELETE', credentials: 'include' });
    window.location.href = '/home';
  };

  return (
    <div className="mb-4 flex items-center justify-between gap-2 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3">
      <span className="text-sm text-amber-100">מצב דמו</span>
      <button
        type="button"
        onClick={exit}
        disabled={exiting}
        className="inline-flex items-center gap-1 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
      >
        <LogOut className="h-3.5 w-3.5" />
        יציאה
      </button>
    </div>
  );
}
