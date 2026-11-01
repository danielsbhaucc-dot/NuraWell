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

describe('KMS function requirements keep security minimums', () => {
  for (const [fn, pins] of Object.entries(floors)) {
    const req = readFileSync(join(dir, fn, 'requirements.txt'), 'utf8');
    for (const [pkg, min] of Object.entries(pins)) {
      it(`${fn}: ${pkg}>=${min}`, () => {
        const line = req.split('\n').find((l) => l.trim().toLowerCase().startsWith(`${pkg}>=`));
        expect(line, `${pkg} floor missing in ${fn}/requirements.txt`).toBeDefined();
        const got = line!.split('>=')[1].trim().split(/[\s,#;]/)[0].split('.').map(Number);
        const want = min.split('.').map(Number);
        const cmp = got.map((n, i) => n - (want[i] ?? 0)).find((d) => d !== 0) ?? 0;
        expect(cmp, `${pkg} floor in ${fn} is below ${min}`).toBeGreaterThanOrEqual(0);
      });
    }
  }
});
