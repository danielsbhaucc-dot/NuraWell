/**
 * Live local combined PII+auth on nurawell_stack_chain after 233–240.
 * Synthetic fixtures only. Prints no plaintext DOB/reason/summary/ciphertext bodies.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/privacy/health-consent', async (orig) => ({
  ...(await orig<typeof import('@/lib/privacy/health-consent')>()),
  healthConsentStatus: async () => 'granted',
}));

import { createClient } from '@supabase/supabase-js';
import { __resetFieldCrypto, setDekStoreForTests } from '@/lib/security/field-crypto';
import { sealProfilePatch, __setFirstNameLookup } from '@/lib/crypto/pii-seal';
import { decProfileResult } from '@/lib/crypto/pii-fields';
import { failSignupClaim } from '@/lib/central/signup-claim';

const DB = 'nurawell_stack_chain';
const UID = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
const NONCE = `lab-pii-nonce-${randomUUID()}`;
const ATTEMPT = randomUUID();
const DOB = '1990-05-04';

function psql(sql: string): string {
  return execFileSync('psql', ['-h', '127.0.0.1', '-U', 'postgres', '-d', DB, '-v', 'ON_ERROR_STOP=1', '-Atq'], {
    encoding: 'utf8', input: sql, stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function loadEnv() {
  const raw = readFileSync('/workspace/local-lab-paired/secrets/next-a.env', 'utf8');
  for (const line of raw.split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

describe('combined PII+auth on live local stack', () => {
  beforeAll(() => {
    loadEnv();
    expect(Buffer.from(process.env.PII_ENCRYPTION_KEY!, 'base64').length).toBe(32);
    __resetFieldCrypto();
    setDekStoreForTests(null); // real user_data_keys via service role
    __setFirstNameLookup(async () => 'נועה');
    // synthetic auth user + open claim (owned by this test only)
    psql(`
      delete from public.parent_signup_claims where nonce = '${NONCE}' or user_id = '${UID}';
      delete from public.user_data_keys where user_id = '${UID}';
      delete from auth.users where id = '${UID}'; -- cascades/triggers profile
      insert into auth.users (id, is_sso_user, is_anonymous) values ('${UID}', false, false);
      insert into public.profiles (id) values ('${UID}') on conflict (id) do nothing;
      insert into public.parent_signup_claims (nonce, parent_sub, email, state, attempt_id, user_id)
      values ('${NONCE}', 'parent-lab-sub', 'pii-combined-lab@example.test', 'open', '${ATTEMPT}', '${UID}');
    `);
  });

  afterAll(() => {
    // ownership-safe cleanup: only this test's synthetic ids
    psql(`
      delete from public.parent_signup_claims where nonce = '${NONCE}' and attempt_id = '${ATTEMPT}';
      delete from public.user_data_keys where user_id = '${UID}';
      delete from public.profiles where id = '${UID}';
      delete from auth.users where id = '${UID}';
    `);
    __setFirstNameLookup(null);
  });

  it('seals DOB to enc:v2 in raw DB, round-trips, wrong key fail-closed', async () => {
    const sealed = await sealProfilePatch({ date_of_birth: DOB, full_name: 'בדיקה' }, UID);
    expect(String(sealed.date_of_birth)).toMatch(/^enc:v2:/);
    expect(String(sealed.date_of_birth)).not.toContain('1990');

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await admin.from('profiles').update({
      date_of_birth: sealed.date_of_birth as string,
    }).eq('id', UID);
    expect(error).toBeNull();

    const raw = psql(`select date_of_birth from public.profiles where id = '${UID}'`);
    expect(raw.startsWith('enc:v2:')).toBe(true);
    expect(raw.includes('1990')).toBe(false);
    expect(raw.includes(DOB)).toBe(false);

    const opened = await decProfileResult(UID)({ data: { id: UID, date_of_birth: raw } })
      .then((r) => r.data as { date_of_birth?: string });
    expect(opened.date_of_birth).toBe(DOB);

    const prev = process.env.PII_ENCRYPTION_KEY!;
    process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    __resetFieldCrypto();
    const wrong = await decProfileResult(UID)({ data: { id: UID, date_of_birth: raw } })
      .then((r) => r.data as { date_of_birth?: string | null });
    expect(wrong.date_of_birth).not.toBe(DOB);
    expect(String(wrong.date_of_birth ?? '')).not.toContain('1990');
    process.env.PII_ENCRYPTION_KEY = prev;
    __resetFieldCrypto();
  }, 60_000);

  it('missing-key seal path releases open claim via failSignupClaim (798d4960)', async () => {
    expect(psql(`select state from public.parent_signup_claims where nonce='${NONCE}' and attempt_id='${ATTEMPT}'`)).toBe('open');

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Reproduce the onboarding catch path: seal throws → failSignupClaim
    const prev = process.env.PII_ENCRYPTION_KEY;
    delete process.env.PII_ENCRYPTION_KEY;
    __resetFieldCrypto();
    let sealThrew = false;
    try {
      await sealProfilePatch({ date_of_birth: DOB }, UID);
    } catch (e) {
      sealThrew = /PII_ENCRYPTION_KEY missing/.test(String((e as Error).message));
      await failSignupClaim(admin, NONCE, ATTEMPT, null);
    }
    process.env.PII_ENCRYPTION_KEY = prev;
    __resetFieldCrypto();
    expect(sealThrew).toBe(true);

    const state = psql(`select state from public.parent_signup_claims where nonce='${NONCE}' and attempt_id='${ATTEMPT}'`);
    expect(state).not.toBe('open');
    // no orphan session attached by this failure path
    expect(psql(`select coalesce(session_id::text,'') from public.parent_signup_claims where nonce='${NONCE}' and attempt_id='${ATTEMPT}'`)).toBe('');
  }, 30_000);
});
