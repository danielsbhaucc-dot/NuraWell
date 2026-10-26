'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronLeft } from 'lucide-react';

import type { SosMemorySnippet, SosRecentEvent } from '../../lib/ai/guardian/sos-memory';
import { filterRelevantSosEvents } from '../../lib/ai/guardian/sos-ease-shared';
import { formatHebrewRelative } from '../../lib/time/hebrew-relative';

function outcomeLabel(outcome: string): string {
  if (outcome === 'passed') return 'עבר ✓';
  if (outcome === 'fell') return 'עדיין קשה';
  if (outcome === 'escalated') return 'הופנה לעזרה';
  if (outcome === 'unknown') return 'מחכה שתספר';
  return 'נסגר';
}

export type SosContextPayload = { memory: SosMemorySnippet[]; recent_events: SosRecentEvent[] };

/**
 * "What helped" memory for /home. Data arrives with the page (RSC, parallel to the other home queries),
 * so there is no client fetch, no idle delay and no skeleton. The section header lives in HomeClient.
 */
export function SosMemoryCard({ initial }: { initial?: SosContextPayload | null }) {
  const [expanded, setExpanded] = useState(false);
  const memory = initial?.memory ?? [];
  const events = filterRelevantSosEvents(initial?.recent_events ?? []);
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
      className={`touch-manipulation glass-surface-home rounded-[22px] p-4 text-start ${
        showAccordion ? 'cursor-pointer transition active:scale-[0.995]' : ''
      }`}
    >
      {showAccordion ? (
        <div className="mb-2 flex justify-end">
          <span className="flex items-center gap-1 rounded-full bg-primary-900/8 px-2.5 py-1 text-[10px] font-bold text-primary-900">
            {expanded ? 'פחות' : 'עוד'}
            <ChevronDown className={`h-3.5 w-3.5 transition ${expanded ? 'rotate-180' : ''}`} aria-hidden />
          </span>
        </div>
      ) : null}

      <div className="relative space-y-2">
        {helped.length > 0 ? (
          <p className="text-[11px] font-bold text-primary-800/90">מה עזר לך</p>
        ) : null}
        {(expanded || !showAccordion ? helped : helped.slice(0, 1)).map((m, i) => (
          <JourneyStepRow
            key={`h-${m.strategy}-${m.created_at}-${i}`}
            tone="good"
            title={m.task_title ? `"${m.task_title}"` : 'מה שעזר'}
            body={m.strategy}
            index={i + 1}
          />
        ))}

        {failed.length > 0 && (expanded || !showAccordion) ? (
          <p className="pt-1 text-[11px] font-bold text-accent-900/85">מה שפחות התאים</p>
        ) : null}
        {(expanded || !showAccordion ? failed : []).map((m, i) => (
          <JourneyStepRow
            key={`f-${m.strategy}-${m.created_at}-${i}`}
            tone="warn"
            title={m.task_title ? `"${m.task_title}"` : 'ניסיון'}
            body={m.strategy}
            index={i + 1}
          />
        ))}

        {events.length > 0 && (expanded || !showAccordion || helped.length === 0) ? (
          <div className="pt-1">
            <p className="mb-2 text-[11px] font-bold text-primary-800/90">פעמים אחרונות</p>
            <div className="relative space-y-2 ps-3 before:absolute before:inset-y-1 before:start-[3px] before:w-px before:bg-linear-to-b before:from-iris-300 before:to-primary-200">
              {events.slice(0, expanded ? 4 : 2).map((ev, i) => (
                <div key={ev.id} className="relative flex items-start gap-2 rounded-xl bg-glass/85 backdrop-blur-md px-3 py-2 text-[11px] leading-5 text-ink-700 shadow-[0_1px_3px_rgba(4,47,36,0.06)] ring-1 ring-iris-100">
                  <span className="absolute -start-[13px] top-3 h-2 w-2 shrink-0 rounded-full bg-iris-500 ring-2 ring-on-dark" aria-hidden />
                  <span>
                    <span className="font-bold">{formatHebrewRelative(ev.created_at)}</span>
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
        className="relative mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary-800 hover:text-primary-950"
      >
        לכל הרגעים
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>
  );
}

function JourneyStepRow({
  tone,
  title,
  body,
}: {
  tone: 'good' | 'warn';
  title: string;
  body: string;
  index?: number;
}) {
  const surface =
    tone === 'good' ? 'border-primary-900/10 bg-primary-50/60' : 'border-accent-900/10 bg-accent-50/60';
  const bar = tone === 'good' ? 'bg-primary-600/70' : 'bg-accent-500/70';
  return (
    <div className={`flex gap-3 rounded-2xl border px-3 py-2.5 ${surface}`}>
      <span className={`w-1 shrink-0 rounded-full ${bar}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-black text-primary-950">{title}</p>
        <p className="mt-0.5 text-[11px] leading-5 text-primary-900/75">{body}</p>
      </div>
    </div>
  );
}
