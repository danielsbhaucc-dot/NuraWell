'use client';

import { useCallback, useEffect, useState } from 'react';
import { getUserAvatarCdnUrl } from '@/lib/storage/user-avatar';

type AvatarMeta = {
  avatarUrl: string | null;
  hasCustom: boolean;
  ready: boolean;
};

function isLikelyValidAvatarUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  return /^https:\/\/cdn\.nurawell\.ai\/images\/users\//i.test(url.trim());
}

export function useProfileAvatarUrl(
  userId: string | null | undefined,
  refreshKey = 0
): AvatarMeta & { refresh: () => Promise<void>; applyUploadedUrl: (url: string | null) => void } {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [hasCustom, setHasCustom] = useState(false);
  const [ready, setReady] = useState(false);

  const applyUploadedUrl = useCallback(
    (url: string | null) => {
      if (url && isLikelyValidAvatarUrl(url)) {
        setAvatarUrl(url);
        setHasCustom(true);
        return;
      }
      if (userId) {
        const fallback = getUserAvatarCdnUrl(userId, String(Date.now()));
        if (fallback) {
          setAvatarUrl(fallback);
          setHasCustom(true);
        }
      }
    },
    [userId]
  );

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/profile/avatar', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { avatar_url?: string | null; has_custom?: boolean };
      const fromApi = data.avatar_url ?? null;
      if (fromApi && isLikelyValidAvatarUrl(fromApi)) {
        setAvatarUrl(fromApi);
        setHasCustom(Boolean(data.has_custom));
        return;
      }
      if (data.has_custom && userId) {
        const fallback = getUserAvatarCdnUrl(userId, String(Date.now()));
        if (fallback) {
          setAvatarUrl(fallback);
          setHasCustom(true);
          return;
        }
      }
      setAvatarUrl(null);
      setHasCustom(false);
    } catch {
      /* ignore */
    } finally {
      setReady(true);
    }
  }, [userId]);

  useEffect(() => {
    setReady(false);
    void refresh();
  }, [refresh, refreshKey]);

  return { avatarUrl, hasCustom, ready, refresh, applyUploadedUrl };
}
