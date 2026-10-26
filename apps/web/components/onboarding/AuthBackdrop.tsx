'use client';

import { useEffect, useState } from 'react';

type Source = 'register' | 'login';

/**
 * Same background treatment as /login: the admin photo (register first, then login)
 * under the forest overlay. Renders nothing until a photo is available — the
 * `onboarding-shell-dark` gradient underneath is the fallback.
 */
export function AuthBackdrop({ prefer = 'register' }: { prefer?: Source }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const order: Source[] = prefer === 'register' ? ['register', 'login'] : ['login'];
    void (async () => {
      for (const src of order) {
        try {
          const r = await fetch(`/api/v1/${src}-background`);
          const d = (await r.json()) as {
            url?: string | null;
            has_custom?: boolean;
          };
          if (d.has_custom && d.url) {
            if (!cancelled) setUrl(d.url);
            return;
          }
        } catch {
          /* try next */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prefer]);

  if (!url) return null;
  return (
    <>
      <div className="onboarding-photo-bg" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" aria-hidden fetchPriority="high" decoding="async" />
      </div>
      <div className="onboarding-photo-overlay" aria-hidden />
    </>
  );
}
