// Writes the enc-reject trigger migration from field-registry. Usage:
//   node --experimental-strip-types apps/web/scripts/gen-enc-triggers.mts supabase/migrations/000NNN_enc_reject_triggers_sync.sql
// When the registry changes, generate into a NEW claimed migration number (applied migrations are immutable);
// tests/enc-reject-triggers.test.ts checks that the newest generated migration matches the registry.
import { registerHooks } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.\w+$/.test(spec)) return next(spec + '.ts', ctx);
    return next(spec, ctx);
  },
});
const { encRejectTriggersSql, ENC_TRIGGER_MARK } = await import('../lib/security/enc-reject-triggers.ts');
const path = process.argv[2];
if (!path) throw new Error('usage: gen-enc-triggers.mts <migration path>');
let head = '';
try {
  const cur = readFileSync(path, 'utf8');
  const i = cur.indexOf(ENC_TRIGGER_MARK);
  head = i < 0 ? cur : cur.slice(0, i);
} catch { /* new file */ }
writeFileSync(path, head + encRejectTriggersSql());
