import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { __resetFieldCrypto, setDekStoreForTests, decryptValue } from '@/lib/security/field-crypto';

const DST = 'nurawell_restore_pii_20261108T195812Z';
const UID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
const DOB = '1992-07-21';

describe('recovery content decrypt', () => {
  it('decrypts restored sealed DOB with kept local key + restored DEK wrap', async () => {
    for (const line of readFileSync('/workspace/local-lab-paired/secrets/next-a.env', 'utf8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m) process.env[m[1]] = m[2];
    }
    const cipher = execFileSync('psql', ['-h', '127.0.0.1', '-U', 'postgres', '-d', DST, '-Atq', '-c', `select date_of_birth from public.profiles where id='${UID}'`], { encoding: 'utf8' }).trim();
    const wrappedJson = execFileSync('psql', ['-h', '127.0.0.1', '-U', 'postgres', '-d', DST, '-Atq', '-c', `select wrapped::text from public.user_data_keys where user_id='${UID}'`], { encoding: 'utf8' }).trim();
    expect(cipher.startsWith('enc:v2:')).toBe(true);
    expect(cipher.includes('1992')).toBe(false);
    const wrapped = JSON.parse(wrappedJson);
    __resetFieldCrypto();
    setDekStoreForTests({
      async get(u) { return u === UID ? wrapped : null; },
      async putIfAbsent(_u, w) { return w; },
    });
    const plain = await decryptValue('profiles', 'date_of_birth', UID, UID, cipher);
    expect(plain).toBe(DOB);
  }, 30_000);
});
