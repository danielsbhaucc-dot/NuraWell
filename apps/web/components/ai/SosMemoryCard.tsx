'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, History, Sparkles } from 'lucide-react';

import type { SosMemorySnippet, SosRecentEvent } from '../../lib/ai/guardian/sos-memory';

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
  return 'במעקב';
}

export function SosMemoryCard() {
  const [memory, setMemory] = useState<SosMemorySnippet[]>([]);
  const [events, setEvents] = useState<SosRecentEvent[]>([]);
  const [loading, setLoading] = useState(true);

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
        setEvents(json.recent_events ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return null;
  if (memory.length === 0 && events.length === 0) return null;

  const helped = memory.filter((m) => m.outcome === 'helped' || m.outcome === 'resolved').slice(0, 3);
  const failed = memory.filter((m) => m.outcome === 'not_helped').slice(0, 2);

  return (
    <div
      dir="rtl"
      className="rounded-[20px] p-4 text-right"
      style={{
        background: 'rgba(255,255,255,0.55)',
        border: '1px solid rgba(16,185,129,0.14)',
        backdropFilter: 'blur(16px)',
      }}
    >
      <div className="mb-3 flex items-center gap-2">
        <History className="h-4 w-4 text-emerald-700" />
        <p className="text-sm font-black text-emerald-950">מה עזר לך לאחרונה</p>
      </div>

      {helped.length > 0 ? (
        <ul className="mb-2 space-y-1 text-xs leading-6 text-emerald-900">
          {helped.map((m, i) => (
            <li key={`h-${i}`}>
              ✓ {m.task_title ? `"${m.task_title}" — ` : ''}
              {m.strategy}
            </li>
          ))}
        </ul>
      ) : null}

      {failed.length > 0 ? (
        <ul className="mb-2 space-y-1 text-xs leading-6 text-amber-900/85">
          {failed.map((m, i) => (
            <li key={`f-${i}`}>
              · {m.task_title ? `"${m.task_title}" — ` : ''}
              {m.strategy} פחות התאים
            </li>
          ))}
        </ul>
      ) : null}

      {events.length > 0 ? (
        <div
          className="mt-2 rounded-xl px-3 py-2 text-[11px] leading-5 text-emerald-900/80"
          style={{ background: 'rgba(16,185,129,0.06)' }}
        >
          <p className="mb-1 flex items-center gap-1 font-bold text-emerald-800">
            <Sparkles className="h-3 w-3" />
            רגעים אחרונים
          </p>
          {events.slice(0, 3).map((ev) => (
            <p key={ev.id}>
              {formatRelative(ev.created_at)} · {outcomeLabel(ev.outcome)}
              {ev.task_title ? ` · ${ev.task_title}` : ''}
            </p>
          ))}
        </div>
      ) : null}

      <Link
        href="/settings/sos-moments"
        className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-emerald-800 hover:text-emerald-950"
      >
        ראה הכל
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>
  );
}
