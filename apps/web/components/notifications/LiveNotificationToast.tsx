'use client';

/**
 * `LiveNotificationToast` — toast קופץ ב-foreground ברגע שמתקבלת התראה חדשה.
 *
 * רקע: Web Push (service worker) **לא מציג** notification מערכת כשהאפליקציה
 * פתוחה ב-foreground (זה למעשה התנהגות UX מומלצת — אחרת המשתמש רואה כפילות).
 * הבעיה: כשהמסך פתוח אצל המשתמש, ההתראה מגיעה ב-DB realtime אבל לא מורגשת.
 *
 * הפתרון: ברגע שה-`NotificationsProvider` קולט INSERT חדש מ-Supabase Realtime
 * כשהמסך פעיל — הוא דוחף את הפריט גם ל-`LiveToastStack`, וכאן מוצג toast יפה
 * מעל הכל. לחיצה → פותחת את ה-drawer, סוגרת את ה-toast ומסמנת כנקרא.
 *
 * עקרונות UX:
 *  - מופיע מלמעלה (mobile-first) — מתחת ל-`safe-area`.
 *  - אנימציית כניסה רכה עם spring (framer-motion).
 *  - דיסמיס אוטומטי אחרי 8s, או כפתור ✕ ידני, או swipe up.
 *  - מקסימום 3 toasts בו-זמנית — חדש דוחף ישן החוצה (stack כמו iOS).
 *  - הקלקה מסמנת כנקרא ופותחת drawer; לא מפעילה action_url ישירות (UX יותר רך).
 */

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { X } from 'lucide-react';
import { ALMOG_AVATAR_FALLBACK } from '../../lib/ai/almog-avatar';
import { getMentorAvatarFallback } from '../../lib/mentors/avatar-url';
import { MENTORS } from '../../lib/mentors/registry';
import { cn } from '../../lib/cn';
import type { NotificationItem } from './NotificationsProvider';

export const TOAST_AUTO_DISMISS_MS = 8000;
export const MAX_VISIBLE_TOASTS = 3;

type LiveNotificationToastProps = {
  notification: NotificationItem;
  almogAvatar: string;
  dolevAvatar: string;
  onDismiss: (id: string) => void;
  onClick: (id: string) => void;
};

