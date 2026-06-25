'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronLeft, ChevronRight, CircleHelp } from 'lucide-react';

import { normalizeFrictionCategory } from '../../lib/ai/almog-commitments/friction';
import type { SosMemorySnippet, SosRecentEvent } from '../../lib/ai/guardian/sos-memory';
import { filterRelevantSosEvents } from '../../lib/ai/guardian/sos-ease-shared';
import { genderCopy } from '../../lib/onboarding/gender-copy';
import type { OnboardingGender } from '../../lib/onboarding/types';
import { formatHebrewRelative } from '../../lib/time/hebrew-relative';
import { MomentsHeroAvatar } from '../journey/AlmogPresence';

const HEBREW_HEAD: CSSProperties = {
  fontFamily: 'Rubik, Heebo, Arial, sans-serif',
};

const HEADER_GRADIENT =
  'linear-gradient(155deg, #034d3a 0%, #059669 45%, #10b981 85%)';

/** טקסטים בהירים על הירוק — לא לבן חד */
const HEADER_TEXT = {
  greeting: '#d1fae5',
  title: '#ecfdf5',
  body: '#a7f3d0',
  accent: '#ccfbf1',
} as const;

const MEMORY_PAGE_SIZE = 5;
const FAILED_PAGE_SIZE = 5;
const EVENT_DAYS_PAGE_SIZE = 4;
const EVENTS_PER_DAY_LIMIT = 8;

const TRIGGER_HUMAN: Record<string, string> = {
  emotional: 'הרגשת עמוס או לחוץ',
  motivational: 'לא היה לך כוח או חשק',
  physiological: 'חשק, רעב או עייפות',
  logistical: 'הסביבה לא עזרה',
  cognitive: 'קשה להתמקד',
  social: 'לחץ מסביב',
  knowledge: 'לא היה ברור מה לעשות',
};

const DIVIDER_COLORS = [
  ['#10b981', '#34d399'],
  ['#0d9488', '#2dd4bf'],
  ['#f59e0b', '#fbbf24'],
  ['#0ea5e9', '#38bdf8'],
] as const;

const MEMORY_CARD_STYLES = [
  'border-violet-200/60 bg-gradient-to-br from-violet-50/95 to-white',
  'border-sky-200/60 bg-gradient-to-br from-sky-50/95 to-white',
  'border-amber-200/60 bg-gradient-to-br from-amber-50/95 to-white',
] as const;

const EVENT_CARD_STYLES = [
  'border-violet-200/55 bg-gradient-to-br from-violet-50/90 to-indigo-50/40',
  'border-sky-200/55 bg-gradient-to-br from-sky-50/90 to-cyan-50/40',
  'border-rose-200/55 bg-gradient-to-br from-rose-50/90 to-pink-50/40',
  'border-amber-200/55 bg-gradient-to-br from-amber-50/90 to-orange-50/40',
] as const;

function whenYouPress(gender: OnboardingGender | ''): string {
  if (gender === 'male') return 'שתלחץ';
  if (gender === 'female') return 'שתלחצי';
  return 'שתלחץ/י';
}

function formatDayKey(iso: string): string {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(iso));
}

type OutcomeBadge = {
  label: string;
  hint?: string;
  bg: string;
  text: string;
  border: string;
};

