'use client';

import { useEffect, useState } from 'react';

/** prefers-reduced-motion + מחלקת נגישות `a11y-reduce-motion` */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const check = () => {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const a11y = document.documentElement.classList.contains('a11y-reduce-motion');
      setReduced(mq || a11y);
    };
    check();
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    mq.addEventListener('change', check);
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      mq.removeEventListener('change', check);
      obs.disconnect();
    };
  }, []);

  return reduced;
}
