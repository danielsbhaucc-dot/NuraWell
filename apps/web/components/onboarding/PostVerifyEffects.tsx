'use client';

import { useEffect, useRef } from 'react';

/** מפעיל מייל ברכה מדולב אחרי הגעה לדף האימות (גיבוי ל-OTP / polling) */
export function PostVerifyEffects() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void fetch('/api/v1/auth/post-verify', { method: 'POST' }).catch(() => {});
  }, []);

  return null;
}
