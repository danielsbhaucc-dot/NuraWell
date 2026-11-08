import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __resetFieldCrypto, decryptValue, setDekStoreForTests, type DekStore } from '@/lib/security/field-crypto';
import type { WrappedDek } from '@/lib/security/field-envelope';
import { SYSTEM_ROW } from '@/lib/security/field-registry';
import { sealTelegramId, telegramIdBidx, telegramIdMatches } from '@/lib/ceo/telegram-id-seal';
import { requestDevice, approveDeviceRequest } from '@/lib/ceo/security';

function memStore(): DekStore {
  const rows = new Map<string, WrappedDek>();
  return {
    async get(u) { return rows.get(u) ?? null; },
    async putIfAbsent(u, w) { if (!rows.has(u)) rows.set(u, w); return rows.get(u)!; },
  };
}

let prev: string | undefined;
beforeEach(() => {
  prev = process.env.PII_ENCRYPTION_KEY;
  process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  __resetFieldCrypto();
  setDekStoreForTests(memStore());
});
afterEach(() => { process.env.PII_ENCRYPTION_KEY = prev; __resetFieldCrypto(); setDekStoreForTests(null); });

describe('telegram device-id seal+bidx', () => {
  it('seals + domain-separates bidx; ownership match fail-closed', async () => {
    const id = '9100111222';
    const { sealed, bidx } = await sealTelegramId('admin_passkeys', 'telegram_user_id', id);
    expect(sealed.startsWith('enc:v2:')).toBe(true);
    expect(sealed.includes(id)).toBe(false);
    expect(bidx).toBe(telegramIdBidx('admin_passkeys', 'telegram_user_id', id));
    expect(telegramIdBidx('gideon_device_requests', 'chat_id', id)).not.toBe(bidx);
    expect(await decryptValue('admin_passkeys', 'telegram_user_id', 'system:ops', SYSTEM_ROW, sealed)).toBe(id);
    expect(telegramIdMatches({ value: sealed, bidx }, id, 'admin_passkeys', 'telegram_user_id')).toBe(true);
    expect(telegramIdMatches({ value: sealed, bidx }, '9999999999', 'admin_passkeys', 'telegram_user_id')).toBe(false);
    expect(telegramIdMatches({ value: sealed, bidx: null }, id, 'admin_passkeys', 'telegram_user_id')).toBe(false);
    expect(telegramIdMatches({ value: id, bidx: null }, id, 'admin_passkeys', 'telegram_user_id')).toBe(true);
  });

  it('missing key fails before credential/request state', async () => {
    delete process.env.PII_ENCRYPTION_KEY;
    __resetFieldCrypto();
    await expect(sealTelegramId('gideon_device_requests', 'chat_id', '12345')).rejects.toThrow();
    const db = { from: () => { throw new Error('db_should_not_run'); } };
    await expect(requestDevice(db as never, '12345', false)).rejects.toThrow(/telegram_id_key_missing/);
  });

  it('approveDeviceRequest refuses ciphertext at send/routing boundary (mock transport)', async () => {
    const db = {
      from: (table: string) => {
        if (table === 'ceo_audit_log') return { insert: async () => ({}) };
        return {
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => ({
                    data: { chat_id: 'enc:v2:CIPHERTEXT_ONLY', chat_bidx: 'x'.repeat(22), replace: false },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      },
    };
    const approved = await approveDeviceRequest(db as never, 'req-1', '00000000-0000-0000-0000-0000000000aa');
    expect(approved).toBeNull(); // no chatId routed / no Telegram send
  });
});
