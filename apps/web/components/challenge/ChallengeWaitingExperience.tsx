'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Clock, Sparkles, Users } from 'lucide-react';
import { getMentorAvatarUrl } from '@/lib/mentors/avatar-url';
import { MENTORS } from '@/lib/mentors/registry';
import type { ChallengeStateResponse } from '@/lib/challenge/types';
import {
  excitedAlmogLine,
  firstNameFromFullName,
  genderFromProfile,
  waitingHeadline,
} from '@/lib/challenge/gender-copy';
import { challengeFadeUp } from '@/lib/challenge/motion';
import { useReducedMotion } from '@/lib/client/useReducedMotion';

type Props = {
  firstName: string;
  gender: string | null;
  initialState: ChallengeStateResponse;
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function ChallengeWaitingExperience({ firstName, gender, initialState }: Props) {
  const g = genderFromProfile(gender);
  const name = firstName || firstNameFromFullName(null);
  const almogUrl = getMentorAvatarUrl(MENTORS.almog);

  const [countdown, setCountdown] = useState(initialState.countdown_to_start);
  const [state] = useState(initialState);
  const [participants, setParticipants] = useState<number | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!state.enrollment?.challenge_start_date) return;

    const tick = () => {
      fetch('/api/v1/challenge/state', { credentials: 'include' })
        .then((r) => r.json())
        .then((s: ChallengeStateResponse & { public_stats?: { active_participants: number } }) => {
          if (s.countdown_to_start) setCountdown(s.countdown_to_start);
          if (s.public_stats?.active_participants) {
            setParticipants(s.public_stats.active_participants);
          }
          if (s.phase !== 'waiting') {
            window.location.href = '/challenge/intro';
          }
        })
        .catch(() => {});
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state.enrollment?.challenge_start_date]);

  const cd = countdown ?? { days: 0, hours: 0, minutes: 0, seconds: 0 };

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#05010f] text-white" dir="rtl">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-violet-600/20 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-lg flex-col px-5 pb-10 pt-8">
        {state.is_demo ? (
          <div className="mb-4 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-100">
            מצב דמו — תצוגה מקדימה למנהל בלבד
          </div>
        ) : null}

        <motion.div
          {...challengeFadeUp(reducedMotion, 0)}
          className="flex flex-col items-center text-center"
        >
          <div className="relative mb-5 h-28 w-28 overflow-hidden rounded-full ring-4 ring-emerald-400/50 ring-offset-4 ring-offset-[#05010f]">
            <Image src={almogUrl} alt="אלמוג" fill className="object-cover" priority />
          </div>
          <Sparkles className="mb-2 h-6 w-6 text-emerald-400" />
          <h1 className="font-display text-2xl font-black sm:text-3xl">{waitingHeadline(name, g)}</h1>
          <p className="mt-3 max-w-sm text-base leading-relaxed text-white/75">
            {excitedAlmogLine(name, g)}
          </p>
        </motion.div>

        <motion.div
          {...challengeFadeUp(reducedMotion, 0.15)}
          className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl"
        >
          <div className="mb-4 flex items-center justify-center gap-2 text-emerald-300">
            <Clock className="h-5 w-5" />
            <span className="text-sm font-semibold">האתגר מתחיל ביום ראשון</span>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: 'ימים', value: cd.days },
              { label: 'שעות', value: cd.hours },
              { label: 'דקות', value: cd.minutes },
              { label: 'שניות', value: cd.seconds },
            ].map((unit) => (
              <div
                key={unit.label}
                className="rounded-2xl bg-black/30 px-2 py-4 shadow-inner shadow-emerald-500/10"
              >
                <div className="font-display text-3xl font-black tabular-nums text-white">
                  {pad(unit.value)}
                </div>
                <div className="mt-1 text-xs text-white/50">{unit.label}</div>
              </div>
            ))}
          </div>
          {state.enrollment ? (
            <p className="mt-4 text-center text-xs text-white/45">
              תאריך התחלה: {state.enrollment.challenge_start_date}
            </p>
          ) : null}
        </motion.div>

        {participants && participants > 1 ? (
          <motion.p
            {...challengeFadeUp(reducedMotion, 0.25)}
            className="mt-6 flex items-center justify-center gap-2 text-sm text-emerald-200/80"
          >
            <Users className="h-4 w-4" />
            {participants} משתתפים באתגר הזה עכשיו
          </motion.p>
        ) : null}

        {state.is_demo && state.enrollment?.demo_scenario === 'full' ? (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={async () => {
                await fetch('/api/v1/challenge/demo-skip-wait', {
                  method: 'POST',
                  credentials: 'include',
                });
                window.location.href = '/challenge/intro';
              }}
              className="rounded-2xl border border-violet-400/50 bg-violet-500/20 px-6 py-3 text-sm font-bold text-violet-100 backdrop-blur-md transition hover:bg-violet-500/30"
            >
              דמו — התחל את האתגר עכשיו →
            </button>
            <p className="mt-2 text-xs text-white/40">מדלג על ספירה לאחור — להמשך חוויה מלאה</p>
          </div>
        ) : null}

        <div className="mt-auto pt-10 text-center text-sm text-white/40">
          עד אז — המערכת נעולה. רק אתה, אלמוג, והציפייה לשינוי.
        </div>
      </div>
    </div>
  );
}
