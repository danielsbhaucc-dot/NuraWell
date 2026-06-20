'use client';

import { Accessibility } from 'lucide-react';
import { useAccessibility } from '@/components/a11y/AccessibilityProvider';

export function AccessibilityRestoreWidget() {
  const { preferences, showWidget } = useAccessibility();

  if (!preferences.widgetHidden) {
    return (
      <p className="text-sm text-slate-700">
        תפריט הנגישות מוצג כרגע בפינה התחתונה של המסך (כפתור עם סמל נגישות).
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-teal-200/70 bg-teal-50/80 p-4">
      <p className="text-sm text-slate-800">
        הסתרת את תפריט הנגישות. ניתן להחזיר אותו בכל עת:
      </p>
      <button
        type="button"
        onClick={showWidget}
        className="mt-3 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-800"
      >
        <Accessibility className="h-4 w-4" aria-hidden />
        הצג תפריט נגישות
      </button>
    </div>
  );
}
