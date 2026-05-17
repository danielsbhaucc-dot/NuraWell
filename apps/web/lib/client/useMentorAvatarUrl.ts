'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MentorId } from '../mentors/registry';
import { MENTORS } from '../mentors/registry';
import { getMentorAvatarFallback } from '../mentors/avatar-url';

export type MentorAvatarMeta = {
  avatarUrl: string;
  mentorName: string;
  hasCustom: boolean;
  ready: boolean;
  cdnConfigured: boolean;
  refresh: () => Promise<void>;
};

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
      const u = typeof data.url === 'string' && data.url.length > 0 ? data.url : fallback;
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
    refresh,
  };
}
