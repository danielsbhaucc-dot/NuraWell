'use client';

import { useEffect, useState } from 'react';
import { getAppOverlayRoot } from './app-overlay-root';

/** Client hook — null until mounted (SSR-safe). */
export function useAppOverlayRoot(): HTMLElement | null {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setRoot(getAppOverlayRoot());
  }, []);
  return root;
}
