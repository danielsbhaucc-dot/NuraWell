'use client';

import { useCallback, useEffect, useState } from 'react';
import { Drawer } from 'vaul';
import { motion, AnimatePresence } from 'framer-motion';
import { useAlmogAvatarUrl } from '@/lib/client/useAlmogAvatarUrl';
import { ALMOG_AVATAR_FALLBACK } from '@/lib/ai/almog-avatar';
import { markAlmogWelcomeSeen } from '@/lib/actions/mark-almog-welcome-seen';
import { genderCopy } from '@/lib/onboarding/gender-copy';
import { firstNameFromFull, type ProfileSummarySource } from '@/lib/onboarding/profile-summary-rows';
import type { OnboardingGender } from '@/lib/onboarding/types';
import {
  REGISTER_DRAWER_BODY_CLASS,
  REGISTER_DRAWER_CONTENT_CLASS,
} from './register-modal-styles';

type AlmogFirstLoginDrawerProps = {
  profile: ProfileSummarySource;
};

type Phase = 'intro' | 'user_reply' | 'almog_typing' | 'almog_reply' | 'closing';

export function AlmogFirstLoginDrawer({ profile }: AlmogFirstLoginDrawerProps) {
  const [open, setOpen] = useState(true);
  const [phase, setPhase] = useState<Phase>('intro');
  const { avatarUrl } = useAlmogAvatarUrl();

  const firstName = firstNameFromFull(profile.full_name);
  const gc = genderCopy((profile.gender ?? '') as OnboardingGender | '');

  const closeDrawer = useCallback(async () => {
    setOpen(false);
    await markAlmogWelcomeSeen();
  }, []);

  const onStartClick = () => {
    if (phase !== 'intro') return;
    setPhase('user_reply');
    window.setTimeout(() => setPhase('almog_typing'), 500);
    window.setTimeout(() => setPhase('almog_reply'), 2400);
    window.setTimeout(() => setPhase('closing'), 4800);
    window.setTimeout(() => void closeDrawer(), 6200);
  };

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const introMessage = firstName
    ? `${firstName}, היי — אני אלמוג 🌿 דולב סיפר לי עליך. מכאן אני איתך בצ'אט ובהתראות, בקצב ${gc.your}, בלי לחץ.`
    : `היי — אני אלמוג 🌿 מכאן אני איתך בצ'אט ובהתראות, בקצב ${gc.your}.`;

  const replyMessage = firstName
    ? `מעולה ${firstName}. כשמשהו לא יוצא — תכתוב לי במשפט, לא צריך לסמן V. נחשוב יחד על צעד קטן. מוכן/ה?`
    : `מעולה. כשמשהו לא יוצא — תכתוב לי במשפט. נחשוב יחד על צעד קטן.`;

  return (
    <Drawer.Root open={open} onOpenChange={(v) => !v && void closeDrawer()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[200] bg-black/50" />
        <Drawer.Content
          className={REGISTER_DRAWER_CONTENT_CLASS}
          style={{ maxHeight: '92vh' }}
        >
          <div className={REGISTER_DRAWER_BODY_CLASS}>
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-emerald-200" />

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3"
            >
              <img
                src={avatarUrl}
                alt="אלמוג"
                className="h-14 w-14 rounded-2xl border-2 border-emerald-200 object-cover shadow-md"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = ALMOG_AVATAR_FALLBACK;
                }}
              />
              <div>
                <p className="text-lg font-black text-emerald-900">אלמוג</p>
                <p className="text-sm text-emerald-700">המנטור האישי שלך</p>
              </div>
            </motion.div>

            <AnimatePresence mode="wait">
              {(phase === 'intro' || phase === 'almog_reply' || phase === 'closing') && (
                <motion.div
                  key="almog-bubble"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-right text-[15px] leading-relaxed text-emerald-950"
                >
                  {phase === 'intro' ? introMessage : replyMessage}
                </motion.div>
              )}

              {phase === 'user_reply' && (
                <motion.div
                  key="user-bubble"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="mt-4 mr-auto max-w-[85%] rounded-2xl bg-white px-4 py-3 text-right text-sm text-gray-800 shadow-sm ring-1 ring-emerald-100"
                >
                  כן, בוא נתחיל 💪
                </motion.div>
              )}

              {phase === 'almog_typing' && (
                <motion.p
                  key="typing"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-4 text-sm text-emerald-600"
                >
                  אלמוג מקליד...
                </motion.p>
              )}
            </AnimatePresence>

            {phase === 'intro' && (
              <motion.button
                type="button"
                onClick={onStartClick}
                className="mt-6 w-full rounded-2xl bg-emerald-600 py-4 text-center text-base font-bold text-white shadow-lg"
                whileTap={{ scale: 0.98 }}
              >
                יאללה, בוא נתחיל
              </motion.button>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
