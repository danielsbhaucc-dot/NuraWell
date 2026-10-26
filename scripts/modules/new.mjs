#!/usr/bin/env node
// Module-first scaffold: every new feature, in any product, starts life as a module.
// Usage: node scripts/modules/new.mjs <id> [--tier internal|shareable|sellable] [--category feature|ui|ops|platform|security|privacy] [--root <repo>]
//    or: npx @platform/modules new <id> ...
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, findModules, dependencyOrder, renderIndex, renderLlms } from './lib.mjs';

export function scaffold(id, { tier = 'internal', category = 'feature', root = ROOT, description } = {}) {
  if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error(`bad id "${id}" (lowercase, digits, dashes)`);
  if (!['internal', 'shareable', 'sellable'].includes(tier)) throw new Error('tier must be internal|shareable|sellable');
  if (!['security', 'privacy', 'platform', 'feature', 'ui', 'ops'].includes(category)) throw new Error('bad category');
  const rel = `packages/@platform/${id}`;
  const dir = join(root, rel);
  if (existsSync(dir)) throw new Error(`${rel} already exists`);
  const alwaysOn = category === 'security' || category === 'privacy';
  const testRel = `apps/web/tests/mod-${id}.test.ts`;
  const desc = description ?? `TODO: describe what the ${id} module does (one sentence, 20+ chars).`;
  const files = {
    'module.json': JSON.stringify({
      $schema: '../../../modules/module.schema.json', id, package: `@platform/${id}`, version: '0.1.0',
      distribution: tier, category, toggleable: !alwaysOn, description: desc,
      provides: { routes: [], apis: [], jobs: [], ui: [], tables: [] }, requires: { modules: {} },
      env: [], migrations: [], conformance: ['config-secure-defaults', 'disabled-means-404'], tests: [testRel],
      dataPolicy: 'TODO: what data this module stores, where, and what happens to it when the module is disabled or removed.',
    }, null, 2) + '\n',
    'package.json': JSON.stringify({ name: `@platform/${id}`, version: '0.1.0', private: tier !== 'sellable', description: desc, main: 'src/index.ts', types: 'src/index.ts' }, null, 2) + '\n',
    'config.schema.json': JSON.stringify({
      $schema: 'https://json-schema.org/draft/2020-12/schema', title: `${id} config`, type: 'object', additionalProperties: false,
      properties: {
        enabled: { type: 'boolean', default: alwaysOn, description: alwaysOn ? 'security/privacy: always on' : 'off until an admin enables it per product' },
        allowedRoles: { type: 'array', items: { type: 'string' }, default: ['admin'], description: 'least privilege by default' },
        logPii: { const: false, default: false, description: 'PII never goes to logs' },
        retentionDays: { type: 'integer', minimum: 1, maximum: 3650, default: 30 },
      },
    }, null, 2) + '\n',
    'src/config.ts': `// Secure defaults. Config is injected by the host product; modules never read env vars.\nexport interface ${pascal(id)}Config { enabled: boolean; allowedRoles: string[]; logPii: false; retentionDays: number }\nexport const defaultConfig: ${pascal(id)}Config = Object.freeze({ enabled: ${alwaysOn}, allowedRoles: ['admin'], logPii: false, retentionDays: 30 }) as ${pascal(id)}Config;\nexport function resolveConfig(input: Partial<${pascal(id)}Config> = {}): ${pascal(id)}Config {\n  const c = { ...defaultConfig, ...input, logPii: false as const };\n  if (!Number.isInteger(c.retentionDays) || c.retentionDays < 1 || c.retentionDays > 3650) c.retentionDays = defaultConfig.retentionDays;\n  return c;\n}\n`,
    'src/index.ts': `export * from './config';\n`,
    'migrations/.gitkeep': '',
    'README.he.md': `# ${id}\n\n${desc}\n\n- רמת הפצה: ${tier}\n- קטגוריה: ${category}${alwaysOn ? ' (תמיד פועל, לא ניתן לכיבוי)' : ' (כבוי כברירת מחדל, מופעל בלחיצה לכל מוצר)'}\n- הגדרות: \`config.schema.json\` (ברירות מחדל מאובטחות)\n- מיגרציות: \`migrations/\` (מותקנות בקידומת \`mod_${id}_\`)\n- בדיקות התאמה: \`${testRel}\`\n`,
    'llms.txt': `# @platform/${id}\n\n> ${desc}\n\n- distribution: ${tier}\n- config: config.schema.json (secure defaults; injected, never from env)\n- migrations: migrations/\n`,
    'CHANGELOG.md': `# Changelog\n\n## 0.1.0\n\n- Scaffolded.\n`,
  };
  for (const [f, body] of Object.entries(files)) {
    mkdirSync(join(dir, f, '..'), { recursive: true });
    writeFileSync(join(dir, f), body);
  }
  const testAbs = join(root, testRel);
  mkdirSync(join(testAbs, '..'), { recursive: true });
  writeFileSync(testAbs, `import { describe, it, expect } from 'vitest';\nimport { resolveConfig, defaultConfig } from '../../../${rel}/src/config';\n\ndescribe('${id} conformance', () => {\n  it('config-secure-defaults', () => {\n    expect(defaultConfig.enabled).toBe(${alwaysOn});\n    expect(defaultConfig.allowedRoles).toEqual(['admin']);\n    expect(resolveConfig({ logPii: true as never }).logPii).toBe(false);\n  });\n  it.todo('disabled-means-404: routes/APIs return 404 and jobs do not run when disabled');\n});\n`);
  const mods = dependencyOrder(findModules(root));
  writeFileSync(join(root, 'modules/INDEX.md'), renderIndex(mods));
  writeFileSync(join(root, 'llms.txt'), renderLlms(mods));
  return { dir: rel, test: testRel };
}
function pascal(s) { return s.replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase()); }

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  const opt = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  const id = a.find((x, i) => !x.startsWith('--') && !(i > 0 && a[i - 1].startsWith('--')));
  if (!id) { console.error('usage: new <id> [--tier internal|shareable|sellable] [--category ...]'); process.exit(1); }
  try {
    const r = scaffold(id, { tier: opt('--tier'), category: opt('--category'), root: opt('--root') ?? ROOT });
    console.log(`created ${r.dir} and ${r.test}; index regenerated. Next: fill description/dataPolicy, then node scripts/modules/check.mjs`);
  } catch (e) { console.error(String(e.message ?? e)); process.exit(1); }
}
