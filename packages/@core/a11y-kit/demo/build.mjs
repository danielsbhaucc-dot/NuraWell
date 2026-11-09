// Builds the static demo: src/*.ts → demo/dist/kit/*.js (TypeScript transpile only, no bundler, no new deps) + self-hosted fonts.
// Run: node packages/a11y-kit/demo/build.mjs  →  serve packages/a11y-kit/demo/dist over http (same-origin fonts).
import ts from 'typescript'; import { readFileSync, writeFileSync, mkdirSync, readdirSync, cpSync, rmSync } from 'node:fs'; import { join, dirname } from 'node:path'; import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), src = join(here, '..', 'src'), out = join(here, 'dist');
rmSync(out, { recursive: true, force: true }); mkdirSync(join(out, 'kit'), { recursive: true });
for (const f of readdirSync(src).filter((x) => x.endsWith('.ts'))) {
  const js = ts.transpileModule(readFileSync(join(src, f), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  writeFileSync(join(out, 'kit', f.replace(/\.ts$/, '.js')), js.replace(/from '(\.\/[\w-]+)\.ts'/g, "from '$1.js'"));
}
cpSync(join(here, '..', 'assets', 'fonts'), join(out, 'a11y-fonts'), { recursive: true });
cpSync(join(here, 'index.html'), join(out, 'index.html'));
console.log('demo built →', out);
