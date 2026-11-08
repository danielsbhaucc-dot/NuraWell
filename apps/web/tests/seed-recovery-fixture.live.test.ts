import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/privacy/health-consent', async (orig) => ({
  ...(await orig<typeof import('@/lib/privacy/health-consent')>()),
  healthConsentStatus: async () => 'granted',
}));
import { createClient } from '@supabase/supabase-js';
import { __resetFieldCrypto, setDekStoreForTests } from '@/lib/security/field-crypto';
import { sealProfilePatch, __setFirstNameLookup } from '@/lib/crypto/pii-seal';

const UID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
const DOB = '1992-07-21';
const DB = 'nurawell_stack_chain';
function psql(sql: string) {
  return execFileSync('psql', ['-h', '127.0.0.1', '-U', 'postgres', '-d', DB, '-v', 'ON_ERROR_STOP=1', '-Atq'], { encoding: 'utf8', input: sql }).trim();
}
function loadEnv() {
  for (const line of readFileSync('/workspace/local-lab-paired/secrets/next-a.env', 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) process.env[m[1]] = m[2];
  }
}

describe('seed recovery fixture', () => {
  it('writes sealed DOB for recovery drill', async () => {
    loadEnv();
    __resetFieldCrypto();
    setDekStoreForTests(null);
    __setFirstNameLookup(async () => 'נועה');
    psql(`delete from public.user_data_keys where user_id='${UID}'; delete from auth.users where id='${UID}';
      insert into auth.users (id, is_sso_user, is_anonymous) values ('${UID}', false, false);
      insert into public.profiles (id) values ('${UID}') on conflict (id) do nothing;`);
    const sealed = await sealProfilePatch({ date_of_birth: DOB }, UID);
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await admin.from('profiles').update({ date_of_birth: sealed.date_of_birth as string }).eq('id', UID);
    expect(error).toBeNull();
    const raw = psql(`select date_of_birth from public.profiles where id='${UID}'`);
    expect(raw.startsWith('enc:v2:')).toBe(true);
    expect(raw.includes('1992')).toBe(false);
    expect(psql(`select count(*)::text from public.user_data_keys where user_id='${UID}'`)).toBe('1');
  }, 60_000);
});
