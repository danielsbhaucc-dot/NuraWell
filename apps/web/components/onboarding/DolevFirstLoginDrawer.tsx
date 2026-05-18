'use client';

import { useCallback, useEffect, useState } from 'react';
import { Drawer } from 'vaul';
import { motion, AnimatePresence } from 'framer-motion';
import { MentorBubble } from './MentorBubble';
import { markDolevWelcomeSeen } from '@/lib/actions/mark-dolev-welcome-seen';
import { genderCopy } from '@/lib/onboarding/gender-copy';
import {
  buildProfileSummaryRows,
  firstNameFromFull,
  type ProfileSummarySource,
} from '@/lib/onboarding/profile-summary-rows';
import type { OnboardingGender } from '@/lib/onboarding/types';
import {
  REGISTER_DRAWER_BODY_CLASS,
  REGISTER_DRAWER_CONTENT_CLASS,
} from './register-modal-styles';

type DolevFirstLoginDrawerProps = {
  profile: ProfileSummarySource;
};

type Phase = 'intro' | 'user_thanks' | 'dolev_typing' | 'dolev_reply' | 'closing';

export function DolevFirstLoginDrawer({ profile }: DolevFirstLoginDrawerProps) {
  const [open, setOpen] = useState(true);
  const [phase, setPhase] = useState<Phase>('intro');

  const firstName = firstNameFromFull(profile.full_name);
  const gc = genderCopy((profile.gender ?? '') as OnboardingGender | '');
  const rows = buildProfileSummaryRows(profile);

  const closeDrawer = useCallback(async () => {
    setOpen(false);
    await markDolevWelcomeSeen();
  }, []);

  const onThanksClick = () => {
    if (phase !== 'intro') return;
    setPhase('user_thanks');
    window.setTimeout(() => setPhase('dolev_typing'), 600);
    window.setTimeout(() => setPhase('dolev_reply'), 2800);
    window.setTimeout(() => setPhase('closing'), 5200);
    window.setTimeout(() => void closeDrawer(), 6800);
  };

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const introMessage = firstName
    ? `${firstName}, ${gc.welcome} ל-NuraWell! היה לי נחמד להכיר אותך בהרשמה. שמרתי את מה שסיפרת — ואני באמת שמח/ה ש${gc.you} כאן. בהצלחה רבה במסע, בקצב שלך.`
    : `${gc.welcome} ל-NuraWell! היה לי נחמד להכיר אותך. בהצלחה רבה במסע, בקצב שלך.`;

  const replyMessage = firstName
    ? `${firstName}, תודה לך על המילים החמות. אני מרגיש/ה ש${gc.you} בידיים טובות — אלמוג ילווה אותך ברגישות, ואני כאן אם תצטרך/י. הרבה בהצלחה במסע, באמת. 🌿`
    : `תודה על המילים החמות. הרבה בהצלחה במסע — באמת, בקצב שלך. 🌿`;

  return (
    <Drawer.Root open={open} onOpenChange={(v) => !v && void closeDrawer()} direction="bottom" shouldScaleBackground>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[250] bg-black/60 backdrop-blur-[4px]" />
        <Drawer.Content dir="rtl" className={`${REGISTER_DRAWER_CONTENT_CLASS} z-[260] max-h-[min(94dvh,780px)]`}>
          <Drawer.Title className="sr-only">ברכה ראשונה מדולב</Drawer.Title>
          <Drawer.Description className="sr-only">סיכום ההרשמה ושיחה קצרה עם דולב</Drawer.Description>

          <div className="mx-auto mt-3 mb-1 h-1.5 w-12 shrink-0 rounded-full bg-white/25" aria-hidden />

          <div className={REGISTER_DRAWER_BODY_CLASS}>
            <p className="text-center text-xs font-bold text-emerald-300/80 mb-3 tracking-wide">
              הכירות ראשונה · דולב
            </p>

            <ul className="mb-5 grid gap-1.5 rounded-2xl border border-emerald-500/25 bg-gradient-to-b from-emerald-950/80 to-slate-900/90 p-3">
              {rows.map((row) => (
                <li
                  key={row.label}
                  className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2"
                >
                  <span className="text-[11px] font-bold text-emerald-200/60">{row.label}</span>
                  <span className="text-sm font-semibold text-emerald-50 text-left">{row.value}</span>
                </li>
              ))}
            </ul>

            <div className="space-y-4">
              <MentorBubble mentorId="dolev" roleLabel="מנטור הקליטה">
                <p className="text-[15px] leading-relaxed">{introMessage}</p>
              </MentorBubble>

              <AnimatePresence>
                {(phase === 'user_thanks' ||
                  phase === 'dolev_typing' ||
                  phase === 'dolev_reply' ||
                  phase === 'closing') && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-end"
                  >
                    <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-emerald-600/90 px-4 py-3 text-white text-[15px] font-medium shadow-lg">
                      תודה דולב
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {phase === 'dolev_typing' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <MentorBubble mentorId="dolev">
                      <span className="inline-flex gap-1 py-1" aria-label="דולב מקליד">
                        <span className="w-2 h-2 rounded-full bg-emerald-300/80 animate-bounce [animation-delay:0ms]" />
                        <span className="w-2 h-2 rounded-full bg-emerald-300/80 animate-bounce [animation-delay:150ms]" />
                        <span className="w-2 h-2 rounded-full bg-emerald-300/80 animate-bounce [animation-delay:300ms]" />
                      </span>
                    </MentorBubble>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {(phase === 'dolev_reply' || phase === 'closing') && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    <MentorBubble mentorId="dolev">
                      <p className="text-[15px] leading-relaxed">{replyMessage}</p>
                    </MentorBubble>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {phase === 'intro' ? (
              <button
                type="button"
                onClick={onThanksClick}
                className="mt-6 w-full rounded-2xl border border-emerald-400/50 bg-gradient-to-l from-emerald-600/50 to-teal-500/40 py-3.5 font-bold text-white shadow-lg shadow-emerald-500/20 hover:brightness-110 active:scale-[0.98] transition-all"
              >
                תודה דולב
              </button>
            ) : (
              <p className="mt-6 text-center text-xs text-emerald-200/50">רגע אחד...</p>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
