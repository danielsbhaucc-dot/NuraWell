import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { __resetFieldCrypto, decryptValue, setDekStoreForTests } from '@/lib/security/field-crypto';
import { SYSTEM_ROW } from '@/lib/security/field-registry';
import { requestDevice } from '@/lib/ceo/security';
import { telegramIdBidx } from '@/lib/ceo/telegram-id-seal';
import { runTgDeviceIdBackfill } from '@/lib/privacy/telegram-device-id-backfill';

const DB = 'nurawell_stack_chain';
const DUMMY_CHAT = '9100999888';
const DUMMY_TG = '9100777666';

function psql(sql: string): string {
  return execFileSync('psql', ['-h', '127.0.0.1', '-U', 'postgres', '-d', DB, '-v', 'ON_ERROR_STOP=1', '-Atq'], {
    encoding: 'utf8', input: sql,
  }).trim();
}
function loadEnv() {
  for (const line of readFileSync('/workspace/local-lab-paired/secrets/next-a.env', 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) process.env[m[1]] = m[2];
  }
}
function counts() {
  const a = psql(`select count(*)||'|'||count(*) filter (where telegram_user_id like 'enc:v2:%')||'|'||count(*) filter (where telegram_user_id is not null and telegram_user_id not like 'enc:%')||'|'||count(*) filter (where telegram_user_bidx is not null) from public.admin_passkeys`);
  const d = psql(`select count(*)||'|'||count(*) filter (where chat_id like 'enc:v2:%')||'|'||count(*) filter (where chat_id is not null and chat_id not like 'enc:%')||'|'||count(*) filter (where chat_bidx is not null) from public.gideon_device_requests`);
  const [at, as_, al, ab] = a.split('|').map(Number);
  const [dt, ds, dl, dbx] = d.split('|').map(Number);
  return { passkeys: { total: at, sealed: as_, legacy: al, bidx: ab }, devices: { total: dt, sealed: ds, legacy: dl, bidx: dbx } };
}

describe('telegram device-id live SQL+handler', () => {
  beforeEach(() => {
    loadEnv();
    __resetFieldCrypto();
    setDekStoreForTests(null);
    psql(`delete from public.gideon_device_requests where chat_bidx = '${telegramIdBidx('gideon_device_requests', 'chat_id', DUMMY_CHAT)}' or chat_id = '${DUMMY_CHAT}'`);
    psql(`delete from public.admin_passkeys where telegram_user_bidx = '${telegramIdBidx('admin_passkeys', 'telegram_user_id', DUMMY_TG)}' or telegram_user_id = '${DUMMY_TG}'`);
  });
  afterEach(() => {
    psql(`delete from public.gideon_device_requests where chat_bidx = '${telegramIdBidx('gideon_device_requests', 'chat_id', DUMMY_CHAT)}' or chat_id like 'enc:v2:%' and created_at > now() - interval '1 hour'`);
    // cleanup by bidx only for devices created this test
    psql(`delete from public.gideon_device_requests where chat_bidx = '${telegramIdBidx('gideon_device_requests', 'chat_id', DUMMY_CHAT)}'`);
  });

  it('requestDevice writes sealed+bidx; idempotent pending; legacy backfill dry/apply', async () => {
    const before = counts();
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const first = await requestDevice(admin, DUMMY_CHAT, false);
    expect(first.existing).toBe(false);
    const second = await requestDevice(admin, DUMMY_CHAT, false);
    expect(second.existing).toBe(true);
    expect(second.id).toBe(first.id);

    const row = psql(`select (chat_id like 'enc:v2:%')||'|'||(chat_bidx is not null)||'|'||(chat_id !~ '${DUMMY_CHAT}') from public.gideon_device_requests where id='${first.id}'`);
    expect(row).toBe('true|true|true');
    const cipher = psql(`select chat_id from public.gideon_device_requests where id='${first.id}'`);
    expect(await decryptValue('gideon_device_requests', 'chat_id', 'system:ops', SYSTEM_ROW, cipher)).toBe(DUMMY_CHAT);
    const afterNew = counts();
    expect(afterNew.devices.sealed).toBeGreaterThanOrEqual(before.devices.sealed + 1);

    // synthetic legacy passkey + device for backfill
    const uid = psql(`select id::text from public.profiles where role='admin' limit 1`);
    const legacyPk = uid
      ? psql(`insert into public.admin_passkeys (user_id, credential_id, public_key, alg, kind, telegram_user_id, activated_at)
          values ('${uid}', 'cred-legacy-dummy-1', 'pk', 0, 'tg_bio', '${DUMMY_TG}', now()) returning id::text`)
      : '';
    const legacyDev = psql(`insert into public.gideon_device_requests (chat_id, replace, status)
      values ('9111222333', false, 'rejected') returning id::text`);

    const mid = counts();
    expect(mid.passkeys.legacy + mid.devices.legacy).toBeGreaterThanOrEqual(1);

    const esc = (s: string) => s.replace(/'/g, "''");
    const write = async (w: { table: string; id: string; sealed: string; bidx: string; previous: string; valueCol: string; bidxCol: string }) => {
      const n = psql(`update public.${w.table} set ${w.valueCol}='${esc(w.sealed)}', ${w.bidxCol}='${esc(w.bidx)}'
        where id='${esc(w.id)}' and ${w.bidxCol} is null and ${w.valueCol}='${esc(w.previous)}' and ${w.valueCol} not like 'enc:%' returning 1`);
      return n === '1';
    };
    const pkRows = legacyPk ? [{ id: legacyPk, value: DUMMY_TG, bidx: null as string | null }] : [];
    const devRows = [{ id: legacyDev, value: '9111222333', bidx: null as string | null }];
    const dry = await runTgDeviceIdBackfill(pkRows, devRows, write, false);
    expect(dry.planned).toBe(pkRows.length + 1);
    const applied = await runTgDeviceIdBackfill(pkRows, devRows, write, true);
    expect(applied.written).toBe(pkRows.length + 1);
    const after = counts();
    expect(after.devices.legacy).toBeLessThanOrEqual(mid.devices.legacy);
    // cleanup legacy fixtures
    if (legacyPk) psql(`delete from public.admin_passkeys where id='${legacyPk}'`);
    psql(`delete from public.gideon_device_requests where id='${legacyDev}'`);
    psql(`delete from public.gideon_device_requests where id='${first.id}'`);
  }, 90_000);
});
