'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Award, Sparkles, Trophy } from 'lucide-react';
import type { ChallengeCompletionSummary } from '@/lib/challenge/types';
import { challengeFadeUp } from '@/lib/challenge/motion';
import { useReducedMotion } from '@/lib/client/useReducedMotion';
import { ChallengeShareCard } from './ChallengeShareCard';

type Props = {
  firstName: string;
  initialSummary: ChallengeCompletionSummary | null;
};

export function ChallengeCompleteClient({ firstName, initialSummary }: Props) {
  const router = useRouter();
  const [summary] = useState(initialSummary);
  const [finishing, setFinishing] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    fetch('/api/v1/challenge/complete', { method: 'POST', credentials: 'include' }).catch(() => {});
  }, []);

  const finish = async () => {
    setFinishing(true);
    await fetch('/api/v1/challenge/complete', { method: 'POST', credentials: 'include' });
    router.push('/home');
  };

  return (
    <div
      className="relative min-h-[100dvh] overflow-hidden bg-gradient-to-b from-[#0a1628] via-[#1a1035] to-[#05010f] px-4 py-10 text-white"
      dir="rtl"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-20 h-80 w-80 -translate-x-1/2 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute bottom-20 right-1/4 h-64 w-64 rounded-full bg-amber-500/15 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-lg text-center">
        <motion.div
          {...challengeFadeUp(reducedMotion, 0)}
          className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-emerald-500 shadow-lg shadow-emerald-600/30"
        >
          <Award className="h-10 w-10 text-white" />
        </motion.div>

        <motion.h1
          {...challengeFadeUp(reducedMotion, 0.1)}
          className="font-display text-3xl font-black"
        >
          {firstName}, סיימת את האתגר!
        </motion.h1>

        <motion.p
          {...challengeFadeUp(reducedMotion, 0.2)}
          className="mt-4 leading-relaxed text-white/75"
        >
          {summary?.message ??
            '14 יום של צעדים קטנים — וכל אחד מהם נספר. אלמוג גאה בך.'}
        </motion.p>

        {summary ? (
          <motion.div
            {...challengeFadeUp(reducedMotion, 0.3)}
            className="mt-8 grid grid-cols-3 gap-3"
          >
            {[
              { label: 'ימים פעילים', value: summary.days_active, icon: Sparkles },
              { label: 'משימות', value: summary.total_task_completions, icon: Trophy },
              { label: 'הצלחות', value: summary.total_success_events, icon: Award },
            ].map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-md"
              >
                <Icon className="mx-auto mb-2 h-5 w-5 text-emerald-300" />
                <div className="font-display text-2xl font-black">{value}</div>
                <div className="mt-1 text-xs text-white/45">{label}</div>
              </div>
            ))}
          </motion.div>
        ) : null}

        {summary?.top_successes?.length ? (
          <motion.ul
            {...challengeFadeUp(reducedMotion, 0.4)}
            className="mt-8 space-y-2 text-right"
          >
            {summary.top_successes.map((s) => (
              <li
                key={s.title}
                className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm"
              >
                <span className="font-semibold text-emerald-200">{s.title}</span>
                {s.description ? (
                  <p className="mt-1 text-white/50">{s.description}</p>
                ) : null}
              </li>
            ))}
          </motion.ul>
        ) : null}

        {summary ? <ChallengeShareCard firstName={firstName} summary={summary} /> : null}

        <motion.button
          type="button"
          disabled={finishing}
          onClick={finish}
          {...challengeFadeUp(reducedMotion, 0.5)}
          className="mt-10 w-full rounded-2xl bg-emerald-500 py-4 font-bold shadow-lg shadow-emerald-600/25 disabled:opacity-60"
        >
          {finishing ? 'רגע...' : 'המשך ל-NuraWell'}
        </motion.button>
      </div>
    </div>
  );
}