function outcomeBadge(outcome: string, gender: OnboardingGender | ''): OutcomeBadge {
  const pressHint = whenYouPress(gender);

  if (outcome === 'passed') {
    return {
      label: 'עזר לך',
      bg: 'linear-gradient(135deg, #d1fae5, #a7f3d0)',
      text: '#065f46',
      border: 'rgba(16,185,129,0.35)',
    };
  }
  if (outcome === 'fell') {
    return {
      label: 'עדיין היה קשה',
      bg: 'linear-gradient(135deg, #fef3c7, #fde68a)',
      text: '#92400e',
      border: 'rgba(245,158,11,0.35)',
    };
  }
  if (outcome === 'escalated') {
    return {
      label: 'פנינו לעזרה נוספת',
      bg: 'linear-gradient(135deg, #ffe4e6, #fecdd3)',
      text: '#9f1239',
      border: 'rgba(244,63,94,0.35)',
    };
  }
  if (outcome === 'unknown') {
    return {
      label: 'מחכה שתספר',
      hint: `אחרי רגע קשה אני שואל אם הצעה עזרה. אם לא ענית — זה נשאר פתוח. בפעם הבאה ${pressHint} על "רגע, קשה לי" אפשר לספר לי איך היה.`,
      bg: 'linear-gradient(135deg, #e0e7ff, #c7d2fe)',
      text: '#3730a3',
      border: 'rgba(99,102,241,0.35)',
    };
  }
  return {
    label: 'נסגר',
    bg: 'linear-gradient(135deg, #f1f5f9, #e2e8f0)',
    text: '#475569',
    border: 'rgba(100,116,139,0.25)',
  };
}

function triggerHuman(trigger: string | null): string | null {
  if (!trigger) return null;
  const cat = normalizeFrictionCategory(trigger);
  return TRIGGER_HUMAN[cat] ?? null;
}

function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const start = page * pageSize;
  return items.slice(start, start + pageSize);
}

function totalPages(count: number, pageSize: number): number {
  return Math.max(1, Math.ceil(count / pageSize));
}

function MomentsColorDivider({ index }: { index: number }) {
  const [from, to] = DIVIDER_COLORS[index % DIVIDER_COLORS.length];
  return (
    <div className="my-2 flex items-center gap-2 py-2" aria-hidden>
      <div
        className="h-px flex-1"
        style={{ background: `linear-gradient(90deg, transparent, ${from}88, ${to}aa)` }}
      />
      <div
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: `linear-gradient(135deg, ${from}, ${to})`, boxShadow: `0 0 6px ${from}55` }}
      />
      <div
        className="h-px flex-1"
        style={{ background: `linear-gradient(270deg, transparent, ${to}88, ${from}aa)` }}
      />
    </div>
  );
}

function ListPagination({
  page,
  total,
  onPageChange,
  label,
}: {
  page: number;
  total: number;
  onPageChange: (page: number) => void;
  label: string;
}) {
  if (total <= 1) return null;

  return (
    <nav
      className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200/70 bg-white/70 px-3 py-2.5"
      aria-label={label}
    >
      <button
        type="button"
        disabled={page === 0}
        onClick={() => onPageChange(page - 1)}
        className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold text-emerald-900 transition disabled:opacity-40"
        style={{ background: page === 0 ? 'transparent' : 'rgba(16,185,129,0.12)' }}
      >
        <ChevronRight className="h-3.5 w-3.5" />
        הקודם
      </button>
      <span className="text-xs font-semibold text-slate-600">
        עמוד {page + 1} מתוך {total}
      </span>
      <button
        type="button"
        disabled={page >= total - 1}
        onClick={() => onPageChange(page + 1)}
        className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold text-emerald-900 transition disabled:opacity-40"
        style={{ background: page >= total - 1 ? 'transparent' : 'rgba(16,185,129,0.12)' }}
      >
        הבא
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
    </nav>
  );
}

function DayHeading({ day }: { day: string }) {
  return (
    <div className="py-1.5">
      <p
        className="mx-auto max-w-sm rounded-2xl px-4 py-2 text-center text-[15px] font-black tracking-wide"
        style={{
          ...HEBREW_HEAD,
          color: '#065f46',
          background: 'linear-gradient(135deg, rgba(209,250,229,0.95), rgba(167,243,208,0.85))',
          border: '1px solid rgba(16,185,129,0.28)',
          boxShadow: '0 4px 14px rgba(4,120,87,0.1)',
        }}
      >
        {day}
      </p>
    </div>
  );
}

