'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CircleHelp, Loader2 } from 'lucide-react';

import { genderCopy } from '../../lib/onboarding/gender-copy';
import type { OnboardingGender } from '../../lib/onboarding/types';
import { normalizeFrictionCategory } from '../../lib/ai/almog-commitments/friction';
import type { SosMemorySnippet, SosRecentEvent } from '../../lib/ai/guardian/sos-memory';
import { filterRelevantSosEvents } from '../../lib/ai/guardian/sos-ease-shared';
import { AlmogAvatarChip } from '../journey/AlmogPresence';

const HEBREW_FONT = { fontFamily: "'Rubik','Heebo',sans-serif" } as const;
const INK = '#1a1730';
const INK_SOFT = '#4a4568';

const TRIGGER_HUMAN: Record<string, string> = {
  emotional: 'הרגשת עמוס או לחוץ',
  motivational: 'לא היה לך כוח או חשק',
  physiological: 'חשק, רעב או עייפות',
  logistical: 'הסביבה לא עזרה',
  cognitive: 'קשה להתמקד',
  social: 'לחץ מסביב',
  knowledge: 'לא היה ברור מה לעשות',
};

const EVENT_ACCENT: Record<string, { from: string; to: string; surface: string }> = {
  passed: { from: '#059669', to: '#34d399', surface: 'rgba(16,185,129,0.1)' },
  fell: { from: '#d97706', to: '#fbbf24', surface: 'rgba(245,158,11,0.12)' },
  unknown: { from: '#6366f1', to: '#a5b4fc', surface: 'rgba(99,102,241,0.1)' },
  escalated: { from: '#e11d48', to: '#fb7185', surface: 'rgba(244,63,94,0.1)' },
  default: { from: '#64748b', to: '#94a3b8', surface: 'rgba(100,116,139,0.08)' },
};

