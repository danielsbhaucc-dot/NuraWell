/**
 * Full handler proof: pending → bidx lookup → approve decrypt → mock transport recipient.
 * No external Telegram API. Synthetic local fixtures only.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAdminClient, createRawAdminClient } from '@/lib/supabase/admin';
import { __resetFieldCrypto, setDekStoreForTests } from '@/lib/security/field-crypto';
import {
  approveDeviceRequest,
  requestDevice,
} from '@/lib/ceo/security';
import { sealTelegramId, telegramIdBidx, telegramIdMatches } from '@/lib/ceo/telegram-id-seal';
import { runTgDeviceIdBackfill } from '@/lib/privacy/telegram-device-id-backfill';

const DB = 'nurawell_stack_chain';
const CHAT = '9100666777';
const CHAT_OTHER = '9100666888';
const TG_USER = '9100666777'; // same shape as chat for device bind tests
const ADMIN = 'a1111111-1111-4111-8111-111111111111';
const CRED = 'e2eCred' + 'A'.repeat(20);

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

type Sent = { chatId: string; text: string; url: string };
/** Mock transport — records recipient; never calls Telegram. */
async function mockSendMiniAppButton(chatId: string, text: string, url: string, sink: Sent[]) {
  if (chatId.startsWith('enc:')) throw new Error('encrypted_id_passed_to_sender');
  sink.push({ chatId, text, url });
}

function cleanup() {
  const bidx = (() => {
    try { return telegramIdBidx('gideon_device_requests', 'chat_id', CHAT); } catch { return ''; }
  })();
  const bidx2 = (() => {
    try { return telegramIdBidx('gideon_device_requests', 'chat_id', CHAT_OTHER); } catch { return ''; }
  })();
  if (bidx) psql(`delete from public.gideon_device_requests where chat_bidx in ('${bidx}','${bidx2}')`);
  psql(`delete from public.webauthn_challenges where user_id = '${ADMIN}'`);
  psql(`delete from public.admin_passkeys where user_id = '${ADMIN}' or credential_id like 'e2eCred%'`);
  psql(`delete from public.profiles where id = '${ADMIN}'; delete from auth.users where id = '${ADMIN}'`);
}

