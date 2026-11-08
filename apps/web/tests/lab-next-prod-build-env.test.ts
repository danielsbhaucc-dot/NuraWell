import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('lab isolated Next production build env contract', () => {
  it('forces NODE_ENV=production after sourcing lab secrets (never leave development as build input)', () => {
    const sh = readFileSync(resolve(__dirname, '../../../scripts/lab-isolated-next-prod-build.sh'), 'utf8');
    expect(sh).toMatch(/source "\$SECRETS"/);
    expect(sh).toMatch(/export NODE_ENV=production/);
    // override must come after source
    const srcAt = sh.indexOf('source "$SECRETS"');
    const forceAt = sh.indexOf('export NODE_ENV=production');
    expect(srcAt).toBeGreaterThan(-1);
    expect(forceAt).toBeGreaterThan(srcAt);
    expect(sh).toMatch(/NURA_NEXT_DIST_DIR/);
    expect(sh).toMatch(/refusing build: NODE_ENV=/);
  });

  it('keeps next.config distDir default .next when NURA_NEXT_DIST_DIR unset', () => {
    const cfg = readFileSync(resolve(__dirname, '../next.config.js'), 'utf8');
    expect(cfg).toMatch(/distDir:\s*process\.env\.NURA_NEXT_DIST_DIR\s*\|\|\s*'\.next'/);
  });
});
