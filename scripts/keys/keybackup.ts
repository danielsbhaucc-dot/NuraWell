/**
 * NuraWell offline key backup. Node >= 22: node --experimental-strip-types scripts/keys/keybackup.ts <cmd>
 *
 *   backup <outDir>  Reads key VALUES from env (PII_ENCRYPTION_KEY, SECURE_VAULT_KEY, GIDEON_SETTINGS_KEY,
 *                    CONSENT_SIGNING_PRIVATE_KEY — whichever are set) and the passphrase from KEYBACKUP_PASSPHRASE.
 *                    Writes keys.sealed.json (passphrase-encrypted), keys.recovery.json (encrypted with a random
 *                    recovery key) and share-1/2/3.txt (Shamir 2-of-3 of that recovery key).
 *                    Prints only key names + short fingerprints, never values.
 *   restore <dir>    With KEYBACKUP_PASSPHRASE, or SHARES=a.txt,b.txt (any two) → <dir>/restored.env (mode 600).
 *   drill            Full restore drill on throwaway keys (non-prod).
 */
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { combineShares, decodeShare, encodeShare, openBackup, sealBackup, splitSecret } from '../../apps/web/lib/crypto/key-backup.ts';

const NAMES = ['PII_ENCRYPTION_KEY', 'SECURE_VAULT_KEY', 'GIDEON_SETTINGS_KEY', 'CONSENT_SIGNING_PRIVATE_KEY', 'DB_BACKUP_AGE_IDENTITY'];
const fp = (v: string) => createHash('sha256').update(v).digest('hex').slice(0, 12);

function backup(out: string, keys: Record<string, string>, pass: string) {
  mkdirSync(out, { recursive: true, mode: 0o700 });
  const recovery = randomBytes(32);
  writeFileSync(join(out, 'keys.sealed.json'), sealBackup(keys, pass), { mode: 0o600 });
  writeFileSync(join(out, 'keys.recovery.json'), sealBackup(keys, recovery.toString('base64url')), { mode: 0o600 });
  splitSecret(recovery, 3, 2).forEach((s, i) => writeFileSync(join(out, `share-${i + 1}.txt`), `${encodeShare(s)}\n`, { mode: 0o600 }));
  recovery.fill(0);
  for (const [k, v] of Object.entries(keys)) console.log(`backed up ${k} fp=${fp(v)}`);
}

function restore(dir: string): Record<string, string> {
  const pass = process.env.KEYBACKUP_PASSPHRASE;
  if (pass) return openBackup(readFileSync(join(dir, 'keys.sealed.json'), 'utf8'), pass);
  const files = (process.env.SHARES ?? '').split(',').filter(Boolean);
  const rec = combineShares(files.map((f) => decodeShare(readFileSync(f, 'utf8'))));
  return openBackup(readFileSync(join(dir, 'keys.recovery.json'), 'utf8'), rec.toString('base64url'));
}

function writeEnv(dir: string, keys: Record<string, string>) {
  const p = join(dir, 'restored.env');
  writeFileSync(p, `${Object.entries(keys).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('\n')}\n`, { mode: 0o600 });
  chmodSync(p, 0o600);
  for (const [k, v] of Object.entries(keys)) console.log(`restored ${k} fp=${fp(v)} -> ${p}`);
}

function drill() {
  const dir = join('/tmp', `nw-key-drill-${Date.now()}`);
  const pii = randomBytes(32).toString('base64');
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', Buffer.from(pii, 'base64'), iv);
  c.setAAD(Buffer.from('user-1'));
  const ct = Buffer.concat([c.update('sample PII שלום', 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  const pass = randomBytes(24).toString('base64url');
  backup(dir, { PII_ENCRYPTION_KEY: pii }, pass);
  const check = (keys: Record<string, string>, how: string) => {
    const d = createDecipheriv('aes-256-gcm', Buffer.from(keys.PII_ENCRYPTION_KEY, 'base64'), iv, { authTagLength: 16 });
    d.setAAD(Buffer.from('user-1'));
    d.setAuthTag(tag);
    const ok = Buffer.concat([d.update(ct), d.final()]).toString('utf8') === 'sample PII שלום';
    console.log(`drill ${how}: ${ok ? 'PASS' : 'FAIL'}`);
    if (!ok) process.exit(1);
  };
  process.env.KEYBACKUP_PASSPHRASE = pass;
  check(restore(dir), 'passphrase');
  delete process.env.KEYBACKUP_PASSPHRASE;
  for (const pair of [[1, 2], [1, 3], [2, 3]]) {
    process.env.SHARES = pair.map((n) => join(dir, `share-${n}.txt`)).join(',');
    check(restore(dir), `shares ${pair.join('+')}`);
  }
  process.env.SHARES = join(dir, 'share-1.txt');
  try {
    restore(dir);
    console.log('drill single-share: FAIL');
    process.exit(1);
  } catch {
    console.log('drill single-share refused: PASS');
  }
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'drill') drill();
else if (cmd === 'backup' && arg) {
  const keys = Object.fromEntries(NAMES.filter((n) => process.env[n]?.trim()).map((n) => [n, String(process.env[n]).trim()]));
  if (!Object.keys(keys).length) throw new Error('no key values in env');
  backup(arg, keys, process.env.KEYBACKUP_PASSPHRASE ?? '');
} else if (cmd === 'restore' && arg) writeEnv(arg, restore(arg));
else console.log('usage: keybackup.ts backup <outDir> | restore <dir> | drill');
