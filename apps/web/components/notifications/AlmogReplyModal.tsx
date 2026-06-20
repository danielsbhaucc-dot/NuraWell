'use client';

import { useEffect, useRef, useState } from 'react';
import { Drawer } from 'vaul';
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

  /**
   * אוטו-פוקוס לשדה התגובה — עם השהייה קצת יותר ארוכה כדי לתת ל-Vaul לסיים
   * את האנימציה של ה-drawer לפני שאנחנו "תופסים" focus.
   */
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => textareaRef.current?.focus(), 220);
    return () => window.clearTimeout(t);
  }, [open]);

  const closeDrawer = () => {
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
    <Drawer.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) closeDrawer();
      }}
      direction="bottom"
      shouldScaleBackground
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[260] bg-slate-900/55 backdrop-blur-sm" />
        <Drawer.Content
          dir="rtl"
          /**
           * "הדר מלא" — הגרדיאנט הירוק של ה-header מתפרס על כל ה-drawer,
           * בלי רקע לבן בתחתית. הבועות הפנימיות (הודעת אלמוג + textarea)
           * שומרות על העיצוב המקורי כך שהן צפות מעל הירוק כמו ציטוט בווטסאפ.
           */
          className="fixed bottom-0 left-0 right-0 z-[270] mx-auto flex w-full max-w-md flex-col rounded-t-[28px] border border-emerald-300/40 text-white outline-none shadow-2xl"
          style={{
            background: 'linear-gradient(160deg, #064e3b 0%, #047857 45%, #10b981 100%)',
            boxShadow: '0 -24px 60px rgba(6,78,59,0.45)',
          }}
        >
          <Drawer.Title className="sr-only">השב לאלמוג</Drawer.Title>
          <Drawer.Description className="sr-only">תיבת תגובה מהירה להתראה מאלמוג</Drawer.Description>

          {detail && (
            <div
              className="flex flex-col"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            >
              <div className="pt-2.5 pb-2 flex justify-center">
                <div className="h-1.5 w-11 rounded-full bg-white/45" />
              </div>

              <div className="flex items-center justify-between px-4 pb-3">
                <div className="flex items-center gap-2.5">
                  <img
                    src={avatarUrl}
                    alt=""
                    aria-hidden
                    className="h-11 w-11 rounded-full object-cover ring-2 ring-white/40 shadow-md"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = ALMOG_AVATAR_FALLBACK;
                    }}
                  />
                  <div>
                    <p className="text-base font-black leading-tight">השב לאלמוג</p>
                    <p className="text-[12px] text-emerald-50/85">כמו בווטסאפ — תשובה קצרה</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeDrawer}
                  className="rounded-xl p-2 hover:bg-white/15"
                  aria-label="סגור"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-3 px-4 pb-2">
                <div
                  className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/95 to-teal-50/85 p-3.5 text-right shadow-sm"
                  style={{ borderInlineStartWidth: '4px', borderInlineStartColor: '#10b981' }}
                >
                  <p className="mb-1 text-[11px] font-bold text-emerald-700">אלמוג</p>
                  {detail.title && (
                    <p className="mb-1 text-[13px] font-bold text-emerald-950">{detail.title}</p>
                  )}
                  <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-emerald-950/90">
                    {detail.mentorMessage}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/30 bg-white/95 p-2 shadow-sm">
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
                </div>

                <button
                  type="button"
                  disabled={!reply.trim() || submitting}
                  onClick={handleSubmit}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-sm font-black text-emerald-700 shadow-lg transition active:scale-[0.98] disabled:opacity-60"
                >
                  {submitting ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-700" />
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      שלח ופתח שיחה
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
