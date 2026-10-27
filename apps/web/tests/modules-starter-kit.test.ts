import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error plain .mjs CI scripts
import { checkIdentities } from '../../../scripts/modules/identity.mjs';
// @ts-expect-error plain .mjs CI scripts
import { scaffoldProduct } from '../../../scripts/modules/new-product.mjs';
// @ts-expect-error plain .mjs CI scripts
import { build, nameHits, STARTER_KIT } from '../../../scripts/modules/inventory.mjs';

const ok = (p: string, primary: string, display: string) => ({ product: p, status: 'approved', story: 's', tone: 't', palette: { primary, accent: '#111111', background: '#222222', ink: '#333333' }, typography: { display, body: 'b' }, motion: 'm', signatureInteraction: 'x' });

describe('principle #1: every product has its own identity', () => {
  it('flags a product that reuses another product\'s tokens or display font', () => {
    expect(checkIdentities([['a', ok('a', '#000001', 'A')], ['b', { ...ok('b', '#000002', 'B'), palette: { primary: '#000002', accent: '#aaaaaa', background: '#bbbbbb', ink: '#cccccc' } }]])).toEqual([]);
    expect(checkIdentities([['a', ok('a', '#000001', 'A')], ['b', ok('b', '#000001', 'B')]]).join()).toMatch(/reuses/);
    expect(checkIdentities([['a', ok('a', '#000001', 'A')], ['b', { ...ok('b', '#000002', 'A'), palette: { primary: '#000002', accent: '#aaaaaa', background: '#bbbbbb', ink: '#cccccc' } }]]).join()).toMatch(/display font/);
    expect(checkIdentities([['c', null]]).join()).toMatch(/missing/);
  });
  it('the real products are distinct', () => {
    const rd = (a: string) => JSON.parse(readFileSync(join(__dirname, `../../${a}/identity.json`), 'utf8'));
    expect(checkIdentities([['web', rd('web')], ['sample-product', rd('sample-product')]])).toEqual([]);
  });
});

describe('one-command product generator', () => {
  it('owned product: owned_by_us=true, identity required (TODO fails CI), no NuraWell theme copied', () => {
    const root = mkdtempSync(join(tmpdir(), 'np-'));
    const r = scaffoldProduct('acme', 'Acme', { root });
    expect(r.ownedByUs).toBe(true);
    const id = JSON.parse(readFileSync(join(root, 'apps/acme/identity.json'), 'utf8'));
    expect(checkIdentities([['acme', id]]).length).toBeGreaterThan(0);
    expect(JSON.stringify(id)).not.toMatch(/#10b981/i);
    expect(readFileSync(join(root, 'apps/acme/central-registration.sql'), 'utf8')).toContain("'active', true)");
  });
  it('customer product carries its license type (subscription | perpetual)', () => {
    const root = mkdtempSync(join(tmpdir(), 'np-'));
    const r = scaffoldProduct('shop', 'Shop', { root, customer: true, license: 'perpetual' });
    expect(r).toMatchObject({ ownedByUs: false, license: 'perpetual' });
    expect(JSON.parse(readFileSync(join(root, 'apps/shop/product.json'), 'utf8')).defaultLicenseType).toBe('perpetual');
    expect(() => scaffoldProduct('x1', 'X', { root, customer: true, license: 'lifetime' })).toThrow();
  });
});

describe('inventory + starter kit + no owner name', () => {
  it('every starter-kit item maps to registered modules; mandatory ones are core', () => {
    expect(STARTER_KIT.length).toBe(10);
    expect(build().errors).toEqual([]);
  });
  it('name guard matches by hash only', () => {
    expect(nameHits('support via the library owner')).toBe(0);
    expect(nameHits('hello', new Set(['2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824']))).toBe(1);
  });
});
