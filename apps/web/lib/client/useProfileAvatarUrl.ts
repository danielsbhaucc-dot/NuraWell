'use client';

import { useCallback, useEffect, useState } from 'react';

type AvatarMeta = {
  avatarUrl: string | null;
  hasCustom: boolean;
  ready: boolean;
};

export function useProfileAvatarUrl(
  initialUrl: string | null,
  refreshKey = 0
): AvatarMeta & { refresh: () => Promise<void> } {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialUrl);
  const [hasCustom, setHasCustom] = useState(Boolean(initialUrl));
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/profile/avatar', { method: 'GET' });
      if (!res.ok) return;
      const data = (await res.json()) as { avatar_url?: string | null; has_custom?: boolean };
      setAvatarUrl(data.avatar_url ?? null);
      setHasCustom(Boolean(data.has_custom));
    } catch {
      /* ignore */
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  useEffect(() => {
    if (initialUrl) {
      setAvatarUrl(initialUrl);
      setHasCustom(true);
    }
  }, [initialUrl]);

  return { avatarUrl, hasCustom, ready, refresh };
}
