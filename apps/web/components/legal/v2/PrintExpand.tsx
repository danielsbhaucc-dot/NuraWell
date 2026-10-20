'use client';

import { useEffect } from 'react';

/** Opens every accordion before printing so the full legal text is printed. */
export function PrintExpand() {
  useEffect(() => {
    const open = () => document.querySelectorAll<HTMLDetailsElement>('.ld details').forEach((d) => { d.open = true; });
    window.addEventListener('beforeprint', open);
    return () => window.removeEventListener('beforeprint', open);
  }, []);
  return null;
}