export function LiveNotificationToast({
  notification: n,
  almogAvatar,
  dolevAvatar,
  onDismiss,
  onClick,
}: LiveNotificationToastProps) {
  const timerRef = useRef<number | null>(null);
  const hoveredRef = useRef(false);

  /** Auto-dismiss — נעצר על hover (UX סטנדרטי). */
  useEffect(() => {
    const start = () => {
      if (hoveredRef.current) return;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(
        () => onDismiss(n.id),
        TOAST_AUTO_DISMISS_MS
      );
    };
    start();
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [n.id, onDismiss]);

  const isDolev = n.mentorId === 'dolev';
  const avatar = isDolev ? dolevAvatar : almogAvatar;
  const avatarFallback = isDolev
    ? getMentorAvatarFallback(MENTORS.dolev)
    : ALMOG_AVATAR_FALLBACK;
  const mentorLabel = isDolev ? 'דולב' : 'אלמוג';

  const handleClick = () => onClick(n.id);

  const handleDismiss = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDismiss(n.id);
  };

  return (
    <motion.div
      layout
      role="alert"
      aria-live="polite"
      dir="rtl"
      initial={{ opacity: 0, y: -28, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -16, scale: 0.94, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 360, damping: 28 }}
      drag="y"
      dragConstraints={{ top: -60, bottom: 0 }}
      dragElastic={0.3}
      onDragEnd={(_, info) => {
        if (info.offset.y < -32 || info.velocity.y < -380) onDismiss(n.id);
      }}
      onMouseEnter={() => {
        hoveredRef.current = true;
        if (timerRef.current) window.clearTimeout(timerRef.current);
      }}
      onMouseLeave={() => {
        hoveredRef.current = false;
        timerRef.current = window.setTimeout(
          () => onDismiss(n.id),
          TOAST_AUTO_DISMISS_MS
        );
      }}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
        if (e.key === 'Escape') onDismiss(n.id);
      }}
      tabIndex={0}
      className={cn(
        'pointer-events-auto group relative w-full overflow-hidden rounded-2xl',
        'cursor-pointer select-none border text-right backdrop-blur-2xl',
        'border-white/55 bg-gradient-to-br from-emerald-50/95 via-white/85 to-teal-50/85',
        'shadow-[0_14px_40px_rgba(6,78,59,0.22),0_0_0_1px_rgba(255,255,255,0.5)_inset]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60'
      )}
      style={{
        WebkitBackdropFilter: 'blur(24px) saturate(1.35)',
      }}
    >
      {/* ה-glow העדין למעלה — מסמן "התראה חדשה!" */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-l from-transparent via-emerald-400/70 to-transparent"
        aria-hidden
      />

      <div className="flex items-start gap-3 px-3.5 py-3 sm:px-4">
        {/* Avatar */}
        <div className="relative shrink-0">
          <div
            className="relative h-11 w-11 overflow-hidden rounded-full ring-2 ring-white/80 shadow-md"
            style={{ background: 'linear-gradient(140deg,#10b981 0%,#059669 100%)' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <Image
              src={avatar || avatarFallback}
              alt={mentorLabel}
              fill
              sizes="44px"
              className="object-cover"
              unoptimized
            />
          </div>
          {/* live dot */}
          <span className="absolute -bottom-0.5 -left-0.5 flex h-3 w-3" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-80" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white shadow-sm" />
          </span>
        </div>

        {/* טקסט */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3
              className="truncate text-[13.5px] font-black text-emerald-950 leading-tight"
              style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
            >
              {n.title || mentorLabel}
            </h3>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="סגור התראה"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-100/60 text-emerald-900/70 transition hover:bg-emerald-200/80 hover:text-emerald-900 active:scale-95"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.4} />
            </button>
          </div>
          <p
            className="mt-0.5 line-clamp-3 text-[13px] font-medium leading-snug text-emerald-900/85"
            style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
          >
            {n.body}
          </p>
          <div className="mt-1.5 flex items-center gap-1.5 text-[10.5px] font-bold text-emerald-700/75">
            <span>{mentorLabel}</span>
            <span aria-hidden>•</span>
            <span>עכשיו</span>
          </div>
        </div>
      </div>

      {/* progress bar — מסמן כמה זמן נשאר */}
      <motion.div
        className="absolute bottom-0 right-0 h-[2.5px] bg-gradient-to-l from-emerald-500 via-emerald-400 to-teal-300"
        initial={{ width: '100%' }}
        animate={{ width: '0%' }}
        transition={{ duration: TOAST_AUTO_DISMISS_MS / 1000, ease: 'linear' }}
        aria-hidden
      />
    </motion.div>
  );
}

type LiveToastStackProps = {
  toasts: NotificationItem[];
  almogAvatar: string;
  dolevAvatar: string;
  onDismiss: (id: string) => void;
  onClick: (id: string) => void;
};

/**
 * Stack של toasts קופצים — נטען globally דרך `NotificationsProvider`.
 * נשאר fixed top-center (mobile-first), עם safe-area padding לכרום iOS.
 */
export function LiveToastStack({
  toasts,
  almogAvatar,
  dolevAvatar,
  onDismiss,
  onClick,
}: LiveToastStackProps) {
  if (toasts.length === 0) return null;
  const visible = toasts.slice(0, MAX_VISIBLE_TOASTS);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[300] flex justify-center px-3 sm:px-4"
      style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)' }}
      aria-live="polite"
      aria-atomic="false"
    >
      <div className="flex w-full max-w-md flex-col gap-2.5">
        <AnimatePresence initial={false}>
          {visible.map((n) => (
            <LiveNotificationToast
              key={n.id}
              notification={n}
              almogAvatar={almogAvatar}
              dolevAvatar={dolevAvatar}
              onDismiss={onDismiss}
              onClick={onClick}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
