'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { getAppOverlayRoot } from '../../lib/dom/app-overlay-root';

/**
 * ריווח כדי שדיאלוג ממורכז לא יוסתר מתחת ל-MobileHeader / BottomNav בנייד.
 * (ראו גם DayDetailPopup / TodayTasksPopup.)
 */
export const MOBILE_DIALOG_CHROME_STYLE: CSSProperties = {
  paddingTop: 'calc(64px + env(safe-area-inset-top, 0px) + 8px)',
  paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px) + 12px)',
};

type AnimatedDialogVariant = 'center' | 'sheet';

export type AnimatedDialogProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  variant?: AnimatedDialogVariant;
  zIndex?: number;
  panelRef?: Ref<HTMLDivElement>;
  panelClassName?: string;
  panelStyle?: CSSProperties;
  backdropClassName?: string;
  /** מרווח בטוח מעל/מתחת לברים בנייד (ברירת מחדל: כן ב-center, לא ב-sheet) */
  mobileChromePadding?: boolean;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-label'?: string;
  /** לחיצה על הרקע סוגרת (ברירת מחדל: כן) */
  dismissOnBackdrop?: boolean;
  /** נקרא אחרי שאנימציית הסגירה מסתיימת */
  onExitComplete?: () => void;
};

const springTransition = { type: 'spring' as const, stiffness: 380, damping: 32, mass: 0.88 };
const backdropTransition = { duration: 0.28, ease: [0.4, 0, 0.2, 1] as const };

/**
 * מעטפת דיאלוג עם Portal לשורש ה־phone shell (או body כ־fallback) + אנימציות.
 * נמנעים מ־100vw / fixed לחלון — כך המודל נשאר בתוך מסגרת האפליקציה בדסקטופ.
 */
export function AnimatedDialog({
  open,
  onClose,
  children,
  variant = 'center',
  zIndex = 280,
  panelRef,
  panelClassName = '',
  panelStyle,
  backdropClassName,
  mobileChromePadding = variant === 'center',
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-label': ariaLabel,
  dismissOnBackdrop = true,
  onExitComplete,
}: AnimatedDialogProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // נגישות: Esc סוגר, מלכודת פוקוס בתוך הפאנל, והחזרת פוקוס לאלמנט שפתח.
  const innerRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const setPanelRef = useCallback(
    (el: HTMLDivElement | null) => {
      innerRef.current = el;
      if (typeof panelRef === 'function') panelRef(el);
      else if (panelRef && typeof panelRef === 'object') {
        (panelRef as { current: HTMLDivElement | null }).current = el;
      }
    },
    [panelRef],
  );
  useEffect(() => {
    if (!open || !mounted) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const FOCUSABLE =
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const raf = requestAnimationFrame(() => {
      const panel = innerRef.current;
      if (!panel || panel.contains(document.activeElement)) return;
      const auto = panel.querySelector<HTMLElement>('[data-autofocus]');
      const first = auto ?? panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus?.();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = innerRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus?.();
    };
  }, [open, mounted]);

  if (!mounted) return null;

  const overlayClass =
    variant === 'sheet'
      ? 'fixed inset-0 flex items-end justify-center sm:items-center sm:px-4 sm:py-6'
      : 'fixed inset-0 flex items-center justify-center px-4';

  const overlayStyle: CSSProperties = {
    zIndex,
    ...(mobileChromePadding
      ? variant === 'sheet'
        ? {
            paddingTop: 'max(72px, 12vh)',
            paddingBottom: 'max(12px, env(safe-area-inset-bottom, 0px))',
          }
        : MOBILE_DIALOG_CHROME_STYLE
      : {}),
  };

  const panelInitial =
    variant === 'sheet'
      ? { y: 72, opacity: 0, scale: 0.98 }
      : { y: 24, opacity: 0, scale: 0.94 };
  const panelExit =
    variant === 'sheet'
      ? { y: 48, opacity: 0, scale: 0.98 }
      : { y: 20, opacity: 0, scale: 0.96 };

  return createPortal(
    <AnimatePresence initial={false} onExitComplete={onExitComplete}>
      {open ? (
        <motion.div
          key="animated-dialog-overlay"
          dir="rtl"
          data-nura-overlay="1"
          className={`touch-manipulation ${overlayClass}`}
          style={overlayStyle}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={backdropTransition}
        >
          <motion.button
            type="button"
            aria-label="סגירה"
            className={backdropClassName ?? 'absolute inset-0 bg-ink-950/50 backdrop-blur-sm'}
            onClick={dismissOnBackdrop ? onClose : undefined}
            tabIndex={dismissOnBackdrop ? 0 : -1}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={backdropTransition}
          />
          <motion.div
            ref={setPanelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={ariaLabelledBy}
            aria-describedby={ariaDescribedBy}
            aria-label={ariaLabel}
            className={`relative z-10 w-full ${panelClassName}`}
            style={panelStyle}
            initial={panelInitial}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={panelExit}
            transition={springTransition}
          >
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    getAppOverlayRoot()
  );
}
