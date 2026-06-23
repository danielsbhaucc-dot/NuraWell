'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, History, Loader2, MapPin, Sparkles } from 'lucide-react';

import {
  FRICTION_META,
  STRATEGY_LABELS_HE,
  normalizeFrictionCategory,
  normalizeStrategyType,
} from '../../lib/ai/almog-commitments/friction';
import type { SosMemorySnippet, SosRecentEvent } from '../../lib/ai/guardian/sos-memory';
import { filterRelevantSosEvents } from '../../lib/ai/guardian/sos-ease-shared';

const ACCENT_GRADIENTS = [
  'linear-gradient(145deg, #047857, #10b981)',
  'linear-gradient(145deg, #0d9488, #2dd4bf)',
  'linear-gradient(145deg, #0f766e, #14b8a6)',
  'linear-gradient(145deg, #059669, #34d399)',
  'linear-gradient(145deg, #0e7490, #22d3ee)',
  'linear-gradient(145deg, #4d7c0f, #84cc16)',
] as const;

function formatRelative(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'עכשיו';
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} ש׳`;
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
  bg: string;
  text: string;
  border: string;
};

function outcomeBadge(outcome: string): OutcomeBadge {
  if (outcome === 'passed') {
    return {
      label: 'עבר ✓',
      bg: 'linear-gradient(135deg, #d1fae5, #a7f3d0)',
      text: '#065f46',
      border: 'rgba(16,185,129,0.35)',
    };
  }
  if (outcome === 'fell') {
    return {
      label: 'עדיין קשה',
      bg: 'linear-gradient(135deg, #fef3c7, #fde68a)',
      text: '#92400e',
      border: 'rgba(245,158,11,0.35)',
    };
  }
  if (outcome === 'escalated') {
    return {
      label: 'הופנה לעזרה',
      bg: 'linear-gradient(135deg, #ffe4e6, #fecdd3)',
      text: '#9f1239',
      border: 'rgba(244,63,94,0.35)',
    };
  }
  if (outcome === 'unknown') {
    return {
      label: 'ממתין למשוב',
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

function memoryOutcomeLabel(outcome: string): string {
  if (outcome === 'helped' || outcome === 'resolved') return 'עזר';
  if (outcome === 'not_helped') return 'פחות התאים';
  return 'במעקב';
}

function triggerLabel(trigger: string | null): string {
  if (!trigger) return 'רגע קשה';
  const cat = normalizeFrictionCategory(trigger);
  return FRICTION_META[cat]?.labelHe ?? trigger;
}

function strategyLabelHe(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  const type = normalizeStrategyType(raw);
  return STRATEGY_LABELS_HE[type] ?? null;
}

function StatPill({
  value,
  label,
  gradient,
}: {
  value: number;
  label: string;
  gradient: string;
}) {
  return (
    <div
      className="flex min-w-[5.5rem] flex-col items-center rounded-2xl px-3 py-2.5"
      style={{
        background: gradient,
        boxShadow: '0 4px 14px rgba(6,78,59,0.14)',
      }}
    >
      <span className="text-xl font-black leading-none text-emerald-50">{value}</span>
      <span className="mt-1 text-[10px] font-bold text-emerald-50/85">{label}</span>
    </div>
  );
}

export function SosMomentsClient() {
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
      setError('לא הצלחנו לטעון את ההיסטוריה — נסה שוב בעוד רגע.');
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

  const numberedGroups = useMemo(() => {
    let counter = 0;
    return groupedEvents.map(([day, dayEvents], groupIdx) => ({
      day,
      groupIdx,
      events: dayEvents.map((ev) => {
        counter += 1;
        return { ev, itemNum: counter };
      }),
    }));
  }, [groupedEvents]);

  const helpedMemory = memory.filter((m) => m.outcome === 'helped' || m.outcome === 'resolved');
  const failedMemory = memory.filter((m) => m.outcome === 'not_helped');

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#ecfdf5] via-[#f0fdf9] to-[#f8fafc]">
      {/* HERO */}
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
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
              style={{
                background: 'rgba(167, 243, 208, 0.2)',
                boxShadow: 'inset 0 1px 0 rgba(167, 243, 208, 0.4)',
              }}
            >
              <MapPin className="h-7 w-7 text-emerald-50" />
            </div>
            <h1 className="mt-4 text-2xl font-black text-emerald-50">מסע הרגעים הקשים</h1>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-emerald-50/90">
              כל פעם שלחצת &quot;רגע… קשה לי&quot; — מה עזר, מה פחות, ואיך אלמוג לומד איתך.
            </p>

            {!loading && !error && (events.length > 0 || memory.length > 0) ? (
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <StatPill
                  value={events.length}
                  label="רגעים"
                  gradient="linear-gradient(145deg, #047857, #10b981)"
                />
                <StatPill
                  value={helpedMemory.length}
                  label="מה עזר"
                  gradient="linear-gradient(145deg, #0d9488, #2dd4bf)"
                />
                <StatPill
                  value={failedMemory.length}
                  label="פחות התאים"
                  gradient="linear-gradient(145deg, #b45309, #f59e0b)"
                />
                <StatPill
                  value={groupedEvents.length}
                  label="ימים"
                  gradient="linear-gradient(145deg, #0e7490, #22d3ee)"
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="relative z-[2] mx-auto max-w-lg space-y-5 px-4 pb-28 -mt-5">
        {loading ? (
          <div className="glass-surface-home flex items-center justify-center gap-2 rounded-[22px] py-16 text-emerald-800">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-semibold">טוען היסטוריה…</span>
          </div>
        ) : error ? (
          <div className="glass-surface-home rounded-[22px] border border-red-200/60 px-4 py-3 text-sm text-red-800">
            {error}
            <button
              type="button"
              onClick={() => void load()}
              className="mt-2 block font-bold text-red-900 underline"
            >
              נסה שוב
            </button>
          </div>
        ) : events.length === 0 && memory.length === 0 ? (
          <div dir="rtl" className="glass-surface-home rounded-[22px] px-5 py-10 text-center">
            <History className="mx-auto h-10 w-10 text-emerald-600/70" />
            <p className="mt-3 text-base font-bold text-emerald-950">עדיין אין רגעים שמורים</p>
            <p className="mt-2 text-sm text-emerald-900/70">
              כשתלחץ &quot;רגע… קשה לי&quot; מהבית — ההיסטוריה תופיע כאן.
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
                <div className="flex items-center justify-center gap-2">
                  <Sparkles className="h-5 w-5 text-emerald-700" />
                  <h2 className="text-lg font-black text-emerald-950">מה אלמוג למד ממך</h2>
                </div>

                {helpedMemory.length > 0 ? (
                  <div>
                    <p className="mb-2 text-center text-xs font-bold text-emerald-800/70">מה עזר</p>
                    <ul className="space-y-2">
                      {helpedMemory.map((m, i) => (
                        <li
                          key={`h-${i}`}
                          className="glass-inset-emerald flex items-start gap-3 rounded-2xl px-4 py-3 text-sm text-emerald-900"
                        >
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-emerald-50"
                            style={{
                              background: ACCENT_GRADIENTS[i % ACCENT_GRADIENTS.length],
                              boxShadow: '0 3px 10px rgba(4,120,87,0.18)',
                            }}
                          >
                            {i + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <span className="font-bold">{m.strategy}</span>
                            {m.task_title ? ` · ${m.task_title}` : ''}
                            <span className="mt-1 block text-xs text-emerald-800/60">
                              {memoryOutcomeLabel(m.outcome)} · {formatRelative(m.created_at)}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {failedMemory.length > 0 ? (
                  <div>
                    <p className="mb-2 text-center text-xs font-bold text-amber-900/70">פחות התאים</p>
                    <ul className="space-y-2">
                      {failedMemory.map((m, i) => (
                        <li
                          key={`f-${i}`}
                          className="flex items-start gap-3 rounded-2xl px-4 py-3 text-sm text-amber-950"
                          style={{
                            background: 'linear-gradient(135deg, rgba(254,243,199,0.75), rgba(253,230,138,0.45))',
                            border: '1px solid rgba(245,158,11,0.25)',
                          }}
                        >
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-amber-50"
                            style={{
                              background: 'linear-gradient(145deg, #b45309, #f59e0b)',
                              boxShadow: '0 3px 10px rgba(180,83,9,0.2)',
                            }}
                          >
                            {i + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <span className="font-bold">{m.strategy}</span>
                            {m.task_title ? ` · ${m.task_title}` : ''}
                            <span className="mt-1 block text-xs text-amber-900/60">
                              {formatRelative(m.created_at)}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            )}

            {groupedEvents.length > 0 ? (
              <section dir="rtl" className="space-y-4">
                <div className="flex items-center justify-center gap-2 px-1">
                  <History className="h-5 w-5 text-emerald-700" />
                  <h2 className="text-lg font-black text-emerald-950">רגעים לפי תאריך</h2>
                </div>

                {numberedGroups.map(({ day, groupIdx, events: dayEvents }) => (
                  <div key={day} className="relative space-y-2">
                    <div className="flex items-center justify-center gap-2 px-1">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black text-emerald-50"
                        style={{
                          background: ACCENT_GRADIENTS[groupIdx % ACCENT_GRADIENTS.length],
                          boxShadow: '0 4px 12px rgba(4,120,87,0.2)',
                        }}
                      >
                        {groupIdx + 1}
                      </span>
                      <p className="text-sm font-bold text-emerald-900/80">{day}</p>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold text-emerald-800"
                        style={{
                          background: 'rgba(167, 243, 208, 0.35)',
                          border: '1px solid rgba(16,185,129,0.2)',
                        }}
                      >
                        {dayEvents.length} רגעים
                      </span>
                    </div>

                    {dayEvents.map(({ ev, itemNum }) => {
                      const badge = outcomeBadge(ev.outcome);
                      const strategyHe = strategyLabelHe(ev.strategy_offered);
                      return (
                        <article
                          key={ev.id}
                          className="glass-surface-home flex items-start gap-3 rounded-2xl px-4 py-3"
                        >
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-emerald-50"
                            style={{
                              background: ACCENT_GRADIENTS[(itemNum - 1) % ACCENT_GRADIENTS.length],
                              boxShadow: '0 3px 10px rgba(4,120,87,0.16)',
                            }}
                          >
                            {itemNum}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className="rounded-full border px-2.5 py-0.5 text-[11px] font-bold"
                                style={{
                                  background: badge.bg,
                                  color: badge.text,
                                  borderColor: badge.border,
                                }}
                              >
                                {badge.label}
                              </span>
                              <span className="text-xs text-emerald-800/55">{formatRelative(ev.created_at)}</span>
                              <span className="text-xs font-semibold text-emerald-800/70">
                                {triggerLabel(ev.trigger)}
                              </span>
                            </div>
                            {ev.task_title ? (
                              <p className="mt-2 text-sm font-bold text-emerald-950">{ev.task_title}</p>
                            ) : null}
                            {strategyHe ? (
                              <p className="mt-1 text-xs text-emerald-900/75">
                                <span className="font-bold text-emerald-800">מה ניסינו: </span>
                                {strategyHe}
                              </p>
                            ) : null}
                          </div>
                        </article>
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