const MEMORY_GRADIENTS = [
  'linear-gradient(135deg, rgba(16,185,129,0.14), rgba(52,211,153,0.06))',
  'linear-gradient(135deg, rgba(14,165,233,0.14), rgba(56,189,248,0.06))',
  'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(167,139,250,0.06))',
  'linear-gradient(135deg, rgba(245,158,11,0.14), rgba(251,191,36,0.06))',
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

function tryAgainVerb(gender: OnboardingGender | null): string {
  if (gender === 'male') return 'נסה';
  if (gender === 'female') return 'נסי';
  return 'נסה/י';
}

type OutcomeBadge = {
  label: string;
  hint?: string;
  bg: string;
  text: string;
  border: string;
};

function outcomeBadge(outcome: string, press: string, tell: string): OutcomeBadge {
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
      hint: `אחרי רגע קשה אני שואל אם הצעה עזרה. אם לא ענית — זה נשאר פתוח. בפעם הבאה ש${press} על "רגע, קשה לי" — ${tell} לי איך היה.`,
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

function eventAccent(outcome: string) {
  return EVENT_ACCENT[outcome] ?? EVENT_ACCENT.default;
}

function MomentsHeroAvatar() {
  return (
    <div className="relative flex flex-col items-center pb-4">
      <AlmogAvatarChip size={80} />
      <span
        className="absolute bottom-0 translate-y-1/2 whitespace-nowrap rounded-full px-4 py-1 text-[12px] font-black text-white shadow-md"
        style={{
          background: 'linear-gradient(135deg, #3f3f46, #52525b)',
          border: '1px solid rgba(255,255,255,0.28)',
          boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
        }}
      >
        אלמוג
      </span>
    </div>
  );
}

function OutcomeStatus({
  outcome,
  press,
  tell,
}: {
  outcome: string;
  press: string;
  tell: string;
}) {
  const [showHint, setShowHint] = useState(false);
  const badge = outcomeBadge(outcome, press, tell);

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
        <p
          className="mt-2 rounded-xl px-3 py-2 text-[11px] leading-5"
          style={{ background: 'rgba(99,102,241,0.1)', color: INK }}
        >
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

  let line = '';
  if (eventsCount === 1) {
    line = 'עצרת פעם אחת כשהיה קשה';
  } else {
    line = `עצרת ${eventsCount} פעמים כשהיה קשה`;
  }
  if (helpedCount === 1) {
    line += ', ובפעם אחת מצאנו משהו שעזר';
  } else if (helpedCount > 1) {
    line += `, וב-${helpedCount} מהפעמים מצאנו משהו שעזר`;
  }
  line += '. אשמור את זה.';

  return (
    <p className="mt-4 max-w-sm text-[15px] leading-relaxed" style={{ ...HEBREW_FONT, color: INK_SOFT }}>
      {firstName}, {line}
    </p>
  );
}

type SosMomentsClientProps = {
  firstName: string;
  gender: OnboardingGender | null;
};

export function SosMomentsClient({ firstName, gender }: SosMomentsClientProps) {
  const gc = genderCopy(gender ?? '');
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
      setError(`לא הצלחתי לטעון עכשיו. ${tryAgainVerb(gender)} שוב בעוד רגע?`);
    } finally {
      setLoading(false);
    }
  }, [gender]);

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
    <div className="min-h-screen bg-gradient-to-b from-[#f8f6f2] via-[#f4f8f6] to-[#f8fafc]">
      <div
        className="relative overflow-hidden px-4 pb-10 pt-4"
        style={{
          background: 'linear-gradient(180deg, #f3efe8 0%, #eaf3ee 52%, #f6f8fa 100%)',
          borderBottom: '1px solid rgba(26,23,48,0.06)',
        }}
      >
        <Link
          href="/"
          className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full transition active:scale-95"
          style={{
            background: 'rgba(26,23,48,0.06)',
            border: '1px solid rgba(26,23,48,0.1)',
          }}
          aria-label="חזרה לבית"
        >
          <ArrowRight className="h-5 w-5" style={{ color: INK }} aria-hidden />
        </Link>

        <div className="relative mx-auto max-w-lg">
          <div className="flex flex-col items-center pt-8 text-center">
            <MomentsHeroAvatar />
            <p className="mt-5 text-base font-bold" style={{ ...HEBREW_FONT, color: INK_SOFT }}>
              היי {firstName},
            </p>
            <h1
              className="mt-1 text-[1.75rem] font-black leading-tight"
              style={{ ...HEBREW_FONT, color: INK }}
            >
              הרגעים שלך
            </h1>
            <p className="mt-3 max-w-sm text-[15px] leading-relaxed" style={{ ...HEBREW_FONT, color: INK_SOFT }}>
              אני זוכר כל פעם שעצרת כשהיה קשה — מה עזר ומה פחות. ככה אדע להיות שם בשבילך בפעם הבאה.
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

      <div className="relative z-[2] mx-auto max-w-lg space-y-5 px-4 pb-28 pt-2">
        {loading ? (
          <div className="glass-surface-home flex items-center justify-center gap-2 rounded-[22px] py-16" style={{ color: INK }}>
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-semibold" style={HEBREW_FONT}>
              רגע, אני זוכר…
            </span>
          </div>
        ) : error ? (
          <div className="glass-surface-home rounded-[22px] border border-red-200/60 px-4 py-3 text-sm text-red-800">
            {error}
            <button
              type="button"
              onClick={() => void load()}
              className="mt-2 block font-bold text-red-900 underline"
            >
              {tryAgainVerb(gender)} שוב
            </button>
          </div>
        ) : events.length === 0 && memory.length === 0 ? (
          <div dir="rtl" className="glass-surface-home rounded-[22px] px-5 py-10 text-center">
            <MomentsHeroAvatar />
            <p className="mt-6 text-base font-bold" style={{ ...HEBREW_FONT, color: INK }}>
              {firstName}, עוד אין כאן כלום — וזה בסדר גמור.
            </p>
            <p className="mt-2 text-sm leading-relaxed" style={{ ...HEBREW_FONT, color: INK_SOFT }}>
              כשיהיה רגע קשה, {gc.press} על &quot;רגע, קשה לי עכשיו&quot; מהבית. אני אהיה שם, ומה שיעזור יופיע כאן.
            </p>
            <Link
              href="/"
              className="mt-5 inline-flex rounded-2xl px-5 py-2.5 text-sm font-bold text-white"
              style={{
                background: 'linear-gradient(135deg, #3f3f46, #52525b)',
                boxShadow: '0 6px 18px rgba(0,0,0,0.16)',
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
                  <h2 className="text-lg font-black" style={{ ...HEBREW_FONT, color: INK }}>
                    מה עזר לך
                  </h2>
                  <p className="mt-1 text-xs" style={{ color: INK_SOFT }}>
                    אלה הדברים שכדאי לזכור
                  </p>
                </div>

                {helpedMemory.length > 0 ? (
                  <ul className="space-y-2">
                    {helpedMemory.map((m, i) => (
                      <li
                        key={`h-${i}`}
                        className="rounded-2xl border px-4 py-3 text-sm"
                        style={{
                          background: MEMORY_GRADIENTS[i % MEMORY_GRADIENTS.length],
                          borderColor: 'rgba(16,185,129,0.18)',
                          color: INK,
                        }}
                      >
                        <p className="font-bold leading-snug" style={HEBREW_FONT}>
                          {m.strategy}
                        </p>
                        {m.task_title ? (
                          <p className="mt-1 text-xs" style={{ color: INK_SOFT }}>
                            בקשר ל: {m.task_title}
                          </p>
                        ) : null}
                        <p className="mt-1.5 text-[11px]" style={{ color: INK_SOFT }}>
                          {formatRelative(m.created_at)}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {failedMemory.length > 0 ? (
                  <div>
                    {helpedMemory.length > 0 ? (
                      <p className="mb-2 text-center text-xs font-bold" style={{ color: '#b45309' }}>
                        מה שפחות התאים
                      </p>
                    ) : null}
                    <ul className="space-y-2">
                      {failedMemory.map((m, i) => (
                        <li
                          key={`f-${i}`}
                          className="rounded-2xl border px-4 py-3 text-sm"
                          style={{
                            background: 'linear-gradient(135deg, rgba(254,243,199,0.65), rgba(253,230,138,0.35))',
                            borderColor: 'rgba(245,158,11,0.22)',
                            color: INK,
                          }}
                        >
                          <p className="font-bold leading-snug" style={HEBREW_FONT}>
                            {m.strategy}
                          </p>
                          {m.task_title ? (
                            <p className="mt-1 text-xs" style={{ color: INK_SOFT }}>
                              בקשר ל: {m.task_title}
                            </p>
                          ) : null}
                          <p className="mt-1.5 text-[11px]" style={{ color: INK_SOFT }}>
                            {formatRelative(m.created_at)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            )}

            {groupedEvents.length > 0 ? (
              <section dir="rtl" className="space-y-4">
                <div className="px-1 text-center">
                  <h2 className="text-lg font-black" style={{ ...HEBREW_FONT, color: INK }}>
                    מתי זה קרה
                  </h2>
                  <p className="mt-1 text-xs" style={{ color: INK_SOFT }}>
                    {events.length === 1 ? 'רגע אחד' : `${events.length} רגעים לאורך הזמן`}
                  </p>
                </div>

                {groupedEvents.map(([day, dayEvents], groupIdx) => {
                  const dayAccent = MEMORY_GRADIENTS[groupIdx % MEMORY_GRADIENTS.length];
                  return (
                    <div
                      key={day}
                      className="overflow-hidden rounded-[22px] border"
                      style={{
                        borderColor: 'rgba(26,23,48,0.08)',
                        boxShadow: '0 8px 28px rgba(26,23,48,0.06)',
                      }}
                    >
                      <div
                        className="flex items-center justify-between gap-2 px-4 py-3"
                        style={{ background: dayAccent }}
                      >
                        <p className="text-sm font-black" style={{ ...HEBREW_FONT, color: INK }}>
                          {day}
                        </p>
                        <span
                          className="rounded-full px-2.5 py-0.5 text-[10px] font-bold"
                          style={{ background: 'rgba(255,255,255,0.55)', color: INK_SOFT }}
                        >
                          {dayEvents.length === 1 ? 'רגע אחד' : `${dayEvents.length} רגעים`}
                        </span>
                      </div>

                      <div className="space-y-0 bg-white/55 p-2">
                        {dayEvents.map((ev) => {
                          const humanTrigger = triggerHuman(ev.trigger);
                          const accent = eventAccent(ev.outcome);
                          return (
                            <article
                              key={ev.id}
                              className="relative mb-2 overflow-hidden rounded-2xl border px-4 py-3 last:mb-0"
                              style={{
                                background: accent.surface,
                                borderColor: `${accent.from}22`,
                              }}
                            >
                              <div
                                className="absolute inset-y-2 right-0 w-1 rounded-full"
                                style={{ background: `linear-gradient(180deg, ${accent.from}, ${accent.to})` }}
                                aria-hidden
                              />
                              <div className="flex flex-wrap items-start justify-between gap-2 pr-2">
                                <OutcomeStatus outcome={ev.outcome} press={gc.press} tell={gc.tell} />
                                <span className="shrink-0 text-xs" style={{ color: INK_SOFT }}>
                                  {formatRelative(ev.created_at)}
                                </span>
                              </div>
                              {ev.task_title ? (
                                <p
                                  className="mt-2 pr-2 text-sm font-bold leading-snug"
                                  style={{ ...HEBREW_FONT, color: INK }}
                                >
                                  {ev.task_title}
                                </p>
                              ) : null}
                              {humanTrigger ? (
                                <p className="mt-1.5 pr-2 text-xs leading-5" style={{ color: INK_SOFT }}>
                                  {humanTrigger}
                                </p>
                              ) : null}
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
