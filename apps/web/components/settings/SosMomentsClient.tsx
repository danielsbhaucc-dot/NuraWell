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
    bg: 'linear-gradient(135deg, #f1f5f9, #e2e8f0)',
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
            background: 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 100%)',
          }}
        />
        <div className="container-mobile relative">
          <div className="mb-4 flex items-center gap-2 text-sm">
            <Link
              href="/"
              className="inline-flex items-center gap-1 font-semibold text-emerald-50/90 hover:text-white"
            >
              בית
              <ArrowRight className="h-4 w-4 rotate-180" aria-hidden />
            </Link>
          </div>
          <div className="flex items-start gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
              style={{
                background: 'rgba(255,255,255,0.18)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35)',
              }}
            >
              <MapPin className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">מסע הרגעים הקשים</h1>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-emerald-50/90">
                כל פעם שלחצת &quot;רגע… קשה לי&quot; — מה עזר, מה פחות, ואיך אלמוג לומד איתך.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container-mobile relative z-[2] -mt-5 space-y-5 px-4 pb-32 safe-chat-fab">
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
              className="mt-5 inline-flex rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white"
            >
              חזרה לבית
            </Link>
          </div>
        ) : (
          <>
            {(helpedMemory.length > 0 || failedMemory.length > 0) && (
              <section dir="rtl" className="glass-surface-home space-y-4 rounded-[22px] p-5">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-emerald-700" />
                  <h2 className="text-lg font-black text-emerald-950">מה אלמוג למד ממך</h2>
                </div>

                {helpedMemory.length > 0 ? (
                  <div>
                    <p className="mb-2 text-xs font-bold text-emerald-800/70">מה עזר</p>
                    <ul className="space-y-2">
                      {helpedMemory.map((m, i) => (
                        <li key={`h-${i}`} className="glass-inset-home rounded-2xl px-4 py-3 text-sm text-emerald-900">
                          <span className="font-bold">{m.strategy}</span>
                          {m.task_title ? ` · ${m.task_title}` : ''}
                          <span className="mt-1 block text-xs text-emerald-800/60">
                            {memoryOutcomeLabel(m.outcome)} · {formatRelative(m.created_at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {failedMemory.length > 0 ? (
                  <div>
                    <p className="mb-2 text-xs font-bold text-amber-900/70">פחות התאים</p>
                    <ul className="space-y-2">
                      {failedMemory.map((m, i) => (
                        <li key={`f-${i}`} className="glass-inset-home rounded-2xl px-4 py-3 text-sm text-amber-950">
                          <span className="font-bold">{m.strategy}</span>
                          {m.task_title ? ` · ${m.task_title}` : ''}
                          <span className="mt-1 block text-xs text-amber-900/60">
                            {formatRelative(m.created_at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            )}

            {groupedEvents.length > 0 ? (
              <section dir="rtl" className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                  <History className="h-5 w-5 text-emerald-700" />
                  <h2 className="text-lg font-black text-emerald-950">רגעים לפי תאריך</h2>
                </div>

                {groupedEvents.map(([day, dayEvents], groupIdx) => (
                  <div key={day} className="relative space-y-2 pl-1">
                    <div className="flex items-center gap-2 px-1">
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white"
                        style={{
                          background: 'linear-gradient(145deg, #047857, #10b981)',
                          boxShadow: '0 4px 12px rgba(4,120,87,0.2)',
                        }}
                      >
                        {groupIdx + 1}
                      </span>
                      <p className="text-sm font-bold text-emerald-900/75">{day}</p>
                    </div>

                    {dayEvents.map((ev) => {
                      const badge = outcomeBadge(ev.outcome);
                      const strategyHe = strategyLabelHe(ev.strategy_offered);
                      return (
                        <article key={ev.id} className="glass-surface-home mr-2 rounded-2xl px-4 py-3">
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
