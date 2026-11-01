import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Security floors for transitive Python deps of the GCP KMS functions (infra/gcp-kms).
// A fresh install already resolves fixed versions; these floors stop a cached/old resolve from regressing.
const dir = join(__dirname, '../../../infra/gcp-kms');
const floors: Record<string, Record<string, string>> = {
  rotator: { starlette: '1.3.1', anyio: '4.14.2', idna: '3.15' },
  killswitch: { starlette: '1.3.1', anyio: '4.14.2', idna: '3.15', pyasn1: '0.6.5' },
};

// Zero-padded 3-part key so plain string comparison orders versions correctly.
const versionKey = (v: string): string =>
  [...v.split('.'), '0', '0'].slice(0, 3).map((n) => n.padStart(6, '0')).join('.');

describe('KMS function requirements keep security minimums', () => {
  for (const [fn, pins] of Object.entries(floors)) {
    const req = readFileSync(join(dir, fn, 'requirements.txt'), 'utf8');
    for (const [pkg, min] of Object.entries(pins)) {
      it(`${fn}: ${pkg}>=${min}`, () => {
        const line = req.split('\n').find((l) => l.trim().toLowerCase().startsWith(`${pkg}>=`)) ?? '';
        expect(line, `${pkg} floor missing in ${fn}/requirements.txt`).not.toBe('');
        const spec = (line.split('>=')[1] ?? '').trim().split(/[\s,#;]/)[0] ?? '';
        expect(versionKey(spec) >= versionKey(min), `${pkg} floor in ${fn} is below ${min}`).toBe(true);
      });
    }
  }
});
