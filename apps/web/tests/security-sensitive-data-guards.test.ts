import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CI guards against accidental exposure of sensitive data:
 *  1. Client components never query the DB directly (all data flows through authorised server routes).
 *  2. Client bundles never import the service-role client or field-encryption keys.
 *  3. No console.* call logs a sensitive field (health, chat content, contact details, secrets).
 */
const ROOT = join(__dirname, '..');
const DIRS = ['app', 'components', 'lib', 'hooks'];

function walk(dir: string): string[] {
  let out: string[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const n of names) {
    if (n === 'node_modules' || n.startsWith('.')) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}

const files = DIRS.flatMap((d) => walk(join(ROOT, d))).concat([join(ROOT, 'proxy.ts')]);
const src = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));
const clientFiles = files.filter((f) => /^\s*['"]use client['"]/.test(src.get(f)!));

const SENSITIVE =
  /console\.(?:log|info|warn|error|debug)\([^;]*\b\w+\.(?:health_conditions|ai_system_prompt|dietary_preferences|main_obstacle_detail|phone|email|full_name|user_message|assistant_message|content|password|ciphertext|weight|notes?)\b/;

describe('sensitive data exposure guards', () => {
  it('finds client components', () => expect(clientFiles.length).toBeGreaterThan(50));

  it('client components never query Supabase tables directly', () => {
    const bad = clientFiles.filter((f) => /\.from\(\s*['"`][a-z_]+['"`]\s*\)/.test(src.get(f)!));
    expect(bad.map((f) => relative(ROOT, f))).toEqual([]);
  });

  it('client components never import the service-role client or PII crypto', () => {
    const bad = clientFiles.filter((f) =>
      /from\s+['"][^'"]*(supabase\/admin|crypto\/pii|secure-vault\/crypto|security\/kms-envelope)['"]/.test(src.get(f)!),
    );
    expect(bad.map((f) => relative(ROOT, f))).toEqual([]);
  });

  it('no console.* call logs a sensitive field', () => {
    const bad = files.filter((f) => SENSITIVE.test(src.get(f)!));
    expect(bad.map((f) => relative(ROOT, f))).toEqual([]);
  });
});
