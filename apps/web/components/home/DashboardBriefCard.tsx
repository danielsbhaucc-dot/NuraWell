'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, Heart, RefreshCw, Sparkles, TrendingUp } from 'lucide-react';
import {
  dispatchOpenAlmogChat,
  dispatchOpenAlmogChatWithPrefill,
} from '../../lib/notifications/open-almog-chat';

type CtaAction = 'open_chat' | 'open_journey' | 'open_tasks' | 'open_progress' | 'open_courses';
type Mood = 'celebrate' | 'encourage' | 'gentle' | 'neutral';

type DashboardBrief = {
  headline: string;
  body: string;
  cta_label: string;
  cta_action: CtaAction;
  cta_prompt: string | null;
  mood: Mood;
};

type BriefResponse = {
  brief: DashboardBrief;
  cached?: boolean;
  error?: string;
};

const MOOD_STYLE: Record<
  Mood,
  { from: string; to: string; chip: string; icon: React.ElementType }
> = {
  celebrate: { from: '#047857', to: '#10b981', chip: 'rgba(16,185,129,0.16)', icon: TrendingUp },
  encourage: { from: '#0d9488', to: '#14b8a6', chip: 'rgba(20,184,166,0.16)', icon: Sparkles },
  gentle: { from: '#7c3aed', to: '#a855f7', chip: 'rgba(168,85,247,0.16)', icon: Heart },
  neutral: { from: '#0f766e', to: '#10b981', chip: 'rgba(16,185,129,0.14)', icon: Sparkles },
};

interface DashboardBriefCardProps {
  onOpenTasks: () => void;
}

export function DashboardBriefCard({ onOpenTasks }: DashboardBriefCardProps) {
  const router = useRouter();
  const [brief, setBrief] = useState<DashboardBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/v1/ai/dashboard-brief${refresh ? '?refresh=1' : ''}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        setBrief(null);
        return;
      }
      const json = (await res.json()) as BriefResponse;
      if (json.brief) setBrief(json.brief);
    } catch {
      setBrief(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const handleCta = useCallback(() => {
    if (!brief) return;
    switch (brief.cta_action) {
      case 'open_chat':
        if (brief.cta_prompt) dispatchOpenAlmogChatWithPrefill(brief.cta_prompt);
        else dispatchOpenAlmogChat();
        break;
      case 'open_tasks':
        onOpenTasks();
        break;
      case 'open_journey':
        router.push('/journey');
        break;
      case 'open_progress':
        router.push('/progress');
        break;
      case 'open_courses':
        router.push('/guides');
        break;
    }
  }, [brief, onOpenTasks, router]);

  if (loading) {
    return (
      <div
        dir="rtl"
        className="glass-surface-home relative overflow-hidden p-4"
        style={{ borderRadius: '22px' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-full bg-emerald-200/60 animate-pulse" />
          <div className="h-3 w-28 rounded-full bg-emerald-200/60 animate-pulse" />
        </div>
        <div className="h-3 w-full rounded-full bg-emerald-100/70 animate-pulse mb-2" />
        <div className="h-3 w-4/5 rounded-full bg-emerald-100/70 animate-pulse mb-4" />
        <div className="h-9 w-40 rounded-xl bg-emerald-200/60 animate-pulse" />
      </div>
    );
  }

  if (!brief) return null;

  const style = MOOD_STYLE[brief.mood] ?? MOOD_STYLE.neutral;
  const MoodIcon = style.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      dir="rtl"
      className="glass-surface-home relative overflow-hidden p-4"
      style={{ borderRadius: '22px' }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-4 top-px h-px"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent)',
        }}
      />

      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <div
            className="flex items-center justify-center"
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '11px',
              background: `linear-gradient(145deg, ${style.from}, ${style.to})`,
              boxShadow: `0 4px 12px ${style.chip}`,
            }}
          >
            <MoodIcon className="w-4 h-4 text-white" strokeWidth={2.4} />
          </div>
          <span
            style={{
              fontSize: '13px',
              fontWeight: 800,
              color: '#022c22',
              fontFamily: "'Rubik','Heebo',sans-serif",
            }}
          >
            {brief.headline}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing}
          aria-label="רענן תקציר"
          className="text-emerald-700/50 hover:text-emerald-700 transition"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
        </button>
      </div>

      <p
        style={{
          fontSize: '13.5px',
          lineHeight: 1.6,
          color: '#065f46',
          margin: '0 0 14px',
        }}
      >
        {brief.body}
      </p>

      <button
        type="button"
        onClick={handleCta}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white active:scale-[0.98] transition"
        style={{
          background: `linear-gradient(145deg, ${style.from}, ${style.to})`,
          boxShadow: `0 6px 16px ${style.chip}`,
        }}
      >
        {brief.cta_label}
        <ArrowLeft className="w-4 h-4" aria-hidden />
      </button>
    </motion.div>
  );
}
