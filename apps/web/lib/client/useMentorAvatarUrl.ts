'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MentorId } from '../mentors/registry';
import { MENTORS } from '../mentors/registry';
import { getMentorAvatarFallback, getMentorAvatarUrl } from '../mentors/avatar-url';

export type MentorAvatarMeta = {
  avatarUrl: string;
  mentorName: string;
  hasCustom: boolean;
  ready: boolean;
  cdnConfigured: boolean;
  cdnHostname: string | null;
  refresh: () => Promise<void>;
};

function hostnameFromUrl(raw: string): string | null {
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}

export function useMentorAvatarUrl(mentorId: MentorId, refreshToken = 0): MentorAvatarMeta {
  const mentor = MENTORS[mentorId];
  const fallback = getMentorAvatarFallback(mentor);
  const [avatarUrl, setAvatarUrl] = useState(fallback);
  const [hasCustom, setHasCustom] = useState(false);
  const [cdnConfigured, setCdnConfigured] = useState(false);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/mentors/${mentorId}/avatar`, { cache: 'no-store' });
      const data = (await res.json()) as {
        url?: string | null;
        has_custom?: boolean;
        cdn_configured?: boolean;
      };
      let u = typeof data.url === 'string' && data.url.length > 0 ? data.url : fallback;
      if (
        data.cdn_configured &&
        data.has_custom &&
        typeof data.url === 'string' &&
        data.url.includes('/images/') &&
        !data.url.includes('X-Amz-')
      ) {
        u = data.url;
      } else if (u.includes('X-Amz-') || u.includes('r2.cloudflarestorage.com')) {
        u = data.has_custom ? getMentorAvatarUrl(mentor) : fallback;
      }
      setAvatarUrl(u);
      setHasCustom(Boolean(data.has_custom));
      setCdnConfigured(Boolean(data.cdn_configured));
    } catch {
      setAvatarUrl(fallback);
      setHasCustom(false);
      setCdnConfigured(false);
    } finally {
      setReady(true);
    }
  }, [mentorId, fallback]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshToken]);

  return {
    avatarUrl,
    mentorName: mentor.name,
    hasCustom,
    ready,
    cdnConfigured,
    cdnHostname: cdnConfigured ? hostnameFromUrl(avatarUrl) : null,
    refresh,
  };
}
