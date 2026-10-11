'use client';

import { useEffect } from 'react';

/** Long maps (14+ stations / extra tracks): scroll the map container so the current station is centred. */
export function ScrollToCurrent({ containerId }: { containerId: string }) {
  useEffect(() => {
    const box = document.getElementById(containerId);
    const cur = box?.querySelector<HTMLElement>('[data-current]');
    if (!box || !cur) return;
    box.scrollTop = Math.max(0, cur.offsetTop - box.clientHeight / 2 + cur.offsetHeight / 2);
  }, [containerId]);
  return null;
}
