'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, History, Loader2, Sparkles } from 'lucide-react';

import { FRICTION_META, normalizeFrictionCategory } from '../../lib/ai/almog-commitments/friction';
import type { SosMemorySnippet, SosRecentEvent } from '../../lib/ai/guardian/sos-memory';

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

function outcomeBadge(outcome: string): { label: string; tone: string } {
  if (outcome === 'passed') return { label: 'עבר ✓', tone: 'text-emerald-800 bg-emerald-50 border-emerald-200' };
  if (outcome === 'fell') return { label: 'עדיין קשה', tone: 'text-amber-900 bg-amber-50 border-amber-200' };
  if (outcome === 'escalated') return { label: 'הופנה לעזרה', tone: 'text-rose-800 bg-rose-50 border-rose-200' };
  return { label: 'במעקב', tone: 'text-slate-700 bg-slate-100 border-slate-200' };
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
      setEvents(json.recent_events ?? []);
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
    <div className="min-h-screen bg-gradient-to-b from-[#f2fbf8] via-[#f8fafc] to-white">
      <div className="container-mobile py-6 pb-10 space-y-5">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Link href="/" className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline">
            בית
            <ArrowRight className="h-4 w-4 rotate-180" aria-hidden />
          </Link>
          <span className="text-slate-400">/</span>
          <span className="text-slate-700">רגעים קשים</span>
        </div>

        <div>
          <h1 className="text-2xl font-black text-slate-900">היסטוריית &quot;רגע… קשה לי&quot;</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
            כל הרגעים ששיתפת, מה עזר ומה פחות — כדי שאלמוג יידע להתאים את עצמו בפעם הבאה.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-emerald-800">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-semibold">טוען היסטוריה…</span>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
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
          <div
            dir="rtl"
            className="rounded-3xl border border-emerald-100 bg-white/80 px-5 py-10 text-center"
          >
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
              <section
                dir="rtl"
                className="rounded-3xl border border-emerald-100 bg-white/80 p-5 space-y-4"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-emerald-700" />
                  <h2 className="text-lg font-black text-emerald-950">מה אלמוג למד</h2>
                </div>

                {helpedMemory.length > 0 ? (
                  <div>
                    <p className="mb-2 text-xs font-bold text-emerald-800/70">מה עזר</p>
                    <ul className="space-y-2">
                      {helpedMemory.map((m, i) => (
                        <li
                          key={`h-${i}`}
                          className="rounded-2xl border border-emerald-100 bg-emerald-50/50 px-4 py-3 text-sm text-emerald-900"
                        >
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
                        <li
                          key={`f-${i}`}
                          className="rounded-2xl border border-amber-100 bg-amber-50/40 px-4 py-3 text-sm text-amber-950"
                        >
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

                {groupedEvents.map(([day, dayEvents]) => (
                  <div key={day} className="space-y-2">
                    <p className="px-1 text-xs font-bold text-emerald-900/60">{day}</p>
                    {dayEvents.map((ev) => {
                      const badge = outcomeBadge(ev.outcome);
                      return (
                        <article
                          key={ev.id}
                          className="rounded-2xl border border-emerald-100 bg-white/85 px-4 py-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${badge.tone}`}
                            >
                              {badge.label}
                            </span>
                            <span className="text-xs text-slate-500">{formatRelative(ev.created_at)}</span>
                            <span className="text-xs font-semibold text-emerald-800/70">
                              {triggerLabel(ev.trigger)}
                            </span>
                          </div>
                          {ev.task_title ? (
                            <p className="mt-2 text-sm font-bold text-emerald-950">{ev.task_title}</p>
                          ) : null}
                          {ev.strategy_offered ? (
                            <p className="mt-1 text-xs text-emerald-900/75">
                              הצעה: {ev.strategy_offered.replace(/_/g, ' ')}
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
