'use client';

import { ChevronLeft, ListChecks } from 'lucide-react';

/**
 * Home greeting — 3 structural options for owner review (2026-10-27).
 * Preview with ?gb=1|2|3 (persisted). All three render; CSS shows one (see globals.css .gbv-*).
 * TEMPORARY: delete the two unused options and the ?gb switch once the owner picks.
 */
type Badge = { pending: number; done: number; accepted: number; dueToday?: number } | null;

function summary(b: Badge) {
  if (!b || b.accepted === 0) return { pill: 'המסע שלך מחכה', line: 'עוד אין משימות להיום. בלחיצה ממשיכים במסע.', done: 0, total: 0 };
  const total = b.dueToday || b.accepted;
  if (b.pending === 0) return { pill: `סגרת הכל · ${b.done}/${total}`, line: 'כל המשימות של היום הושלמו.', done: b.done, total };
  return {
    pill: b.pending === 1 ? 'משימה אחת להיום' : `${b.pending} משימות להיום`,
    line: `${b.done} מתוך ${total} הושלמו היום`,
    done: b.done,
    total,
  };
}

function Ring({ done, total }: { done: number; total: number }) {
  const r = 22, c = 2 * Math.PI * r, pct = total ? done / total : 0;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden className="shrink-0">
      <circle cx="28" cy="28" r={r} fill="none" stroke="var(--gb-ring-track)" strokeWidth="6" />
      <circle cx="28" cy="28" r={r} fill="none" stroke="var(--gb-ring)" strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 28 28)" />
      <text x="28" y="33" textAnchor="middle" fontSize="14" fontWeight="800" fill="var(--gb-ink)">{total ? `${done}/${total}` : '0'}</text>
    </svg>
  );
}

export function GreetingOptions({ title, occasion, badge, onOpen }: { title: string; occasion?: string | null; badge: Badge; onOpen?: () => void }) {
  const s = summary(badge);
  return (
    <div className="mb-3" dir="rtl">
      {/* 1 — iOS large title straight on the hero band + a small solid tasks pill */}
      <div className="gbv gbv-1">
        <h2 className="gb1-title">{title}</h2>
        {occasion ? <p className="gb1-sub">{occasion}</p> : null}
        {// design-lint-allow: temporary owner-preview option (delete after pick)
        }<button type="button" onClick={onOpen} className="gb1-pill" aria-label="פתח רשימת משימות היום">
          <ListChecks className="size-4" aria-hidden />
          <span>{s.pill}</span>
          <ChevronLeft className="size-4 opacity-80" aria-hidden />
        </button>
      </div>

      {/* 2 — clean solid card with a progress ring */}
      {// design-lint-allow: temporary owner-preview option (delete after pick)
        }<button type="button" onClick={onOpen} className="gbv gbv-2 gb2-card" aria-label="פתח רשימת משימות היום">
        <Ring done={s.done} total={s.total} />
        <span className="min-w-0 flex-1 text-start">
          <span className="gb2-title">{title}</span>
          <span className="gb2-line">{occasion || s.line}</span>
          {occasion ? <span className="gb2-line">{s.line}</span> : null}
        </span>
        <ChevronLeft className="size-5 gb2-chev" aria-hidden />
      </button>

      {/* 3 — two-tier card: greeting on top, a tasks row with a count tile below a divider */}
      <div className="gbv gbv-3 gb3-card">
        <div className="gb3-head">
          <p className="gb3-title">{title}</p>
          {occasion ? <p className="gb3-sub">{occasion}</p> : null}
        </div>
        {// design-lint-allow: temporary owner-preview option (delete after pick)
        }<button type="button" onClick={onOpen} className="gb3-row" aria-label="פתח רשימת משימות היום">
          <span className="gb3-tile">{s.total ? s.total - s.done : 0}</span>
          <span className="min-w-0 flex-1 text-start">
            <span className="gb3-row-title">{s.pill}</span>
            <span className="gb3-row-line">{s.line}</span>
          </span>
          <ChevronLeft className="size-5 gb3-chev" aria-hidden />
        </button>
      </div>
    </div>
  );
}
