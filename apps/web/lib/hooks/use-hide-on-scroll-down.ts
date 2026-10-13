'use client';

import { useEffect, useState } from 'react';

/**
 * מסתיר כפתורים צפים בזמן גלילה למטה (כדי שלא יכסו כפתורים בתוכן), ומחזיר בגלילה למעלה / בעצירה.
 */
export function useHideOnScrollDown(threshold = 12, idleMs = 900): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let lastY = window.scrollY;
    let idle: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY;
      if (Math.abs(dy) >= threshold) {
        setHidden(dy > 0 && y > 80);
        lastY = y;
      }
      if (idle) clearTimeout(idle);
      idle = setTimeout(() => setHidden(false), idleMs);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (idle) clearTimeout(idle);
    };
  }, [threshold, idleMs]);
  return hidden;
}
