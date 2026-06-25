'use client';

import { useEffect, useState } from 'react';

/** מסנכרן מגירת vaul עם visualViewport — מתקן שבירת layout כשמקלדת נפתחת בנייד */
export function useVisualDrawerLayout(active: boolean) {
  const [layout, setLayout] = useState<{
    top: number;
    height: number;
    keyboardOpen: boolean;
  } | null>(null);

  useEffect(() => {
    if (!active) {
      setLayout(null);
      return;
    }

    const vv = window.visualViewport;
    if (!vv) return;

    const isMobile = window.matchMedia('(pointer: coarse)').matches;

    const sync = () => {
      const gap = window.innerHeight - vv.height - vv.offsetTop;
      const keyboardOpen = gap > 72;
      setLayout({
        top: Math.max(0, vv.offsetTop),
        height: Math.max(240, Math.round(vv.height)),
        keyboardOpen,
      });
    };

    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);

    if (isMobile) {
      document.documentElement.style.setProperty('--vvh', `${vv.height * 0.01}px`);
    }

    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      document.documentElement.style.removeProperty('--vvh');
      setLayout(null);
    };
  }, [active]);

  return layout;
}
