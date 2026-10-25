import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { VAULT_KIND_LABEL, type VaultKind } from './crypto-labels';
import { ensureKmsKeysSync } from '@/lib/security/kms-envelope';
export { VAULT_KINDS, VAULT_KIND_LABEL, type VaultKind } from './crypto-labels';

function key(): Buffer {
  ensureKmsKeysSync();
  const raw = process.env.SECURE_VAULT_KEY?.trim();
  if (!raw) throw new Error('SECURE_VAULT_KEY missing');
  const k = Buffer.from(raw, raw.length === 64 && /^[0-9a-f]+$/i.test(raw) ? 'hex' : 'base64');
  if (k.length !== 32) throw new Error('SECURE_VAULT_KEY must be 32 bytes');
  return k;
}

/** AES-256-GCM; AAD binds ciphertext to its owner so rows can't be swapped between users. */
export function encryptVault(plain: string, userId: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  c.setAAD(Buffer.from(userId));
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return { ciphertext: ct.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64') };
}

export function decryptVault(row: { ciphertext: string; iv: string; tag: string }, userId: string): string {
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(row.iv, 'base64'), { authTagLength: 16 });
  d.setAAD(Buffer.from(userId));
  d.setAuthTag(Buffer.from(row.tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(row.ciphertext, 'base64')), d.final()]).toString('utf8');
}

export const newVaultRef = () => `[[VAULT:${randomBytes(4).toString('hex')}]]`;

/** The only chat text produced by a vault save — type only, never the value. */
export const vaultChatNotice = (kind: VaultKind) => `🔒 שמרתי בכספת המאובטחת פריט מסוג ${VAULT_KIND_LABEL[kind]}.`;
