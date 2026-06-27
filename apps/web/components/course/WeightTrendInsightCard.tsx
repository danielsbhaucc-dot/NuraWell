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

const TONE_STYLE: Record<Tone, { iconBg: string; iconColor: string; icon: React.ElementType }> = {
  positive: { iconBg: 'rgba(20,184,166,0.12)', iconColor: '#0f766e', icon: TrendingDown },
  plateau: { iconBg: 'rgba(99,102,241,0.10)', iconColor: '#6366f1', icon: LineChart },
  concern: { iconBg: 'rgba(245,158,11,0.12)', iconColor: '#d97706', icon: TrendingUp },
  neutral: { iconBg: 'rgba(139,92,246,0.10)', iconColor: '#7c3aed', icon: LineChart },
};

function ChatButton({ label, prefill }: { label: string; prefill: string }) {
  return (
    <button
      type="button"
      onClick={() => dispatchOpenAlmogChatWithPrefill(prefill)}
      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold text-[#0f766e] bg-teal-500/[0.08] border border-teal-500/20 transition active:scale-[0.98]"
    >
      <MessageCircle className="w-4 h-4" />
      {label}
    </button>
  );
}

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

  if (loading) {
    return (
      <div dir="rtl" className="crystal-surface rounded-3xl p-4">
        <div className="h-3 w-28 rounded-full bg-black/[0.06] animate-pulse mb-3" />
        <div className="h-3 w-full rounded-full bg-black/[0.04] animate-pulse mb-2" />
        <div className="h-3 w-3/4 rounded-full bg-black/[0.04] animate-pulse" />
      </div>
    );
  }

  if (!insight) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        dir="rtl"
        className="crystal-surface rounded-3xl p-4"
      >
        <div className="flex items-center gap-2 mb-2">
          <div
            className="flex items-center justify-center w-8 h-8 rounded-xl"
            style={{ background: 'rgba(99,102,241,0.10)' }}
          >
            <LineChart className="w-4 h-4 text-indigo-500" />
          </div>
          <span className="text-sm font-black text-[#1A1730]">מעקב משקל</span>
        </div>
        <p className="text-[13px] text-[#9896B8] leading-relaxed mb-3">
          עוד אין מספיק מדידות לניתוח מגמה. אפשר פשוט לכתוב לאלמוג את המשקל — בלי טפסים.
        </p>
        <ChatButton label="ספר לאלמוג את המשקל" prefill="אלמוג, אני שוקל היום " />
      </motion.div>
    );
  }

  const style = TONE_STYLE[insight.tone] ?? TONE_STYLE.neutral;
  const ToneIcon = style.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      dir="rtl"
      className="crystal-surface rounded-3xl p-4"
    >
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <div
            className="flex items-center justify-center w-8 h-8 rounded-xl"
            style={{ background: style.iconBg }}
          >
            <ToneIcon className="w-4 h-4" style={{ color: style.iconColor }} strokeWidth={2.4} />
          </div>
          <span className="text-sm font-black text-[#1A1730]">תובנת משקל מאלמוג</span>
        </div>
        {stats?.latestKg != null ? (
          <span className="text-[12px] font-bold text-[#9896B8] tabular-nums">
            {stats.latestKg} ק&quot;ג
          </span>
        ) : null}
      </div>

      <p className="text-[13.5px] text-[#1A1730]/80 leading-relaxed mb-3">{insight.summary}</p>

      {insight.checklist.length > 0 ? (
        <ul className="space-y-1.5 mb-3">
          {insight.checklist.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-[12.5px] text-[#9896B8]">
              <Check className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" strokeWidth={3} />
              <span className="leading-snug">{c}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <ChatButton
        label="דבר עם אלמוג"
        prefill="אלמוג, בוא נדבר על מגמת המשקל שלי"
      />
    </motion.div>
  );
}
