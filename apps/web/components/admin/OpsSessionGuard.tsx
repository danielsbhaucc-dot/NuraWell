'use client';

import { useEffect } from 'react';
import { createClient } from '../../lib/supabase/client';

/** Same-host login (Ops has its own /login) — never the public *.vercel.app host. */
function loginUrlWithRedirect(): string {
  const here = typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : '/';
  return `/login?redirect=${encodeURIComponent(here)}`;
}

/** כשסופabase מודיע על ניתוק / סשן לא תקף — מפנה ללוגין באפליקציה הציבורית (כמו middleware). */
export function OpsSessionGuard() {
  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        window.location.assign(loginUrlWithRedirect());
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
