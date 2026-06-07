'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, LineChart, MessageCircle, TrendingDown, TrendingUp } from 'lucide-react';
import { dispatchOpenAlmogChatWithPrefill } from '../../lib/notifications/open-almog-chat';

type Tone = 'positive' | 'plateau' | 'concern' | 'neutral';

type Insight = {
  summary: string;
  checklist: string[];
  tone: Tone;
};

type Stats = {
  count: number;
  latestKg: number | null;
  changeKg: number | null;
  goalKg: number | null;
  plateau: boolean;
};

const TONE_STYLE: Record<Tone, { from: string; to: string; icon: React.ElementType }> = {
  positive: { from: '#047857', to: '#10b981', icon: TrendingDown },
  plateau: { from: '#0d9488', to: '#14b8a6', icon: LineChart },
  concern: { from: '#b45309', to: '#f59e0b', icon: TrendingUp },
  neutral: { from: '#0f766e', to: '#10b981', icon: LineChart },
};

export function WeightTrendInsightCard() {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/v1/ai/trend-insights', { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as { insight?: Insight | null; stats?: Stats };
        if (!alive) return;
        if (json.insight) setInsight(json.insight);
        if (json.stats) setStats(json.stats);
      } catch {
        /* silent */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // אין מספיק נתונים — מציעים להזין משקל דרך שיחה (חלופת "ספר לאלמוג")
  if (!loading && !insight) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        dir="rtl"
        className="p-4"
        style={{
          borderRadius: 22,
          background:
            'linear-gradient(170deg, rgba(236,253,245,0.82) 0%, rgba(220,252,231,0.72) 55%, rgba(254,252,232,0.68) 100%)',
          border: '1px solid rgba(167,243,208,0.55)',
          boxShadow: '0 12px 40px rgba(6,78,59,0.08)',
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <LineChart className="w-4 h-4 text-emerald-700" />
          <span className="text-sm font-black text-[#1A1730]">מעקב משקל</span>
        </div>
        <p className="text-[13px] text-gray-600 leading-relaxed mb-3">
          עוד אין מספיק מדידות לניתוח מגמה. אפשר פשוט לכתוב לאלמוג את המשקל — בלי טפסים.
        </p>
        <button
          type="button"
          onClick={() => dispatchOpenAlmogChatWithPrefill('אלמוג, אני שוקל היום ')}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold transition active:scale-[0.98]"
          style={{
            background: 'rgba(16,185,129,0.1)',
            color: '#047857',
            border: '1px solid rgba(16,185,129,0.25)',
          }}
        >
          <MessageCircle className="w-4 h-4" />
          ספר לאלמוג את המשקל
        </button>
      </motion.div>
    );
  }

  if (loading) {
    return (
      <div
        dir="rtl"
        className="p-4"
        style={{
          borderRadius: 22,
          background: 'rgba(220,252,231,0.5)',
          border: '1px solid rgba(167,243,208,0.45)',
        }}
      >
        <div className="h-3 w-28 rounded-full bg-emerald-200/60 animate-pulse mb-3" />
        <div className="h-3 w-full rounded-full bg-emerald-100/70 animate-pulse mb-2" />
        <div className="h-3 w-3/4 rounded-full bg-emerald-100/70 animate-pulse" />
      </div>
    );
  }

  if (!insight) return null;

  const style = TONE_STYLE[insight.tone] ?? TONE_STYLE.neutral;
  const ToneIcon = style.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      dir="rtl"
      className="p-4"
      style={{
        borderRadius: 22,
        background:
          'linear-gradient(170deg, rgba(236,253,245,0.85) 0%, rgba(220,252,231,0.75) 55%, rgba(254,252,232,0.7) 100%)',
        border: '1px solid rgba(167,243,208,0.6)',
        boxShadow: '0 12px 40px rgba(6,78,59,0.1), inset 0 1px 0 rgba(236,253,245,0.9)',
      }}
    >
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <div
            className="flex items-center justify-center"
            style={{
              width: 30,
              height: 30,
              borderRadius: 11,
              background: `linear-gradient(145deg, ${style.from}, ${style.to})`,
            }}
          >
            <ToneIcon className="w-4 h-4 text-white" strokeWidth={2.4} />
          </div>
          <span className="text-sm font-black text-[#1A1730]">תובנת משקל מאלמוג</span>
        </div>
        {stats?.latestKg != null ? (
          <span className="text-[12px] font-bold text-emerald-800 tabular-nums">
            {stats.latestKg} ק&quot;ג
          </span>
        ) : null}
      </div>

      <p className="text-[13.5px] text-emerald-900 leading-relaxed mb-3">{insight.summary}</p>

      {insight.checklist.length > 0 ? (
        <ul className="space-y-1.5 mb-3">
          {insight.checklist.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-[12.5px] text-emerald-800">
              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" strokeWidth={3} />
              <span className="leading-snug">{c}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        onClick={() =>
          dispatchOpenAlmogChatWithPrefill('אלמוג, בוא נדבר על מגמת המשקל שלי')
        }
        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold transition active:scale-[0.98]"
        style={{
          background: 'rgba(16,185,129,0.1)',
          color: '#047857',
          border: '1px solid rgba(16,185,129,0.25)',
        }}
      >
        <MessageCircle className="w-4 h-4" />
        דבר עם אלמוג
      </button>
    </motion.div>
  );
}
