'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CircleHelp, Loader2 } from 'lucide-react';

import { normalizeFrictionCategory } from '../../lib/ai/almog-commitments/friction';
import type { SosMemorySnippet, SosRecentEvent } from '../../lib/ai/guardian/sos-memory';
import { filterRelevantSosEvents } from '../../lib/ai/guardian/sos-ease-shared';
import { AlmogAvatarChip } from '../journey/AlmogPresence';

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
  ['#10b981', '#2dd4bf'],
  ['#0d9488', '#5eead4'],
  ['#059669', '#34d399'],
  ['#0e7490', '#22d3ee'],
] as const;

function formatRelative(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'עכשיו';
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `לפני ${days} ימים`;
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: 'numeric',
    month: 'short',
  }).format(new Date(iso));
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

function outcomeBadge(outcome: string): OutcomeBadge {
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
      hint: 'אחרי רגע קשה אני שואל אם הצעה עזרה. אם לא ענית — זה נשאר פתוח. בפעם הבאה שתלחץ/י על "רגע, קשה לי" אפשר לספר לי איך היה.',
      bg: 'linear-gradient(135deg, #e0e7ff, #c7d2fe)',
      text: '#3730a3',
      border: 'rgba(99,102,241,0.35)',
    };
  }
  return {
    label: 'נסגר',
    bg: 'linear-gradient(135deg, #ecfdf5, #d1fae5)',
    text: '#475569',
    border: 'rgba(100,116,139,0.25)',
  };
}

function triggerHuman(trigger: string | null): string | null {
  if (!trigger) return null;
  const cat = normalizeFrictionCategory(trigger);
  return TRIGGER_HUMAN[cat] ?? null;
}

