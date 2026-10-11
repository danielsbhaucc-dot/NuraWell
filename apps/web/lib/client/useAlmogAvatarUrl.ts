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

type UseAlmogAvatarUrlOptions = {
  refreshToken?: number;
  /** כבוי — לא קוראים ל-API (fallback מקומי בלבד). */
  enabled?: boolean;
};

type AvatarPayload = { url?: string | null; has_custom?: boolean; cdn_configured?: boolean; cdn_hostname?: string | null };
/** one request per page load shared by every hook instance (was 3–4× per page); refresh() forces a new one */
let avatarShared: Promise<AvatarPayload> | null = null;
function fetchAvatar(force: boolean): Promise<AvatarPayload> {
  if (!avatarShared || force) {
    avatarShared = fetch('/api/v1/almog-avatar', { cache: force ? 'no-store' : 'default' })
      .then((r) => r.json() as Promise<AvatarPayload>)
      .catch((e) => {
        avatarShared = null;
        throw e;
      });
  }
  return avatarShared;
}

export function useAlmogAvatarUrl(
  refreshTokenOrOpts: number | UseAlmogAvatarUrlOptions = 0
): AlmogAvatarMeta {
  const refreshToken =
    typeof refreshTokenOrOpts === 'number' ? refreshTokenOrOpts : (refreshTokenOrOpts.refreshToken ?? 0);
  const enabled =
    typeof refreshTokenOrOpts === 'number' ? true : (refreshTokenOrOpts.enabled ?? true);

  const [avatarUrl, setAvatarUrl] = useState<string>(ALMOG_AVATAR_FALLBACK);
  const [hasCustom, setHasCustom] = useState(false);
  const [cdnConfigured, setCdnConfigured] = useState(false);
  const [cdnHostname, setCdnHostname] = useState<string | null>(null);
  const [ready, setReady] = useState(!enabled);

  const load = useCallback(async (force: boolean) => {
    if (!enabled) {
      setReady(true);
      return;
    }
    try {
      const data = await fetchAvatar(force);
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
  }, [enabled]);
  const refresh = useCallback(() => load(true), [load]);

  useEffect(() => {
    void load(refreshToken > 0);
  }, [load, refreshToken]);

  return { avatarUrl, hasCustom, ready, cdnConfigured, cdnHostname, refresh };
}
