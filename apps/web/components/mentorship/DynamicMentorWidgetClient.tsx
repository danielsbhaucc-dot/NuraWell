'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

import type {
  PendingTaskTodayRow,
} from '../../lib/journey/journey-report-parse';

type DashboardBrief = {
  headline: string;
  body: string;
};

type DynamicMentorWidgetClientProps = {
  firstName: string;
  nextBestAction: string;
  isSensitiveState: boolean;
};

export function DynamicMentorWidgetClient({
  firstName,
  nextBestAction,
  isSensitiveState,
}: DynamicMentorWidgetClientProps) {
  // Root cause of the "slow" card: a /home dedupe refactor stopped calling the snapshot loader but left
  // `loading` initialised to true, so the skeleton never resolved. The card now renders the server-provided
  // next-best-action immediately (the hero already shows today's task; DashboardBriefCard shows the brief).
  const nextTask = null as PendingTaskTodayRow | null;
  const brief = null as DashboardBrief | null;
  const loading = false;

  const name = firstName && firstName !== 'משתמש' ? firstName : null;

  const { title, subtitle, detail } = useMemo(() => {
    const friendlyLead = name ? `${name}, ` : '';

    if (nextTask?.title) {
      const timeHint = nextTask.pendingSlots?.length
        ? nextTask.pendingSlots[0] === 'morning'
          ? 'לבוקר'
          : nextTask.pendingSlots[0] === 'evening'
            ? 'לערב'
            : 'להיום'
        : null;
      return {
        title: isSensitiveState
          ? `${nextTask.emoji ? `${nextTask.emoji} ` : ''}${nextTask.title}`
          : nextTask.title,
        subtitle: isSensitiveState ? 'צעד קטן להיום' : 'הפעולה הבאה שלך',
        detail: timeHint
          ? `${friendlyLead}נראה לי ש${timeHint} זה הזמן הכי נוח — בלי לחץ, רק צעד אחד.`
          : `${friendlyLead}ניקח יחד רגע אחד קטן. אני איתך.`,
      };
    }

    if (brief?.headline) {
      return {
        title: brief.headline,
        subtitle: isSensitiveState ? 'צעד קטן להיום' : 'הפעולה הבאה שלך',
        detail:
          brief.body.split('.').slice(0, 2).join('.').trim() ||
          `${friendlyLead}${nextBestAction}`,
      };
    }

    return {
      title: nextBestAction,
      subtitle: isSensitiveState ? 'צעד קטן להיום' : 'הפעולה הבאה שלך',
      detail: name
        ? `${name}, אני כאן — ניקח יחד רגע אחד קטן, בקצב שלך.`
        : 'אני כאן — ניקח יחד רגע אחד קטן, בקצב שלך.',
    };
  }, [nextTask, brief, nextBestAction, isSensitiveState, name]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' as const }}
      dir="rtl"
      className="glass-surface-home rounded-[22px] p-4"
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
          style={{
            background: 'linear-gradient(145deg, rgba(4,120,87,0.88), rgba(16,185,129,0.82))',
            boxShadow: '0 6px 16px rgba(4,120,87,0.22), inset 0 1px 0 rgba(255,255,255,0.25)',
          }}
        >
          <Sparkles className="h-5 w-5 text-on-dark" strokeWidth={2.2} aria-hidden />
        </div>

        <div className="min-w-0 flex-1 text-start">
          <p
            className="text-[10px] font-bold uppercase tracking-wider text-primary-900/55"
            style={{ letterSpacing: '1px' }}
          >
            {subtitle}
          </p>
          {loading ? (
            <div className="mt-2 space-y-2">
              <div className="h-4 w-4/5 animate-pulse rounded-lg bg-primary-900/10" />
              <div className="h-3 w-full animate-pulse rounded-lg" />
            </div>
          ) : (
            <>
              <p
                className="mt-1.5 text-[15px] font-extrabold leading-snug text-primary-950"
                style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
              >
                {title}
              </p>
              {detail ? (
                <p className="mt-2 text-[12px] leading-relaxed">{detail}</p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
