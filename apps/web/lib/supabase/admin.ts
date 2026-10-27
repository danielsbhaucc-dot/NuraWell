import { createClient } from '@supabase/supabase-js';
import { withFieldDecryption } from '@/lib/security/field-fetch';

/**
 * Create a Supabase admin client with service role
 * WARNING: Only use in server-side admin operations
 * Never expose this client to the browser
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: { fetch: withFieldDecryption() },
    }
  );
}

/**
 * Service-role client WITHOUT the field-decryption wrapper: returns stored values (ciphertext) as-is.
 * Only for crypto maintenance jobs (backfills, key rotation) that must see what is really stored.
 */
export function createRawAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Server-only client for the central control-plane DB (platform-central): products, module states, licenses.
 * Separate project + separate secret. Only service_role RPCs are reachable there (schema `central` is private).
 */
export function createCentralAdminClient() {
  return createClient(process.env.CENTRAL_SUPABASE_URL!, process.env.CENTRAL_SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
