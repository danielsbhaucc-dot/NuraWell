#!/usr/bin/env node
// Principle #1: every product is UNIQUE. Shared modules are invisible infrastructure, never a shared look.
// Every product app (apps/<id>) must have identity.json: story, tone, palette, typography, motion, signature interaction.
// CI fails when an identity field is missing/TODO, or when a product reuses another product's visual tokens as-is
// (same primary/accent/background/ink, or the same display font). An identity with status "proposed" is allowed
// (awaiting the owner's screenshot approval) but is still checked for uniqueness.
// Usage: node scripts/modules/identity.mjs
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib.mjs';

export const REQUIRED = ['product', 'status', 'story', 'tone', 'palette', 'typography', 'motion', 'signatureInteraction'];
export const PALETTE_KEYS = ['primary', 'accent', 'background', 'ink'];

export function checkIdentities(ids) {
  const errors = [];
  for (const [app, id] of ids) {
    if (!id) { errors.push(`apps/${app}: identity.json missing (run node scripts/modules/new-product.mjs, then fill it)`); continue; }
    for (const k of REQUIRED) if (id[k] == null || JSON.stringify(id[k]).includes('TODO')) errors.push(`apps/${app}/identity.json: "${k}" is missing or TODO`);
    for (const k of PALETTE_KEYS) if (!/^#[0-9a-fA-F]{6}$/.test(id.palette?.[k] ?? '')) errors.push(`apps/${app}/identity.json: palette.${k} must be #rrggbb`);
  }
  const list = ids.filter(([, i]) => i?.palette);
  for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
    const [x, i] = list[a], [y, j] = list[b];
    const same = PALETTE_KEYS.filter((k) => i.palette[k]?.toLowerCase() === j.palette[k]?.toLowerCase());
    if (same.includes('primary') || same.length >= 2) errors.push(`apps/${y} reuses apps/${x}'s visual tokens (${same.join(', ')}). Each product needs its own identity.`);
    if (i.typography?.display && i.typography.display === j.typography?.display) errors.push(`apps/${y} reuses apps/${x}'s display font "${i.typography.display}".`);
  }
  return errors;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const apps = readdirSync(join(ROOT, 'apps'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const ids = apps.map((a) => { const f = join(ROOT, 'apps', a, 'identity.json'); return [a, existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null]; });
  const errors = checkIdentities(ids);
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log(`identity ok (${ids.length} products, all distinct)`);
}
