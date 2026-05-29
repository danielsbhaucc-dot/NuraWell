'use client';

/**
 * GenerateSummaryButton — כפתור "צור סיכום עכשיו" לרמה מסוימת.
 *
 * זה client component שמדבר עם POST /api/summaries/generate.
 * אימות עובר אוטומטית דרך עוגיות ה-session (createSupabaseForApiRoute קורא
 * אותן ב-route). אין צורך לשלוח Authorization header ידנית.
 *
 * UX:
 *   • Idle    → צבע tone לפי הסוג + label "+ צור סיכום <יומי/שבועי/...>"
 *   • Loading → spinner + "מכין סיכום…" (8-30s כי ה-LLM עובד)
 *   • Done    → toast הצלחה + onGenerated callback (לרענון נתונים)
 *   • Error   → toast שגיאה + הכפתור חוזר ל-Idle.
 *
 * Cascade hint: לחיצה על "צור סיכום שנתי" כשאין מתחת כלום עשויה לקחת
 * הרבה זמן (LLM פר רמה תחתונה). UI מציג רק spinner — אין eta מדויק.
 */

import { Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SummaryType } from '../../lib/notifications/summaries/period-keys';
import { TYPE_COLORS } from './SummaryCard';

const TYPE_LABEL_HE: Record<SummaryType, string> = {
  daily: 'יומי',
  weekly: 'שבועי',
  monthly: 'חודשי',
  quarterly: 'רבעוני',
  semi_annual: 'חצי-שנתי',
  annual: 'שנתי',
};

interface GenerateSummaryButtonProps {
  userId: string;
  type: SummaryType;
  periodKey: string;
  /** Called when the API responds OK. Used by parent to show a toast + refresh. */
  onSuccess?: (insight: string) => void;
  /** Called when the API responds with an error. */
  onError?: (message: string) => void;
}

export function GenerateSummaryButton({
  userId,
  type,
  periodKey,
  onSuccess,
  onError,
}: GenerateSummaryButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const colors = TYPE_COLORS[type];
  const Icon = colors.icon;

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/summaries/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, type, periodKey }),
        // session cookie מתווסף אוטומטית ע"י הדפדפן.
        credentials: 'same-origin',
      });

      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        summary?: { ai_insight?: string };
      };

      if (!res.ok || json.ok !== true) {
        const msg = json.error ?? `שגיאה (${res.status})`;
        onError?.(msg);
        return;
      }

      onSuccess?.(json.summary?.ai_insight ?? '');
      // רענון Server Component כדי שהסיכום החדש יופיע ברשימה.
      router.refresh();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'תקלת רשת');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      aria-busy={loading}
      aria-label={`צור סיכום ${TYPE_LABEL_HE[type]} ל-${periodKey}`}
      className={`group relative w-full flex flex-col items-stretch gap-2 p-3 rounded-2xl
        ring-1 ${colors.ring} ${colors.bg}
        text-right transition-all
        hover:shadow-md hover:-translate-y-0.5
        active:translate-y-0
        disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0
        focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2`}
    >
      <span className="flex items-center justify-between gap-2">
        <span
          className={`w-9 h-9 rounded-xl ${colors.accent} text-white flex items-center justify-center shadow-sm`}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.6} />
          ) : (
            <Icon className="w-4 h-4" strokeWidth={2.6} />
          )}
        </span>
        <span className="flex-1 min-w-0">
          <span className={`block text-xs font-bold ${colors.text}`}>סיכום {TYPE_LABEL_HE[type]}</span>
          <span className="block text-[11px] text-gray-500 truncate">{periodKey}</span>
        </span>
      </span>

      <span className="flex items-center justify-end gap-1.5 text-[11px] font-bold text-gray-700">
        {loading ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>מכין סיכום…</span>
          </>
        ) : (
          <>
            <Sparkles className="w-3 h-3" />
            <span>צור עכשיו</span>
          </>
        )}
      </span>
    </button>
  );
}
