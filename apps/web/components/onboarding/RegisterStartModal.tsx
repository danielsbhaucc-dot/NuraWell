'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Phone, X, FormInput, Lock } from 'lucide-react';
import Link from 'next/link';
import { MentorBubble } from './MentorBubble';

type RegisterStartModalProps = {
  open: boolean;
  onClose: () => void;
};

export function RegisterStartModal({ open, onClose }: RegisterStartModalProps) {
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
          aria-labelledby="register-start-title"
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
            className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-white/20 bg-gradient-to-b from-slate-900/95 to-emerald-950/95 backdrop-blur-2xl shadow-2xl p-5 sm:p-6"
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute left-4 top-4 w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20"
              aria-label="סגור"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 id="register-start-title" className="sr-only">
              איך תרצו להמשיך
            </h2>

            <MentorBubble mentorId="dolev" className="mt-2 mb-5">
              <p>
                לפני שמתחילים — חשוב לי שתדעו: אני בינה מלאכותית. בלי שיפוט, בלי בושה, בלי צורך
                להתנצל על מה שעבר. רק ליווי אמיתי. 🌿
              </p>
              <p className="mt-2 text-white/80 text-sm">איך נוח לכם להמשיך?</p>
            </MentorBubble>

            <ul className="space-y-3" role="list">
              <li>
                <div
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 opacity-55 cursor-not-allowed"
                  aria-disabled="true"
                >
                  <Phone className="w-5 h-5 text-white/50 shrink-0" />
                  <span className="flex-1 text-right">
                    <span className="block font-bold text-white/70">שיחה עם דולב בטלפון</span>
                    <span className="text-xs text-white/50">בקרוב — עובדים על זה</span>
                  </span>
                  <Lock className="w-4 h-4 text-white/40 shrink-0" aria-hidden />
                </div>
              </li>
              <li>
                <motion.div
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 opacity-55 cursor-not-allowed"
                  aria-disabled="true"
                >
                  <MessageCircle className="w-5 h-5 text-white/50 shrink-0" />
                  <span className="flex-1 text-right">
                    <span className="block font-bold text-white/70">וואטסאפ עם דולב</span>
                    <span className="text-xs text-white/50">בקרוב</span>
                  </span>
                  <Lock className="w-4 h-4 text-white/40 shrink-0" aria-hidden />
                </motion.div>
              </li>
              <li>
                <Link
                  href="/register/form"
                  prefetch
                  onClick={onClose}
                  className="flex items-center gap-3 rounded-2xl border border-emerald-400/60 bg-gradient-to-l from-emerald-600/40 to-teal-500/30 px-4 py-4 shadow-lg shadow-emerald-500/20 hover:brightness-110 active:scale-[0.98] transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                >
                  <FormInput className="w-5 h-5 text-emerald-300 shrink-0" />
                  <span className="flex-1 text-right">
                    <span className="block font-bold text-white">טופס קצר באתר</span>
                    <span className="text-xs text-emerald-100/90">כמה דקות — ואני כבר מכיר אתכם</span>
                  </span>
                  <span className="text-emerald-300 text-lg" aria-hidden>→</span>
                </Link>
              </li>
            </ul>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
