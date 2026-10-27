#!/usr/bin/env node
// One-command product generator. Scaffolds the INVISIBLE starter kit wiring + a minimal NEUTRAL shell + a required
// identity.json (no NuraWell theme is copied). CI (identity.mjs) stays red until the identity is filled and unique.
// Usage: node scripts/modules/new-product.mjs <id> "<display name>" [--customer] [--license subscription|perpetual]
//   default: owned by us (owned_by_us=true → licensing never disables modules). --customer → entitlement allowlist.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib.mjs';
import { STARTER_KIT } from './inventory.mjs';

export function scaffoldProduct(id, name, { customer = false, license = 'subscription', root = ROOT } = {}) {
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(id)) throw new Error('bad product id');
  if (!['subscription', 'perpetual'].includes(license)) throw new Error('license must be subscription|perpetual');
  const dir = join(root, 'apps', id);
  if (existsSync(dir)) throw new Error(`apps/${id} already exists`);
  const ownedByUs = !customer;
  const modules = [...new Set(STARTER_KIT.flatMap((k) => k.modules))];
  const files = {
    'identity.json': JSON.stringify({
      product: id, status: 'draft',
      story: 'TODO: what new thing this product invents, for whom, and why it feels like nothing else.',
      tone: 'TODO: voice in 3 words',
      palette: { primary: 'TODO', accent: 'TODO', background: 'TODO', ink: 'TODO' },
      typography: { display: 'TODO', body: 'TODO' },
      motion: 'TODO: motion language (e.g. springy, still, cinematic)',
      signatureInteraction: 'TODO: the one interaction people remember',
    }, null, 2) + '\n',
    'product.json': JSON.stringify({ id, name, ownedByUs, defaultLicenseType: ownedByUs ? null : license, starterKit: modules }, null, 2) + '\n',
    'central-registration.sql': `-- Apply to central after a backup. Registers the product (console, CRM, logs, QC, costs pick it up automatically).\n`
      + `insert into central.products (id, name, status, owned_by_us) values ('${id}', '${name.replace(/'/g, "''")}', 'active', ${ownedByUs}) on conflict (id) do nothing;\n`
      + (ownedByUs ? '' : `-- Customer product: entitle each purchased module, e.g.\n-- select public.central_crm_set_entitlement('<actor>', '${id}', '<module>', '${license}', 'active', ${license === 'perpetual' ? 'null' : "now() + interval '1 month'"}, null);\n`),
    'README.md': `# ${name}\n\nNeutral shell. Shared modules give auth, security, billing, notifications, AI and console registration; the look and story come ONLY from identity.json.\nFill identity.json, then get the owner's screenshot approval before merging visual work.\n\nOwnership: ${ownedByUs ? 'owned by us: modules never lock by licensing' : `customer product: only entitled modules work (default license: ${license})`}.\n`,
  };
  mkdirSync(dir, { recursive: true });
  for (const [f, c] of Object.entries(files)) writeFileSync(join(dir, f), c);
  return { dir: `apps/${id}`, ownedByUs, license: ownedByUs ? null : license, files: Object.keys(files) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [id, name, ...rest] = process.argv.slice(2);
  if (!id || !name) { console.error('usage: new-product.mjs <id> "<name>" [--customer] [--license subscription|perpetual]'); process.exit(2); }
  const li = rest.indexOf('--license');
  console.log(JSON.stringify(scaffoldProduct(id, name, { customer: rest.includes('--customer'), license: li >= 0 ? rest[li + 1] : 'subscription' }), null, 2));
}