function OutcomeStatus({ outcome, gender }: { outcome: string; gender: OnboardingGender | '' }) {
  const [showHint, setShowHint] = useState(false);
  const badge = outcomeBadge(outcome, gender);

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold"
          style={{
            background: badge.bg,
            color: badge.text,
            borderColor: badge.border,
          }}
        >
          {badge.label}
          {badge.hint ? (
            <button
              type="button"
              onClick={() => setShowHint((v) => !v)}
              className="inline-flex rounded-full p-0.5 opacity-80 transition hover:opacity-100"
              aria-label="מה זה אומר?"
              aria-expanded={showHint}
            >
              <CircleHelp className="h-3 w-3" />
            </button>
          ) : null}
        </span>
      </div>
      {showHint && badge.hint ? (
        <p className="mt-2 rounded-xl bg-indigo-50/90 px-3 py-2 text-[11px] leading-5 text-indigo-950">
          {badge.hint}
        </p>
      ) : null}
    </div>
  );
}

function SummaryLine({
  eventsCount,
  helpedCount,
  firstName,
}: {
  eventsCount: number;
  helpedCount: number;
  firstName: string;
}) {
  if (eventsCount === 0) return null;

  const parts: string[] = [];
  if (eventsCount === 1) {
    parts.push('עצרת פעם אחת כשהיה קשה');
  } else {
    parts.push(`עצרת ${eventsCount} פעמים כשהיה קשה`);
  }
  if (helpedCount > 0) {
    parts.push(
      helpedCount === 1 ? 'ומשהו אחד עזר לך' : `ו-${helpedCount} דברים עזרו לך`
    );
  }

  return (
    <p
      className="mt-4 max-w-sm text-[15px] font-bold leading-relaxed"
      style={{ ...HEBREW_HEAD, color: HEADER_TEXT.accent }}
    >
      {firstName}, {parts.join(' ')}. אני שומר את זה כדי שבפעם הבאה אדע מה מתאים לך.
    </p>
  );
}

function MomentsPageSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="טוען רגעים">
      <div className="glass-surface-home animate-pulse space-y-4 rounded-[22px] p-5">
        <div className="mx-auto h-5 w-32 rounded-lg bg-emerald-900/10" />
        <div className="mx-auto h-3 w-48 rounded-md bg-emerald-900/8" />
        <div className="space-y-3 pt-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-emerald-900/8 px-4 py-4"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="h-4 w-3/4 rounded-lg bg-emerald-900/10" />
              <div className="mt-2 h-3 w-1/2 rounded-md bg-emerald-900/6" />
            </div>
          ))}
        </div>
      </div>
      <div className="glass-surface-home animate-pulse space-y-3 rounded-[22px] p-5">
        <div className="mx-auto h-5 w-28 rounded-lg bg-emerald-900/10" />
        {[0, 1].map((i) => (
          <div key={i} className="rounded-2xl border border-emerald-200/40 bg-emerald-50/50 px-4 py-3">
            <div className="flex justify-between gap-3">
              <div className="h-5 w-20 rounded-full bg-emerald-200/60" />
              <div className="h-3 w-14 rounded-md bg-emerald-900/8" />
            </div>
            <div className="mt-3 h-4 w-2/3 rounded-lg bg-emerald-900/10" />
          </div>
        ))}
      </div>
    </div>
  );
}

type SosMomentsClientProps = {
  firstName: string;
  gender?: OnboardingGender | '';
};

