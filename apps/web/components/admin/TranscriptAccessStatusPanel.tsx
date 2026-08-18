'use client';

import { CheckCircle2, Circle, Clock, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import type {
  TranscriptAccessInsight,
  TranscriptAccessTimelineStep,
} from '@/lib/admin/transcript-access-timeline';

function fmt(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('he-IL', {
      timeZone: 'Asia/Jerusalem',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function StepIcon({ status }: { status: TranscriptAccessTimelineStep['status'] }) {
  switch (status) {
    case 'done':
      return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />;
    case 'active':
      return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-600" />;
    case 'failed':
      return <XCircle className="h-4 w-4 shrink-0 text-rose-600" />;
    case 'skipped':
      return <Circle className="h-4 w-4 shrink-0 text-slate-300" />;
    default:
      return <Clock className="h-4 w-4 shrink-0 text-slate-400" />;
  }
}

const INSIGHT_STYLES: Record<TranscriptAccessInsight['tone'], string> = {
  success: 'border-emerald-200 bg-emerald-50/90 text-emerald-900',
  info: 'border-sky-200 bg-sky-50/90 text-sky-900',
  warning: 'border-amber-200 bg-amber-50/90 text-amber-900',
  neutral: 'border-stone-200 bg-[#FFFBF5] text-stone-700',
};

type TranscriptAccessStatusPanelProps = {
  timeline: TranscriptAccessTimelineStep[];
  insight: TranscriptAccessInsight | null;
  showSuccess?: boolean;
  successMessage?: string | null;
};

export function TranscriptAccessStatusPanel({
  timeline,
  insight,
  showSuccess = false,
  successMessage,
}: TranscriptAccessStatusPanelProps) {
  if (!timeline.length && !showSuccess) return null;

  return (
    <div className="space-y-2">
      {showSuccess && successMessage ? (
        <div
          className="flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-emerald-900"
          role="status"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div>
            <p className="text-sm font-bold">הבקשה נשלחה בהצלחה</p>
            <p className="text-xs leading-relaxed text-emerald-800/90">{successMessage}</p>
          </div>
        </div>
      ) : null}

      {insight ? (
        <p className={cn('rounded-lg border px-2.5 py-2 text-xs leading-relaxed', INSIGHT_STYLES[insight.tone])}>
          {insight.text}
        </p>
      ) : null}

      {timeline.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-[#E8D5B5] bg-[#FFFBF5]">
          <div className="border-b border-[#E8D5B5] bg-[#FFF5E6]/80 px-3 py-1.5 text-xs font-bold text-stone-700">
            מעקב סטטוס בקשה
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#E8D5B5]/80 text-stone-500">
                <th className="px-2 py-1.5 text-right font-semibold w-8" aria-label="סטטוס" />
                <th className="px-2 py-1.5 text-right font-semibold">שלב</th>
                <th className="px-2 py-1.5 text-right font-semibold whitespace-nowrap">תאריך ושעה</th>
                <th className="px-2 py-1.5 text-right font-semibold">פרטים</th>
              </tr>
            </thead>
            <tbody>
              {timeline.map((step) => (
                <tr
                  key={step.key}
                  className={cn(
                    'border-b border-[#E8D5B5]/50 last:border-0',
                    step.status === 'active' && 'bg-amber-50/50',
                    step.status === 'failed' && 'bg-rose-50/40',
                  )}
                >
                  <td className="px-2 py-2">
                    <StepIcon status={step.status} />
                  </td>
                  <td className="px-2 py-2 font-medium text-stone-800">{step.label}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-stone-500">{fmt(step.at)}</td>
                  <td className="px-2 py-2 text-stone-600 max-w-[12rem] truncate" title={step.detail ?? undefined}>
                    {step.detail ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
