import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = join(__dirname, '..', '..', '..');
describe('platform-core shared packages (installed, not copied)', () => {
  it('installed files match core-lock.json (no local edits)', () => {
    expect(execFileSync('node', ['scripts/core-sync.mjs', '--check'], { cwd: root, encoding: 'utf8' })).toMatch(/files match platform-core@/);
  });
  it('static security headers are exactly the previous production set', async () => {
    // skipcq: JS-0359 -- next.config.js is CommonJS
    const cfg = require('../next.config.js');
    const rules = await cfg.headers();
    const all = Object.fromEntries(rules[0].headers.map((h: { key: string; value: string }) => [h.key, h.value]));
    expect(all).toEqual({
      'Cross-Origin-Embedder-Policy': 'unsafe-none', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Resource-Policy': 'same-site',
      'X-Permitted-Cross-Domain-Policies': 'none', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN',
      'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    });
  });
  it('NuraWell code imports the shared packages', () => {
    const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
    expect(read('lib/api/rate-limit.ts')).toMatch(/from '@core\/security-privacy\/rate-limit'/);
    expect(read('lib/central/usage-feed.ts')).toMatch(/from '@core\/security-privacy\/feed'/);
    expect(read('lib/logs/signals.ts')).toMatch(/@core\/security-privacy\/feed/);
  });
});
