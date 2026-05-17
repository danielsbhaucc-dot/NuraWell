'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Drawer } from 'vaul';
import { X, Sparkles, Heart, Bell } from 'lucide-react';
import { useMediaMobile } from '@/lib/client/useMediaMobile';
import { MentorBubble } from './MentorBubble';
import {
  REGISTER_DRAWER_BODY_CLASS,
  REGISTER_DRAWER_CONTENT_CLASS,
  REGISTER_MODAL_PANEL_CLASS,
} from './register-modal-styles';

type RegisterHowItWorksModalProps = {
  open: boolean;
  onClose: () => void;
};

const STEPS = [
  { icon: Sparkles, title: 'מכירים אותך', text: 'שאלון קצר — בלי חפירות, רק מה שחשוב באמת.' },
  { icon: Heart, title: 'מנטור אישי', text: 'אלמוג (AI) לומד את הקצב, המטרות והאתגרים שלך — אחרי שהכרנו אותך כאן.' },
  { icon: Bell, title: '3 מגעים ביום', text: 'הודעות בזמנים שמתאימים לך — במיוחד לפני הרגעים הקשים.' },
];

function HowItWorksBody() {
  return (
    <>
      <h2
        id="how-it-works-title"
        className="text-xl font-black text-white mt-2 mb-4 text-right"
        style={{ fontFamily: 'Rubik, Heebo, sans-serif' }}
      >
        איך זה עובד?
      </h2>

      <MentorBubble mentorId="dolev" className="mb-5">
        <p>פשוט וברור — בלי התחייבות מוגזמת. ככה נבנה ליווי שמתאים לחיים שלך, לא להפך.</p>
      </MentorBubble>

      <ol className="space-y-3">
        {STEPS.map((s, i) => (
          <li
            key={s.title}
            className="flex gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-xl"
          >
            <span className="w-8 h-8 rounded-full bg-emerald-500/30 flex items-center justify-center text-emerald-200 font-black text-sm shrink-0">
              {i + 1}
            </span>
            <div className="text-right flex-1">
              <p className="font-bold text-white flex items-center gap-2 justify-end">
                <s.icon className="w-4 h-4 text-emerald-400" aria-hidden />
                {s.title}
              </p>
              <p className="text-sm text-white/75 mt-0.5">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="text-sm text-white/60 text-center mt-5">
        קורסים, מעקב והרגלים — הכל באפליקציה, בעברית, בקצב שלך.
      </p>
    </>
  );
}

function MobileHowDrawer({ open, onClose }: RegisterHowItWorksModalProps) {
  return (
    <Drawer.Root open={open} onOpenChange={(v) => !v && onClose()} direction="bottom" shouldScaleBackground>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm" />
        <Drawer.Content dir="rtl" className={REGISTER_DRAWER_CONTENT_CLASS}>
          <Drawer.Title className="sr-only">איך זה עובד</Drawer.Title>
          <Drawer.Description className="sr-only">הסבר על תהליך ההרשמה</Drawer.Description>

          <div className="shrink-0 rounded-t-[26px] px-5 pt-3 pb-2 relative">
            <div className="mb-3 flex justify-center">
              <div className="h-1.5 w-11 rounded-full bg-white/35" />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="absolute left-4 top-4 w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20"
              aria-label="סגור"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className={REGISTER_DRAWER_BODY_CLASS}>
            <HowItWorksBody />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function DesktopHowModal({ open, onClose }: RegisterHowItWorksModalProps) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="how-it-works-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-label="סגור"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            className={`${REGISTER_MODAL_PANEL_CLASS} max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 sm:p-6`}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute left-4 top-4 w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white/70"
              aria-label="סגור"
            >
              <X className="w-5 h-5" />
            </button>

            <HowItWorksBody />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function RegisterHowItWorksModal({ open, onClose }: RegisterHowItWorksModalProps) {
  const mobile = useMediaMobile();

  if (mobile) {
    return <MobileHowDrawer open={open} onClose={onClose} />;
  }

  return <DesktopHowModal open={open} onClose={onClose} />;
}
