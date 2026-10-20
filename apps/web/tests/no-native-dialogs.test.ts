import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * שומר: אסור להשתמש ב-alert/confirm/prompt המובנים של הדפדפן.
 * יש להשתמש ב-confirmDialog/alertDialog/promptDialog מ-'@/components/shared/dialogs'.
 */
const ROOT = join(__dirname, '..');
const DIRS = ['app', 'components', 'lib', 'hooks', 'proxy.ts', 'instrumentation.ts'];
const PATTERN = /(^|[^.\w$])(?:(?:window|globalThis|self)\s*\.\s*)?(alert|confirm|prompt)\s*\(/;
const BRACKET = /(?:window|globalThis|self)\s*\[\s*['"`](alert|confirm|prompt)['"`]\s*\]/;

function walk(p: string, out: string[]) {
  let st;
  try {
    st = statSync(p);
  } catch {
    return;
  }
  if (st.isDirectory()) {
    for (const f of readdirSync(p)) {
      if (f === 'node_modules' || f.startsWith('.')) continue;
      walk(join(p, f), out);
    }
  } else if (/\.(tsx?|jsx?|mjs)$/.test(p)) out.push(p);
}

function stripComments(src: string) {
  return src
    .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, "''").replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('no native browser dialogs', () => {
  it('source has no alert()/confirm()/prompt() calls', () => {
    const files: string[] = [];
    for (const d of DIRS) walk(join(ROOT, d), files);
    expect(files.length).toBeGreaterThan(50);
    const hits: string[] = [];
    for (const f of files) {
      const lines = stripComments(readFileSync(f, 'utf8')).split('\n');
      lines.forEach((line, i) => {
        if (PATTERN.test(line) || BRACKET.test(line)) hits.push(`${relative(ROOT, f)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
