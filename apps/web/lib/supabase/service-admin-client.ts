import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { withFieldDecryption } from '@/lib/security/field-fetch';

/** User-Agent שרתי — מפתחות sb_secret נחסמים כשהבקשה נראית כדפדפן (מדיניות Supabase). */
const SERVER_UA = 'NuraWell-Server/ops-bridge/1';

/**
 * לקוח Supabase עם הרשאות מלאות (JWT service_role ישן או sb_secret חדש).
 * עוטף fetch עם User-Agent קבוע כדי לא לקבל 401 מ-Kong.
 */
export function createServiceSupabaseAdmin(url: string, serviceOrSecretKey: string): SupabaseClient {
  const baseUrl = url.trim().replace(/\/$/, '');
  return createClient(baseUrl, serviceOrSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: withFieldDecryption((input, init) => {
        const h = new Headers(init?.headers as HeadersInit);
        h.set('User-Agent', SERVER_UA);
        return fetch(input, { ...init, headers: h });
      }),
    },
  });
}
