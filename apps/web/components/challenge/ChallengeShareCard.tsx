'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Share2 } from 'lucide-react';
import type { ChallengeCompletionSummary } from '@/lib/challenge/types';

type Props = {
  firstName: string;
  summary: ChallengeCompletionSummary;
};

export function ChallengeShareCard({ firstName, summary }: Props) {
  const [copied, setCopied] = useState(false);

  const shareText = [
    `${firstName} סיימ/ה את אתגר 14 הימים של NuraWell! 🏆`,
    `${summary.days_active} ימים פעילים · ${summary.total_task_completions} משימות · ${summary.total_success_events} הצלחות`,
    summary.message,
    'https://nurawell.vercel.app',
  ].join('\n\n');

  const share = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'סיימתי את האתגר!', text: shareText });
        return;
      } catch {
        /* user cancelled */
      }
    }
    await navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-8 overflow-hidden rounded-3xl border border-amber-400/30 bg-gradient-to-br from-amber-500/15 to-emerald-500/10 p-6 text-center"
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-amber-300/80">תעודת סיום</p>
      <p className="mt-2 font-display text-xl font-black">{firstName}</p>
      <p className="mt-1 text-sm text-white/60">אתגר 14 יום — Reset</p>
      <div className="mt-4 flex justify-center gap-6 text-center">
        <div>
          <div className="font-display text-2xl font-black text-emerald-300">{summary.days_active}</div>
          <div className="text-[10px] text-white/40">ימים</div>
        </div>
        <div>
          <div className="font-display text-2xl font-black text-emerald-300">
            {summary.total_task_completions}
          </div>
          <div className="text-[10px] text-white/40">משימות</div>
        </div>
        <div>
          <div className="font-display text-2xl font-black text-emerald-300">
            {summary.total_success_events}
          </div>
          <div className="text-[10px] text-white/40">הצלחות</div>
        </div>
      </div>
      <button
        type="button"
        onClick={share}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/15"
      >
        <Share2 className="h-4 w-4" />
        {copied ? 'הועתק!' : 'שתף את ההישג'}
      </button>
    </motion.div>
  );
}
