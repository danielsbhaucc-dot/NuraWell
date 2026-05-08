'use client';

import { useCallback, useEffect, useState } from 'react';
import { ALMOG_AVATAR_FALLBACK } from '../ai/almog-avatar';

export type AlmogAvatarMeta = {
  avatarUrl: string;
  hasCustom: boolean;
  ready: boolean;
  refresh: () => Promise<void>;
};

export function useAlmogAvatarUrl(refreshToken = 0): AlmogAvatarMeta {
  const [avatarUrl, setAvatarUrl] = useState<string>(ALMOG_AVATAR_FALLBACK);
  const [hasCustom, setHasCustom] = useState(false);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/almog-avatar', { cache: 'no-store' });
      const data = (await res.json()) as { url?: string | null; has_custom?: boolean };
      const u = typeof data.url === 'string' && data.url.length > 0 ? data.url : ALMOG_AVATAR_FALLBACK;
      setAvatarUrl(u);
      setHasCustom(Boolean(data.has_custom));
    } catch {
      setAvatarUrl(ALMOG_AVATAR_FALLBACK);
      setHasCustom(false);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshToken]);

  return { avatarUrl, hasCustom, ready, refresh };
}
