'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';

// perf: the media library is heavy and rarely opened — load its JS only on first open, not on every Ops page.
const MediaManager = dynamic(() => import('./MediaManager').then((m) => m.MediaManager), { ssr: false });
import type { MediaAsset, OpenMediaManagerOptions } from './types';

type MediaManagerContextValue = {
  open: (options?: OpenMediaManagerOptions) => void;
  close: () => void;
};

const MediaManagerContext = createContext<MediaManagerContextValue | null>(null);

export function MediaManagerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<OpenMediaManagerOptions | null>(null);
  const [everOpened, setEverOpened] = useState(false);

  const open = useCallback((opts?: OpenMediaManagerOptions) => {
    setOptions(opts ?? { mode: 'browse' });
    setIsOpen(true);
    setEverOpened(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setOptions(null);
  }, []);

  const value = useMemo(() => ({ open, close }), [open, close]);

  return (
    <MediaManagerContext.Provider value={value}>
      {children}
      {everOpened ? <MediaManager open={isOpen} options={options} onClose={close} /> : null}
    </MediaManagerContext.Provider>
  );
}

export function useMediaManager(): MediaManagerContextValue {
  const ctx = useContext(MediaManagerContext);
  if (!ctx) {
    throw new Error('useMediaManager חייב להיות בתוך MediaManagerProvider');
  }
  return ctx;
}

export type { MediaAsset, OpenMediaManagerOptions };
