'use client';

import { Shield } from 'lucide-react';
import { TranscriptAccessCountdown } from '@/components/admin/TranscriptAccessCountdown';
import { cn } from '@/lib/cn';
import type { TranscriptAccessGrant } from '@/lib/privacy/transcript-access-grants';

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
        <Shield className="h-4 w-4 text-emerald-700" />
        <h3 className="text-sm font-black text-slate-900">מה חשוף לצוות כרגע</h3>
      </div>
      <p className="text-xs leading-relaxed text-slate-600">
        שקיפות מלאה — כל גישה נרשמת. טבלה זו מתעדכנת אחרי כל אישור או ביטול.
      </p>

      <div className="overflow-hidden rounded-xl border border-[#E8D5B5] bg-[#FFFBF5]">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#E8D5B5] bg-[#FFF5E6]/80 text-stone-600">
              <th className="px-3 py-2 text-right font-bold">מה חשוף</th>
              <th className="px-3 py-2 text-right font-bold whitespace-nowrap">אושר</th>
              <th className="px-3 py-2 text-right font-bold">תוקף</th>
            </tr>
          </thead>
          <tbody>
            {grants.map((grant) => (
              <tr
                key={grant.request_id ?? grant.kind}
                className="border-b border-[#E8D5B5]/60 last:border-0 align-top"
              >
                <td className="px-3 py-3">
                  <p className="font-bold text-stone-900">{grant.label}</p>
                  <ul className="mt-1.5 space-y-0.5 text-stone-600">
                    {grant.exposed.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                  {grant.reason ? (
                    <p className="mt-2 text-[11px] text-stone-500">סיבת הבקשה: {grant.reason}</p>
                  ) : null}
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-stone-600">
                  {fmt(grant.approved_at)}
                </td>
                <td className="px-3 py-3 min-w-[9rem]">
                  {grant.kind === 'global' ? (
                    <span className="inline-block rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 font-semibold text-emerald-800">
                      עד שתבטל/י
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
