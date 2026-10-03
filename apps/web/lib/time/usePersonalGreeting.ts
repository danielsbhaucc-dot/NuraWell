'use client';

import { useEffect, useState } from 'react';
import {
  getTimeOnlyPersonalGreeting,
  type PersonalGreeting,
} from './greeting-time';

/**
 * ברכה מלאה בצד לקוח — טוען @hebcal/core ב-chunk נפרד אחרי mount,
 * בלי לגרור אותו ל-JS הראשוני של הדשבורד.
 */
export function usePersonalGreeting(now?: Date): PersonalGreeting {
  const [greeting, setGreeting] = useState<PersonalGreeting>(() =>
    getTimeOnlyPersonalGreeting(now)
  );

  useEffect(() => {
    let cancelled = false;
    const at = now ?? new Date();
    void import('./greeting-hebrew')
      .then((mod) => {
        if (!cancelled) setGreeting(mod.getPersonalGreeting(at));
      })
      .catch(() => {
        /* נשארים עם ברכת שעה */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ברכה לפי רגע mount
  }, []);

  return greeting;
}
