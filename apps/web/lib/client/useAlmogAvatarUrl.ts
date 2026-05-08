'use client';

import { useCallback, useEffect, useState } from 'react';
import { ALMOG_AVATAR_FALLBACK } from '../ai/almog-avatar';

export type AlmogAvatarMeta = {
  avatarUrl: string;
  hasCustom: boolean;
  ready: boolean;
  /** False if NEXT_PUBLIC_CDN_URL / R2 public base missing — R2 upload still works but URLs won’t point at CDN. */
  cdnConfigured: boolean;
  cdnHostname: string | null;
  refresh: () => Promise<void>;
};

export function useAlmogAvatarUrl(refreshToken = 0): AlmogAvatarMeta {
  const [avatarUrl, setAvatarUrl] = useState<string>(ALMOG_AVATAR_FALLBACK);
  const [hasCustom, setHasCustom] = useState(false);
  const [cdnConfigured, setCdnConfigured] = useState(false);
  const [cdnHostname, setCdnHostname] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/almog-avatar', { cache: 'no-store' });
      const data = (await res.json()) as {
        url?: string | null;
        has_custom?: boolean;
        cdn_configured?: boolean;
        cdn_hostname?: string | null;
      };
      const u = typeof data.url === 'string' && data.url.length > 0 ? data.url : ALMOG_AVATAR_FALLBACK;
      setAvatarUrl(u);
      setHasCustom(Boolean(data.has_custom));
      setCdnConfigured(Boolean(data.cdn_configured));
      setCdnHostname(typeof data.cdn_hostname === 'string' ? data.cdn_hostname : null);
    } catch {
      setAvatarUrl(ALMOG_AVATAR_FALLBACK);
      setHasCustom(false);
      setCdnConfigured(false);
      setCdnHostname(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshToken]);

  return { avatarUrl, hasCustom, ready, cdnConfigured, cdnHostname, refresh };
}