export function SosMomentsClient({ firstName, gender = '' }: SosMomentsClientProps) {
  const gc = genderCopy(gender);
  const [memory, setMemory] = useState<SosMemorySnippet[]>([]);
  const [events, setEvents] = useState<SosRecentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [helpedPage, setHelpedPage] = useState(0);
  const [failedPage, setFailedPage] = useState(0);
  const [eventsPage, setEventsPage] = useState(0);
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/ai/sos?memory_limit=24&events_limit=40', { cache: 'no-store' });
      const json = (await res.json()) as {
        ok?: boolean;
        memory?: SosMemorySnippet[];
        recent_events?: SosRecentEvent[];
        error?: string;
      };
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'load_failed');
      setMemory(json.memory ?? []);
      setEvents(filterRelevantSosEvents(json.recent_events ?? []));
      setHelpedPage(0);
      setFailedPage(0);
      setEventsPage(0);
      setExpandedDays({});
    } catch {
      setError('לא הצלחתי לזכור עכשיו — אפשר לנסות שוב בעוד רגע.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const groupedEvents = useMemo(() => {
    const groups = new Map<string, SosRecentEvent[]>();
    for (const ev of events) {
      const day = formatDayKey(ev.created_at);
      const list = groups.get(day) ?? [];
      list.push(ev);
      groups.set(day, list);
    }
    return Array.from(groups.entries());
  }, [events]);

  const helpedMemory = memory.filter((m) => m.outcome === 'helped' || m.outcome === 'resolved');
  const failedMemory = memory.filter((m) => m.outcome === 'not_helped');

  const helpedPages = totalPages(helpedMemory.length, MEMORY_PAGE_SIZE);
  const failedPages = totalPages(failedMemory.length, FAILED_PAGE_SIZE);
  const eventsDayPages = totalPages(groupedEvents.length, EVENT_DAYS_PAGE_SIZE);

  const visibleHelped = paginate(helpedMemory, helpedPage, MEMORY_PAGE_SIZE);
  const visibleFailed = paginate(failedMemory, failedPage, FAILED_PAGE_SIZE);
  const visibleEventDays = paginate(groupedEvents, eventsPage, EVENT_DAYS_PAGE_SIZE);

  return (
    <div className="touch-manipulation min-h-screen bg-gradient-to-b from-[#ecfdf5] via-[#f0fdf9] to-[#f8fafc]">
      <div
        className="relative overflow-hidden px-4 pb-10 pt-4"
        style={{ background: HEADER_GRADIENT }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-2/3"
          style={{
            background: 'linear-gradient(180deg, rgba(167,243,208,0.22) 0%, transparent 100%)',
          }}
        />

        <Link
          href="/"
          className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full transition active:scale-95"
          style={{
            background: 'rgba(167, 243, 208, 0.18)',
            border: '1px solid rgba(167, 243, 208, 0.38)',
            boxShadow: 'inset 0 1px 0 rgba(167, 243, 208, 0.45), 0 4px 16px rgba(6,78,59,0.12)',
          }}
          aria-label="חזרה לבית"
        >
          <ArrowRight className="h-5 w-5 text-emerald-50" aria-hidden />
        </Link>

        <div className="relative mx-auto max-w-lg">
          <div className="flex flex-col items-center pt-8 text-center">
            <MomentsHeroAvatar size={96} />
            <p
              className="mt-2 text-base font-bold"
              style={{ ...HEBREW_HEAD, color: HEADER_TEXT.greeting }}
            >
              היי {firstName},
            </p>
            <h1
              className="mt-1 text-[1.85rem] font-black leading-tight"
              style={{ ...HEBREW_HEAD, color: HEADER_TEXT.title }}
            >
              הרגעים שלך
            </h1>
            <p
              className="mt-3 max-w-sm text-[15px] font-bold leading-relaxed"
              style={{ ...HEBREW_HEAD, color: HEADER_TEXT.body }}
            >
              כל פעם שעצרת כשהיה קשה — אני זוכר מה עזר ומה פחות, כדי שבפעם הבאה אדע מה מתאים לך.
            </p>

            {!loading && !error && events.length > 0 ? (
              <SummaryLine
                firstName={firstName}
                eventsCount={events.length}
                helpedCount={helpedMemory.length}
              />
            ) : loading ? (
              <div className="mt-5 w-full max-w-xs space-y-2 animate-pulse" aria-hidden>
                <div className="mx-auto h-3 w-40 rounded-md bg-emerald-50/25" />
                <div className="mx-auto h-3 w-56 rounded-md bg-emerald-50/18" />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="relative z-[2] mx-auto max-w-lg space-y-5 px-4 pb-28 -mt-5">
        {loading ? (
          <MomentsPageSkeleton />
        ) : error ? (
          <div className="glass-surface-home rounded-[22px] border border-red-200/60 px-4 py-3 text-sm text-red-800">
            {error}
            <button
              type="button"
              onClick={() => void load()}
              className="mt-2 block font-bold text-red-900 underline"
            >
              {gc.press} שוב
            </button>
          </div>
        ) : events.length === 0 && memory.length === 0 ? (
          <div dir="rtl" className="glass-surface-home rounded-[22px] px-5 py-10 text-center">
            <MomentsHeroAvatar size={80} />
            <p className="mt-2 text-base font-bold text-slate-900" style={HEBREW_HEAD}>
              {firstName}, עדיין אין כאן רגעים שמורים
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              כשיהיה רגע קשה — {gc.press} על &quot;רגע, קשה לי עכשיו&quot; מהבית. אני אהיה שם, ומה שיעזור יופיע כאן.
            </p>
            <Link
              href="/"
              className="mt-5 inline-flex rounded-2xl px-5 py-2.5 text-sm font-bold text-white"
              style={{
                background: 'linear-gradient(135deg, #047857, #10b981)',
                boxShadow: '0 6px 18px rgba(4,120,87,0.22)',
              }}
            >
              חזרה לבית
            </Link>
          </div>
        ) : (
          <>
            {(helpedMemory.length > 0 || failedMemory.length > 0) && (
              <section dir="rtl" className="glass-surface-home space-y-4 rounded-[22px] p-5">
                <div className="text-center">
                  <h2 className="text-lg font-black text-slate-900" style={HEBREW_HEAD}>
                    מה עזר לך
                  </h2>
                  <p className="mt-1 text-xs text-slate-600">אלה הדברים שעבדו לך</p>
                </div>

                {helpedMemory.length > 0 ? (
                  <>
                    <ul className="space-y-0">
                      {visibleHelped.map((m, i) => {
                        const globalIndex = helpedPage * MEMORY_PAGE_SIZE + i;
                        return (
                          <li key={`h-${globalIndex}`}>
                            {i > 0 ? <MomentsColorDivider index={globalIndex} /> : null}
                            <div
                              className={`rounded-2xl border px-4 py-3 text-sm text-slate-800 ${MEMORY_CARD_STYLES[globalIndex % MEMORY_CARD_STYLES.length]}`}
                            >
                              <p className="font-bold leading-snug">{m.strategy}</p>
                              {m.task_title ? (
                                <p className="mt-1 text-xs text-slate-600">בקשר ל: {m.task_title}</p>
                              ) : null}
                              <p className="mt-1.5 text-[11px] text-slate-500">{formatHebrewRelative(m.created_at)}</p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    <ListPagination
                      page={helpedPage}
                      total={helpedPages}
                      onPageChange={setHelpedPage}
                      label="עימוד — מה עזר לך"
                    />
                  </>
                ) : null}

                {helpedMemory.length > 0 && failedMemory.length > 0 ? (
                  <MomentsColorDivider index={helpedMemory.length} />
                ) : null}

                {failedMemory.length > 0 ? (
                  <div>
                    <p className="mb-3 text-center text-xs font-bold text-amber-900/80">
                      מה שפחות התאים הפעם
                    </p>
                    <ul className="space-y-0">
                      {visibleFailed.map((m, i) => {
                        const globalIndex = failedPage * FAILED_PAGE_SIZE + i;
                        return (
                          <li key={`f-${globalIndex}`}>
                            {i > 0 ? (
                              <MomentsColorDivider index={helpedMemory.length + globalIndex} />
                            ) : null}
                            <div
                              className="rounded-2xl border border-amber-200/50 px-4 py-3 text-sm text-amber-950"
                              style={{
                                background:
                                  'linear-gradient(135deg, rgba(254,243,199,0.85), rgba(253,230,138,0.5))',
                              }}
                            >
                              <p className="font-bold leading-snug">{m.strategy}</p>
                              {m.task_title ? (
                                <p className="mt-1 text-xs text-amber-900/70">בקשר ל: {m.task_title}</p>
                              ) : null}
                              <p className="mt-1.5 text-[11px] text-amber-900/55">
                                {formatHebrewRelative(m.created_at)}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="mt-3">
                      <ListPagination
                        page={failedPage}
                        total={failedPages}
                        onPageChange={setFailedPage}
                        label="עימוד — מה שפחות התאים"
                      />
                    </div>
                  </div>
                ) : null}
              </section>
            )}

            {(helpedMemory.length > 0 || failedMemory.length > 0) && groupedEvents.length > 0 ? (
              <MomentsColorDivider index={0} />
            ) : null}

            {groupedEvents.length > 0 ? (
              <section dir="rtl" className="glass-surface-home space-y-4 rounded-[22px] p-5">
                <div className="px-1 text-center">
                  <h2 className="text-lg font-black text-slate-900" style={HEBREW_HEAD}>
                    מתי זה קרה
                  </h2>
                  <p className="mt-1 text-xs text-slate-600">
                    {groupedEvents.length} ימים · {events.length} רגעים
                  </p>
                </div>

                {visibleEventDays.map(([day, dayEvents], groupIdx) => {
                  const globalGroupIdx = eventsPage * EVENT_DAYS_PAGE_SIZE + groupIdx;
                  const expanded = expandedDays[day] ?? false;
                  const visibleDayEvents = expanded
                    ? dayEvents
                    : dayEvents.slice(0, EVENTS_PER_DAY_LIMIT);
                  const hiddenInDay = dayEvents.length - visibleDayEvents.length;

                  return (
                    <div key={day} className="relative space-y-2">
                      {groupIdx > 0 ? <MomentsColorDivider index={globalGroupIdx + 1} /> : null}
                      <DayHeading day={day} />

                      {visibleDayEvents.map((ev, evIdx) => {
                        const humanTrigger = triggerHuman(ev.trigger);
                        const cardStyle =
                          EVENT_CARD_STYLES[(globalGroupIdx + evIdx) % EVENT_CARD_STYLES.length];
                        return (
                          <div key={ev.id}>
                            {evIdx > 0 ? (
                              <MomentsColorDivider index={globalGroupIdx + evIdx + 2} />
                            ) : null}
                            <article className={`rounded-2xl border px-4 py-3 ${cardStyle}`}>
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <OutcomeStatus outcome={ev.outcome} gender={gender} />
                                <span className="shrink-0 text-xs font-semibold text-emerald-800/65">
                                  {formatHebrewRelative(ev.created_at)}
                                </span>
                              </div>
                              {ev.task_title ? (
                                <p className="mt-2 text-sm font-bold leading-snug text-slate-900">
                                  {ev.task_title}
                                </p>
                              ) : null}
                              {humanTrigger ? (
                                <p className="mt-1.5 text-xs leading-5 text-slate-600">{humanTrigger}</p>
                              ) : null}
                            </article>
                          </div>
                        );
                      })}

                      {!expanded && hiddenInDay > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedDays((prev) => ({ ...prev, [day]: true }))
                          }
                          className="w-full rounded-xl border border-emerald-200/60 bg-emerald-50/70 px-3 py-2 text-xs font-bold text-emerald-900"
                        >
                          עוד {hiddenInDay} רגעים באותו יום
                        </button>
                      ) : null}
                    </div>
                  );
                })}

                <ListPagination
                  page={eventsPage}
                  total={eventsDayPages}
                  onPageChange={setEventsPage}
                  label="עימוד — מתי זה קרה"
                />
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
