'use client';

import { useEffect } from 'react';
import { createClient } from '../../lib/supabase/client';

function loginUrlWithRedirect(): string {
  const base =
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')) ||
    '';
  const here =
    typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}`
      : '/';
  const redirectParam = encodeURIComponent(
    typeof window !== 'undefined' ? window.location.href : here
  );
  if (base) {
    return `${base}/login?redirect=${redirectParam}`;
  }
  return `/login?redirect=${redirectParam}`;
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
