'use client';

import { useEffect, useState } from 'react';

/** מסנכרן מגירת vaul עם visualViewport — מתקן שבירת layout כשמקלדת נפתחת בנייד */
export function useVisualDrawerLayout(active: boolean) {
  const [layout, setLayout] = useState<{ top: number; height: number } | null>(null);

  useEffect(() => {
    if (!active) {
      setLayout(null);
      return;
    }

    const vv = window.visualViewport;
    if (!vv) return;

    const sync = () => {
      setLayout({
        top: Math.max(0, vv.offsetTop),
        height: Math.round(vv.height),
      });
    };

    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    window.addEventListener('orientationchange', sync);

    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      window.removeEventListener('orientationchange', sync);
      setLayout(null);
    };
  }, [active]);

  return layout;
}
