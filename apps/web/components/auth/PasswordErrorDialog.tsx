'use client';

import type { RefObject } from 'react';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';

/**
 * Password rejection popup (leaked / too short / equals email / check unavailable).
 * Reuses the design-system ConfirmDialog in alert mode: role=alertdialog, focus trap, Esc,
 * and focus goes back to the password field when closed. Never window.alert / native bubbles.
 */
export function PasswordErrorDialog({
  message,
  fieldRef,
  onClose,
}: {
  message: string | null;
  fieldRef?: RefObject<HTMLInputElement | null>;
  onClose: () => void;
}) {
  const close = () => {
    onClose();
    // after AnimatedDialog restores focus to the opener, move it to the field
    setTimeout(() => fieldRef?.current?.focus(), 60);
  };
  return (
    <ConfirmDialog
      open={!!message}
      alert
      tone="warning"
      title="צריך לבחור סיסמה אחרת"
      message={message ?? undefined}
      confirmLabel="הבנתי"
      onConfirm={close}
      onCancel={close}
    />
  );
}
