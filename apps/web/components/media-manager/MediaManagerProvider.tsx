'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { MediaManager } from './MediaManager';
import type { MediaAsset, OpenMediaManagerOptions } from './types';

type MediaManagerContextValue = {
  open: (options?: OpenMediaManagerOptions) => void;
  close: () => void;
};

const MediaManagerContext = createContext<MediaManagerContextValue | null>(null);

export function MediaManagerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<OpenMediaManagerOptions | null>(null);

  const open = useCallback((opts?: OpenMediaManagerOptions) => {
    setOptions(opts ?? { mode: 'browse' });
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setOptions(null);
  }, []);

  const value = useMemo(() => ({ open, close }), [open, close]);

  return (
    <MediaManagerContext.Provider value={value}>
      {children}
      <MediaManager open={isOpen} options={options} onClose={close} />
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
