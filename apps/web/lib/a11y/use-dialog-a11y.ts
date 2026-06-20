'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { focusFirstElement, getFocusableElements } from './focusable';

type UseDialogA11yOptions = {
  open: boolean;
  onClose: () => void;
  containerRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  lockScroll?: boolean;
  trapFocus?: boolean;
};

export function useDialogA11y({
  open,
  onClose,
  containerRef,
  initialFocusRef,
  lockScroll = true,
  trapFocus = true,
}: UseDialogA11yOptions): void {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (lockScroll) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => {
        focusFirstElement(containerRef.current, initialFocusRef?.current ?? null);
      });

      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
          return;
        }

        if (!trapFocus || event.key !== 'Tab') return;
        const container = containerRef.current;
        if (!container) return;

        const focusables = getFocusableElements(container);
        if (focusables.length === 0) {
          event.preventDefault();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;

        if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      };

      document.addEventListener('keydown', onKeyDown);
      return () => {
        document.removeEventListener('keydown', onKeyDown);
        document.body.style.overflow = previousOverflow;
        previousFocusRef.current?.focus?.();
      };
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    requestAnimationFrame(() => {
      focusFirstElement(containerRef.current, initialFocusRef?.current ?? null);
    });
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [open, onClose, containerRef, initialFocusRef, lockScroll, trapFocus]);
}
