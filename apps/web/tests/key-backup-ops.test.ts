import { describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';

vi.mock('server-only', () => ({}));

import { combineShares, decodeShare, openBackup } from '@/lib/crypto/key-backup';
import { buildKeyBackup, passphraseScore } from '@/lib/security/key-backup-server';
import { buildZip, renderGuide, renderShareCard } from '@/lib/security/key-backup-bundle';
import { decryptSecret, encryptSecret } from '@/lib/ceo/settings';

const PASS = 'חתול-ירוק-שוקולד-ים-47';

describe('ops key backup', () => {
  const env = { PII_ENCRYPTION_KEY: randomBytes(32).toString('base64'), SECURE_VAULT_KEY: 'v-' + randomBytes(8).toString('hex'), SUPABASE_SERVICE_ROLE_KEY: 'srk-test' } as NodeJS.ProcessEnv;

  it('returns only ciphertext + shares, restorable both ways, gideon key derived', () => {
    const b = buildKeyBackup(PASS, env);
    expect(JSON.stringify(b)).not.toContain(env.PII_ENCRYPTION_KEY!);
    expect(JSON.stringify(b)).not.toContain(env.SECURE_VAULT_KEY!);
    expect(b.gideonDerived).toBe(true);
    const a = openBackup(b.sealed, PASS);
    expect(a.PII_ENCRYPTION_KEY).toBe(env.PII_ENCRYPTION_KEY);
    const rec = combineShares([decodeShare(b.shares[2]), decodeShare(b.shares[0])]);
    const c = openBackup(b.recovery, rec.toString('base64url'));
    expect(c).toEqual(a);
    expect(Object.keys(a).sort()).toEqual(['GIDEON_SETTINGS_KEY', 'PII_ENCRYPTION_KEY', 'SECURE_VAULT_KEY']);
  });

  it('derived gideon key decrypts legacy secrets when set explicitly', () => {
    const b = buildKeyBackup(PASS, env);
    const restored = openBackup(b.sealed, PASS);
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'srk-test');
    vi.stubEnv('GIDEON_SETTINGS_KEY', '');
    const legacyBlob = encryptSecret('tok-123');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'rotated');
    vi.stubEnv('GIDEON_SETTINGS_KEY', restored.GIDEON_SETTINGS_KEY);
    expect(decryptSecret(legacyBlob)).toBe('tok-123');
    vi.unstubAllEnvs();
  });

  it('passphrase strength', () => {
    expect(passphraseScore('short')).toBeLessThan(3);
    expect(passphraseScore('aaaaaaaaaaaaaaaaaaaa')).toBeLessThan(3);
    expect(passphraseScore(PASS)).toBeGreaterThanOrEqual(3);
  });

  it('zip never contains the shares; docs render', () => {
    const b = buildKeyBackup(PASS, env);
    const files = unzipSync(buildZip(b));
    const names = Object.keys(files);
    expect(names.some((n) => n.endsWith('keys.sealed.json'))).toBe(true);
    const all = Object.values(files).map((u) => strFromU8(u)).join('\n');
    for (const s of b.shares) expect(all).not.toContain(s.split('-').pop()!);
    expect(renderGuide(b)).toContain(b.inventory[0].fingerprint);
    expect(renderShareCard(b.shares[0], 1, b.createdAt)).toContain('NWKS1');
  });
});
