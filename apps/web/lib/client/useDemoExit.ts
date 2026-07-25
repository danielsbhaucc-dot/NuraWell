'use client';

import { useState } from 'react';

type UseDemoExitResult = {
  exiting: boolean;
  error: string | null;
  handleExitDemo: () => Promise<void>;
};

/**
 * Handles the admin demo exit flow: calls DELETE on the demo enrollment
 * and redirects to /home on success. Returns error state if the request fails.
 */
export function useDemoExit(): UseDemoExitResult {
  const [exiting, setExiting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExitDemo = async () => {
    setExiting(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/admin/challenge/demo', { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}`);
      window.location.href = '/home';
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      setError(`שגיאה ביציאה מדמו${code ? ` (${code})` : ''} — נסה שוב`);
      setExiting(false);
    }
  };

  return { exiting, error, handleExitDemo };
}
