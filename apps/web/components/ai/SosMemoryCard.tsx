'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronLeft, Sparkles } from 'lucide-react';

import type { SosMemorySnippet, SosRecentEvent } from '../../lib/ai/guardian/sos-memory';
import { filterRelevantSosEvents } from '../../lib/ai/guardian/sos-ease-shared';
import { AlmogAvatarChip } from '../journey/AlmogPresence';

function formatRelative(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'עכשיו';
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} ש׳`;
  return `לפני ${Math.floor(hours / 24)} ימים`;
}

function outcomeLabel(outcome: string): string {
  if (outcome === 'passed') return 'עבר ✓';
  if (outcome === 'fell') return 'עדיין קשה';
  if (outcome === 'escalated') return 'הופנה לעזרה';
  if (outcome === 'unknown') return 'מחכה שתספר';
  return 'נסגר';
}

function SosMemoryCardSkeleton() {
  return (
    <div
      dir="rtl"
      className="glass-surface-home animate-pulse rounded-[22px] p-4"
      aria-busy="true"
      aria-label="טוען רגעים אחרונים"
    >
      <div className="mb-3 flex items-center gap-3">
        <div className="h-10 w-10 shrink-0 rounded-full bg-emerald-900/10" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-36 rounded-lg bg-emerald-900/10" />
          <div className="h-3 w-24 rounded-md bg-emerald-900/6" />
        </div>
      </div>
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-2xl border border-emerald-900/8 px-3 py-2.5">
            <div className="h-3.5 w-4/5 rounded-md bg-emerald-900/8" />
            <div className="mt-2 h-3 w-full rounded-md bg-emerald-900/5" />
          </div>
        ))}
      </div>
      <div className="mt-3 h-3 w-16 rounded-md bg-emerald-900/8" />
    </div>
  );
}

export function SosMemoryCard() {
  const [memory, setMemory] = useState<SosMemorySnippet[]>([]);
  const [events, setEvents] = useState<SosRecentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/ai/sos', { cache: 'no-store' });
      const json = (await res.json()) as {
        ok?: boolean;
        memory?: SosMemorySnippet[];
        recent_events?: SosRecentEvent[];
      };
      if (res.ok && json.ok) {
        setMemory(json.memory ?? []);
        setEvents(filterRelevantSosEvents(json.recent_events ?? []));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <SosMemoryCardSkeleton />;
  if (memory.length === 0 && events.length === 0) return null;

  const helped = memory.filter((m) => m.outcome === 'helped' || m.outcome === 'resolved').slice(0, 4);
  const failed = memory.filter((m) => m.outcome === 'not_helped').slice(0, 2);
  const previewCount = helped.length + failed.length + events.length;
  const showAccordion = previewCount > 2;

  const toggleExpanded = () => {
    if (showAccordion) setExpanded((v) => !v);
  };

  return (
    <div
      dir="rtl"
      role={showAccordion ? 'button' : undefined}
      tabIndex={showAccordion ? 0 : undefined}
      onClick={showAccordion ? toggleExpanded : undefined}
      onKeyDown={
        showAccordion
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleExpanded();
              }
            }
          : undefined
      }
      className={`touch-manipulation glass-surface-home rounded-[22px] p-4 text-right ${
        showAccordion ? 'cursor-pointer transition active:scale-[0.995]' : ''
      }`}
    >
      <div className="relative mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlmogAvatarChip size={40} />
          <div>
            <p className="text-sm font-black text-slate-900">מה עזר לך לאחרונה</p>
            <p className="text-[10px] font-semibold text-slate-500">
              {showAccordion ? 'לחץ לפתיחה / סגירה' : 'רגעים אחרונים'}
            </p>
          </div>
        </div>
        {showAccordion ? (
          <span
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold text-white"
            style={{
              background: 'linear-gradient(145deg, #047857, #10b981)',
              boxShadow: '0 4px 12px rgba(4,120,87,0.2)',
            }}
          >
            {expanded ? 'סגור' : 'פתח'}
            <ChevronDown className={`h-3.5 w-3.5 transition ${expanded ? 'rotate-180' : ''}`} />
          </span>
        ) : null}
      </div>

      <div className="relative space-y-2">
        {(expanded || !showAccordion ? helped : helped.slice(0, 1)).map((m, i) => (
          <JourneyStepRow
            key={`h-${i}`}
            tone="good"
            title={m.task_title ? `"${m.task_title}"` : 'רגע קשה'}
            body={m.strategy}
            index={i + 1}
          />
        ))}

        {(expanded || !showAccordion ? failed : []).map((m, i) => (
          <JourneyStepRow
            key={`f-${i}`}
            tone="warn"
            title={m.task_title ? `"${m.task_title}"` : 'ניסיון'}
            body={`${m.strategy} — פחות התאים`}
            index={helped.length + i + 1}
          />
        ))}

        {events.length > 0 && (expanded || !showAccordion) ? (
          <div className="rounded-2xl border border-violet-200/50 bg-gradient-to-br from-violet-50/80 to-white px-3 py-2.5">
            <p className="mb-2 flex items-center gap-1 text-[11px] font-bold text-violet-900">
              <Sparkles className="h-3 w-3" />
              רגעים אחרונים
            </p>
            <div className="space-y-1.5">
              {events.slice(0, expanded ? 4 : 2).map((ev, i) => (
                <div key={ev.id} className="flex items-start gap-2 text-[11px] leading-5 text-slate-700">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-[9px] font-black text-violet-800">
                    {i + 1}
                  </span>
                  <span>
                    <span className="font-bold">{formatRelative(ev.created_at)}</span>
                    {' · '}
                    {outcomeLabel(ev.outcome)}
                    {ev.task_title ? ` · ${ev.task_title}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <Link
        href="/settings/sos-moments"
        onClick={(e) => e.stopPropagation()}
        className="relative mt-3 inline-flex items-center gap-1 text-xs font-bold text-emerald-800 hover:text-emerald-950"
      >
        ראה הכל
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>
  );
}

function JourneyStepRow({
  tone,
  title,
  body,
  index,
}: {
  tone: 'good' | 'warn';
  title: string;
  body: string;
  index: number;
}) {
  const accent = tone === 'good' ? '#8b5cf6' : '#f59e0b';
  const surface =
    tone === 'good'
      ? 'border-violet-200/50 bg-gradient-to-br from-violet-50/80 to-white'
      : 'border-amber-200/50 bg-gradient-to-br from-amber-50/80 to-white';
  return (
    <div className={`flex gap-3 rounded-2xl border px-3 py-2.5 ${surface}`}>
      <div className="flex flex-col items-center pt-0.5">
        <div
          className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black text-white"
          style={{ background: accent, boxShadow: `0 2px 8px ${accent}44` }}
        >
          {index}
        </div>
        <div className="mt-1 w-px flex-1 min-h-[8px] bg-slate-900/10" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-black text-slate-900">{title}</p>
        <p className="mt-0.5 text-[11px] leading-5 text-slate-600">{body}</p>
      </div>
    </div>
  );
}
