'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, X } from 'lucide-react';
import { ALMOG_AVATAR_FALLBACK } from '../../lib/ai/almog-avatar';
import { useAlmogAvatarUrl } from '../../lib/client/useAlmogAvatarUrl';
import {
  OPEN_ALMOG_REPLY_EVENT,
  type OpenAlmogReplyDetail,
} from '../../lib/notifications/open-almog-reply';
import { dispatchOpenAlmogChatFromNotification } from '../../lib/notifications/open-almog-chat';

export function AlmogReplyModal() {
  const { avatarUrl } = useAlmogAvatarUrl();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<OpenAlmogReplyDetail | null>(null);
  const [reply, setReply] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<OpenAlmogReplyDetail>).detail;
      if (!d?.notificationId || !d.mentorMessage) return;
      setDetail(d);
      setReply('');
      setOpen(true);
    };
    window.addEventListener(OPEN_ALMOG_REPLY_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ALMOG_REPLY_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => textareaRef.current?.focus(), 120);
    return () => window.clearTimeout(t);
  }, [open]);

  const handleClose = () => {
    if (submitting) return;
    setOpen(false);
    setDetail(null);
    setReply('');
  };

  const handleSubmit = () => {
    const text = reply.trim();
    if (!text || !detail || submitting) return;
    setSubmitting(true);
    detail.onMarkRead?.();
    dispatchOpenAlmogChatFromNotification({
      notificationId: detail.notificationId,
      mentorMessage: detail.mentorMessage,
      title: detail.title,
      source: detail.source,
      createdAt: detail.createdAt,
      initialReply: text,
    });
    setSubmitting(false);
    setOpen(false);
    setDetail(null);
    setReply('');
  };

  return (
    <AnimatePresence>
      {open && detail && (
        <>
          <motion.button
            type="button"
            aria-label="סגור"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[260] bg-slate-900/55 backdrop-blur-sm"
            onClick={handleClose}
          />
          {/**
           * מיקום: wrapper flex פרוס על כל המסך אחראי על המיקום (תחתית במובייל,
           * מרכז בדסקטופ). ה-modal עצמו אחראי רק על האנימציה (y/scale).
           * מפרידים בין השניים כי framer-motion קובע transform inline ש"גובר"
           * על Tailwind transforms כמו -translate-x-1/2.
           */}
          <div
            className="pointer-events-none fixed inset-0 z-[270] flex items-end justify-center px-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:px-4 sm:pb-0"
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="almog-reply-title"
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className="pointer-events-auto w-full max-w-md overflow-hidden rounded-[28px] border border-emerald-200/60 bg-white shadow-2xl"
              dir="rtl"
            >
              <motion.div
                className="flex items-center justify-between px-4 py-3 text-white"
                style={{ background: 'linear-gradient(145deg, #047857, #10b981)' }}
              >
                <motion.div className="flex items-center gap-2.5">
                  <img
                    src={avatarUrl}
                    alt=""
                    className="h-10 w-10 rounded-full object-cover ring-2 ring-white/40"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = ALMOG_AVATAR_FALLBACK;
                    }}
                  />
                  <motion.div>
                    <p id="almog-reply-title" className="text-sm font-black">
                      השב לאלמוג
                    </p>
                    <p className="text-[11px] text-emerald-50/85">כמו בווטסאפ — תשובה קצרה</p>
                  </motion.div>
                </motion.div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-xl p-2 hover:bg-white/15"
                  aria-label="סגור"
                >
                  <X className="h-5 w-5" />
                </button>
              </motion.div>

              <motion.div className="space-y-3 p-4">
                <motion.div
                  className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/90 to-teal-50/70 p-3.5 text-right shadow-sm"
                  style={{ borderInlineStartWidth: '4px', borderInlineStartColor: '#10b981' }}
                >
                  <p className="mb-1 text-[11px] font-bold text-emerald-700">אלמוג</p>
                  {detail.title && (
                    <p className="mb-1 text-[13px] font-bold text-emerald-950">{detail.title}</p>
                  )}
                  <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-emerald-950/90">
                    {detail.mentorMessage}
                  </p>
                </motion.div>

                <motion.div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-2">
                  <textarea
                    ref={textareaRef}
                    dir="rtl"
                    rows={3}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }}
                    placeholder="כתוב את התשובה שלך..."
                    className="w-full resize-none rounded-xl border-0 bg-transparent px-2 py-2 text-[15px] text-slate-900 outline-none placeholder:text-slate-400"
                  />
                </motion.div>

                <motion.button
                  type="button"
                  disabled={!reply.trim() || submitting}
                  onClick={handleSubmit}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-black text-white shadow-lg transition active:scale-[0.98] disabled:opacity-50"
                  style={{ background: 'linear-gradient(145deg, #047857, #10b981)' }}
                >
                  {submitting ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      שלח ופתח שיחה
                    </>
                  )}
                </motion.button>
              </motion.div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
