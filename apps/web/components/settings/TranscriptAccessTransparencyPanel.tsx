'use client';

import { Shield } from 'lucide-react';
import { TranscriptAccessCountdown } from '@/components/admin/TranscriptAccessCountdown';
import { cn } from '@/lib/cn';
import type { TranscriptAccessGrant } from '@/lib/module-api/privacy-retention/lib-privacy-transcript-access-grants';

export type { TranscriptAccessGrant };

type TranscriptAccessTransparencyPanelProps = {
  grants: TranscriptAccessGrant[];
  className?: string;
};

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

export function TranscriptAccessTransparencyPanel({
  grants,
  className,
}: TranscriptAccessTransparencyPanelProps) {
  if (!grants.length) return null;

  return (
    <div className={cn('space-y-3', className)} dir="rtl">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-primary-700" />
        <h3 className="text-sm font-black text-ink">מה חשוף לצוות כרגע</h3>
      </div>
      <p className="text-xs leading-relaxed text-ink-soft">
        שקיפות מלאה — כל גישה נרשמת. טבלה זו מתעדכנת אחרי כל אישור או ביטול.
      </p>

      <div className="overflow-hidden rounded-xl border border-[#cfd0d6] bg-glass/80">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#cfd0d6] bg-glass-hi/80 text-ink-600">
              <th className="px-3 py-2 text-start font-bold">מה חשוף</th>
              <th className="px-3 py-2 text-start font-bold whitespace-nowrap">אושר</th>
              <th className="px-3 py-2 text-start font-bold">תוקף</th>
            </tr>
          </thead>
          <tbody>
            {grants.map((grant) => (
              <tr
                key={grant.request_id ?? grant.kind}
                className="border-b border-[#cfd0d6]/60 last:border-0 align-top"
              >
                <td className="px-3 py-3">
                  <p className="font-bold text-ink-900">{grant.label}</p>
                  <ul className="mt-1.5 space-y-0.5 text-ink-600">
                    {grant.exposed.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                  {grant.reason ? (
                    <p className="mt-2 text-[11px] text-ink-500">סיבת הבקשה: {grant.reason}</p>
                  ) : null}
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-ink-600">
                  {fmt(grant.approved_at)}
                </td>
                <td className="px-3 py-3 min-w-36">
                  {grant.kind === 'global' ? (
                    <span className="inline-block rounded-lg border border-primary-200 bg-primary-50 px-2 py-1 font-semibold text-primary-800">
                      עד לביטול
                    </span>
                  ) : grant.access_until ? (
                    <TranscriptAccessCountdown accessUntil={grant.access_until} className="text-[11px]" />
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