function MomentsColorDivider({ index }: { index: number }) {
  const [from, to] = DIVIDER_COLORS[index % DIVIDER_COLORS.length];
  return (
    <div className="flex items-center gap-2 py-0.5" aria-hidden>
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

function OutcomeStatus({ outcome }: { outcome: string }) {
  const [showHint, setShowHint] = useState(false);
  const badge = outcomeBadge(outcome);

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
    <p className="mt-4 max-w-sm text-sm leading-relaxed text-emerald-50/92">
      {firstName}, {parts.join(' ')}. אני שומר את זה כדי שבפעם הבאה אדע מה מתאים לך.
    </p>
  );
}

type SosMomentsClientProps = {
  firstName: string;
};

export function SosMomentsClient({ firstName }: SosMomentsClientProps) {
  const [memory, setMemory] = useState<SosMemorySnippet[]>([]);
  const [events, setEvents] = useState<SosRecentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    } catch {
      setError('לא הצלחתי לזכור עכשיו — נסה/י שוב בעוד רגע.');
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#ecfdf5] via-[#f0fdf9] to-[#f8fafc]">
      <div
        className="relative overflow-hidden px-4 pb-8 pt-4"
        style={{
          background: 'linear-gradient(155deg, #034d3a 0%, #059669 45%, #10b981 85%)',
        }}
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
          <div className="flex flex-col items-center pt-10 text-center">
            <AlmogAvatarChip size={56} />
            <p className="mt-4 text-sm font-bold text-emerald-100/90">היי {firstName},</p>
            <h1 className="mt-1 text-2xl font-black text-emerald-50">הרגעים שלך</h1>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-emerald-50/88">
              כל פעם שעצרת כשהיה קשה — אני זוכר מה עזר ומה פחות. בלי שיפוט, רק כדי להיות שם בשבילך.
            </p>

            {!loading && !error && events.length > 0 ? (
              <SummaryLine
                firstName={firstName}
                eventsCount={events.length}
                helpedCount={helpedMemory.length}
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className="relative z-[2] mx-auto max-w-lg space-y-5 px-4 pb-28 -mt-5">
        {loading ? (
          <div className="glass-surface-home flex items-center justify-center gap-2 rounded-[22px] py-16 text-emerald-800">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-semibold">רגע, אני זוכר…</span>
          </div>
        ) : error ? (
          <div className="glass-surface-home rounded-[22px] border border-red-200/60 px-4 py-3 text-sm text-red-800">
            {error}
            <button
              type="button"
              onClick={() => void load()}
              className="mt-2 block font-bold text-red-900 underline"
            >
              נסה/י שוב
            </button>
          </div>
        ) : events.length === 0 && memory.length === 0 ? (
          <div dir="rtl" className="glass-surface-home rounded-[22px] px-5 py-10 text-center">
            <AlmogAvatarChip size={48} />
            <p className="mt-4 text-base font-bold text-emerald-950">
              {firstName}, עדיין אין כאן רגעים שמורים
            </p>
            <p className="mt-2 text-sm leading-relaxed text-emerald-900/70">
              כשיהיה רגע קשה — לחץ/י על &quot;רגע, קשה לי עכשיו&quot; מהבית. אני אהיה שם, ומה שיעזור יופיע כאן.
            </p>
            <Link
              href="/"
              className="mt-5 inline-flex rounded-2xl px-5 py-2.5 text-sm font-bold text-emerald-50"
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
                  <h2 className="text-lg font-black text-emerald-950">מה עזר לך</h2>
                  <p className="mt-1 text-xs text-emerald-800/65">דברים שכדאי לזכור לפעם הבאה</p>
                </div>

                {helpedMemory.length > 0 ? (
                  <ul className="space-y-0">
                    {helpedMemory.map((m, i) => (
                      <li key={`h-${i}`}>
                        {i > 0 ? <MomentsColorDivider index={i} /> : null}
                        <div className="glass-inset-emerald rounded-2xl px-4 py-3 text-sm text-emerald-900">
                          <p className="font-bold leading-snug">{m.strategy}</p>
                          {m.task_title ? (
                            <p className="mt-1 text-xs text-emerald-800/70">בקשר ל: {m.task_title}</p>
                          ) : null}
                          <p className="mt-1.5 text-[11px] text-emerald-800/55">{formatRelative(m.created_at)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {helpedMemory.length > 0 && failedMemory.length > 0 ? (
                  <MomentsColorDivider index={helpedMemory.length} />
                ) : null}

                {failedMemory.length > 0 ? (
                  <div>
                    <p className="mb-2 text-center text-xs font-bold text-amber-900/75">
                      מה שפחות התאים הפעם
                    </p>
                    <ul className="space-y-0">
                      {failedMemory.map((m, i) => (
                        <li key={`f-${i}`}>
                          {i > 0 ? <MomentsColorDivider index={helpedMemory.length + i} /> : null}
                          <div
                            className="rounded-2xl px-4 py-3 text-sm text-amber-950"
                            style={{
                              background: 'linear-gradient(135deg, rgba(254,243,199,0.75), rgba(253,230,138,0.45))',
                              border: '1px solid rgba(245,158,11,0.25)',
                            }}
                          >
                            <p className="font-bold leading-snug">{m.strategy}</p>
                            {m.task_title ? (
                              <p className="mt-1 text-xs text-amber-900/70">בקשר ל: {m.task_title}</p>
                            ) : null}
                            <p className="mt-1.5 text-[11px] text-amber-900/55">{formatRelative(m.created_at)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            )}

            {(helpedMemory.length > 0 || failedMemory.length > 0) && groupedEvents.length > 0 ? (
              <MomentsColorDivider index={0} />
            ) : null}

            {groupedEvents.length > 0 ? (
              <section dir="rtl" className="space-y-4">
                <div className="px-1 text-center">
                  <h2 className="text-lg font-black text-emerald-950">מתי זה קרה</h2>
                  <p className="mt-1 text-xs text-emerald-800/65">יום אחרי יום — בלי מספרים מסובכים</p>
                </div>

                {groupedEvents.map(([day, dayEvents], groupIdx) => (
                  <div key={day} className="relative space-y-2">
                    {groupIdx > 0 ? <MomentsColorDivider index={groupIdx + 1} /> : null}
                    <p className="px-1 text-center text-sm font-bold text-emerald-900/85">{day}</p>

                    {dayEvents.map((ev, evIdx) => {
                      const humanTrigger = triggerHuman(ev.trigger);
                      return (
                        <div key={ev.id}>
                          {evIdx > 0 ? <MomentsColorDivider index={groupIdx + evIdx + 2} /> : null}
                          <article className="glass-surface-home rounded-2xl px-4 py-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <OutcomeStatus outcome={ev.outcome} />
                              <span className="shrink-0 text-xs text-emerald-800/55">
                                {formatRelative(ev.created_at)}
                              </span>
                            </div>
                            {ev.task_title ? (
                              <p className="mt-2 text-sm font-bold leading-snug text-emerald-950">
                                {ev.task_title}
                              </p>
                            ) : null}
                            {humanTrigger ? (
                              <p className="mt-1.5 text-xs leading-5 text-emerald-900/75">{humanTrigger}</p>
                            ) : null}
                          </article>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