describe('telegram device-id e2e handler+DB+mock transport', () => {
  beforeEach(() => {
    loadEnv();
    __resetFieldCrypto();
    setDekStoreForTests(null);
    cleanup();
    psql(`insert into auth.users (id, is_sso_user, is_anonymous) values ('${ADMIN}', false, false) on conflict (id) do nothing;
      insert into public.profiles (id, role) values ('${ADMIN}', 'admin') on conflict (id) do update set role = 'admin'`);
  });
  afterEach(() => { cleanup(); });

  it('pending→bidx idempotent→approve decrypt→mock recipient; deny wrong key/foreign; passkey ownership', async () => {
    const admin = createAdminClient();
    const raw = createRawAdminClient();
    const sent: Sent[] = [];

    // 1) create pending (sealed)
    const first = await requestDevice(admin, CHAT, true);
    expect(first.existing).toBe(false);
    const stored = await raw.from('gideon_device_requests').select('chat_id, chat_bidx, status').eq('id', first.id).maybeSingle();
    expect(String(stored.data?.chat_id).startsWith('enc:v2:')).toBe(true);
    expect(stored.data?.chat_bidx).toBe(telegramIdBidx('gideon_device_requests', 'chat_id', CHAT));
    expect(String(stored.data?.chat_id).includes(CHAT)).toBe(false);

    // 2) secure bidx lookup — same chat idempotent
    const again = await requestDevice(admin, CHAT, false);
    expect(again.existing).toBe(true);
    expect(again.id).toBe(first.id);

    // 3) foreign principal / wrong pending id → null, no send
    const foreign = await approveDeviceRequest(admin, 'b2222222-2222-4222-8222-222222222222', ADMIN);
    expect(foreign).toBeNull();
    expect(sent).toHaveLength(0);
    expect(psql(`select status from public.gideon_device_requests where id='${first.id}'`)).toBe('pending');

    // 4) wrong key → deny before effects (still pending)
    const goodKey = process.env.PII_ENCRYPTION_KEY!;
    process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    __resetFieldCrypto();
    const badKey = await approveDeviceRequest(admin, first.id, ADMIN);
    expect(badKey).toBeNull();
    expect(psql(`select status from public.gideon_device_requests where id='${first.id}'`)).toBe('pending');
    process.env.PII_ENCRYPTION_KEY = goodKey;
    __resetFieldCrypto();

    // 5) legitimate approval → authorized decrypt → mock transport gets plaintext recipient only
    const approved = await approveDeviceRequest(admin, first.id, ADMIN);
    expect(approved).not.toBeNull();
    expect(approved!.chatId).toBe(CHAT);
    expect(approved!.chatId.startsWith('enc:')).toBe(false);
    expect(approved!.url).toMatch(/\/gideon\/app\?t=/);
    expect(psql(`select status from public.gideon_device_requests where id='${first.id}'`)).toBe('approved');
    await mockSendMiniAppButton(approved!.chatId, 'ok', approved!.url, sent);
    expect(sent).toEqual([{ chatId: CHAT, text: 'ok', url: approved!.url }]);
    expect(JSON.stringify(sent)).not.toMatch(/enc:v2:/);

    // 6) second approve of same → null (already handled)
    expect(await approveDeviceRequest(admin, first.id, ADMIN)).toBeNull();

    // 7) admin_passkeys ownership with real DB (sealed + bidx); MFA compare via telegramIdMatches
    const { sealed, bidx } = await sealTelegramId('admin_passkeys', 'telegram_user_id', TG_USER);
    const { error: insErr } = await raw.from('admin_passkeys').insert({
      user_id: ADMIN,
      credential_id: CRED,
      public_key: 'pkdigest',
      alg: 0,
      kind: 'tg_bio',
      telegram_user_id: sealed,
      telegram_user_bidx: bidx,
      label: 'e2e',
      activated_at: new Date().toISOString(),
    });
    expect(insErr).toBeNull();
    const { data: pk } = await raw.from('admin_passkeys').select('telegram_user_id, telegram_user_bidx').eq('credential_id', CRED).maybeSingle();
    expect(String(pk?.telegram_user_id).startsWith('enc:v2:')).toBe(true);
    expect(telegramIdMatches({ value: pk!.telegram_user_id as string, bidx: pk!.telegram_user_bidx as string }, TG_USER, 'admin_passkeys', 'telegram_user_id')).toBe(true);
    expect(telegramIdMatches({ value: pk!.telegram_user_id as string, bidx: pk!.telegram_user_bidx as string }, CHAT_OTHER, 'admin_passkeys', 'telegram_user_id')).toBe(false);

    // 8) legacy backfill dry-run/apply on synthetic plaintext row
    const legId = psql(`insert into public.gideon_device_requests (chat_id, replace, status) values ('9111000222', false, 'rejected') returning id::text`);
    const dry = await runTgDeviceIdBackfill([], [{ id: legId, value: '9111000222', bidx: null }], async () => true, false);
    expect(dry.planned).toBe(1);
    const esc = (s: string) => s.replace(/'/g, "''");
    const applied = await runTgDeviceIdBackfill([], [{ id: legId, value: '9111000222', bidx: null }], async (w) => {
      const n = psql(`update public.${w.table} set ${w.valueCol}='${esc(w.sealed)}', ${w.bidxCol}='${esc(w.bidx)}'
        where id='${esc(w.id)}' and ${w.bidxCol} is null and ${w.valueCol}='${esc(w.previous)}' returning 1`);
      return n === '1';
    }, true);
    expect(applied.written).toBe(1);
    expect(psql(`select chat_id like 'enc:v2:%' from public.gideon_device_requests where id='${legId}'`)).toBe('t');
    psql(`delete from public.gideon_device_requests where id='${legId}'`);
  }, 120_000);
});
