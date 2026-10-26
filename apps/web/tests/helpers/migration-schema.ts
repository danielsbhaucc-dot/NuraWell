/**
 * Replays supabase/migrations (in order) far enough to know every public column and its type:
 * CREATE TABLE, ALTER TABLE ADD/DROP/RENAME COLUMN, ALTER COLUMN TYPE, RENAME TO, DROP TABLE.
 * Text-like = text, varchar, char, citext, json, jsonb, bytea and their arrays.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type Schema = Map<string, Map<string, string>>;
const TEXTY = /^(text|character varying|varchar|character|char|bpchar|citext|jsonb?|bytea)\b(\s*\(\s*\d+\s*\))?(\s*\[\])?$/i;
export const isTextLike = (type: string) => TEXTY.test(type.trim()) || /^(text|varchar|jsonb?|citext)\s*\[\]$/i.test(type.trim());

const ident = String.raw`(?:"[^"]+"|[a-zA-Z_][\w$]*)`;
const qname = String.raw`(?:(?:public|"public")\.)?(${ident})`;
const unq = (s: string) => s.replace(/^"|"$/g, '').toLowerCase();

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}
/** remove function bodies ($$...$$ / $tag$...$tag$) so DDL inside them (dynamic SQL) is ignored */
function stripDollar(sql: string): string {
  return sql.replace(/\$([a-zA-Z_]*)\$[\s\S]*?\$\1\$/g, "''");
}
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '', q = false;
  for (const ch of s) {
    if (ch === "'") q = !q;
    if (!q && ch === '(') depth++;
    if (!q && ch === ')') depth--;
    if (!q && depth === 0 && ch === ',') { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}
function colType(rest: string): string {
  const m = rest.match(/^\s*((?:character varying|double precision|timestamp(?:tz)?(?:\s+with(?:out)?\s+time\s+zone)?|time(?:\s+with(?:out)?\s+time\s+zone)?|[a-zA-Z_][\w.]*)(?:\s*\([^)]*\))?(?:\s*\[\])?)/i);
  return (m?.[1] ?? '').replace(/^public\./i, '').toLowerCase();
}

export function schemaFromMigrations(dir: string): Schema {
  const s: Schema = new Map();
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = stripDollar(stripComments(readFileSync(join(dir, f), 'utf8')));
    for (const stmt0 of sql.split(/;\s*/)) {
      const stmt = stmt0.trim().replace(/\s+/g, ' ');
      let m: RegExpMatchArray | null;
      if ((m = stmt.match(new RegExp(`^create (?:unlogged )?table (?:if not exists )?${qname} \\((.*)\\)`, 'i')))) {
        if (/^(?:\w+)\./.test(stmt.replace(/^create (?:unlogged )?table (?:if not exists )?/i, '')) && !/^(?:create (?:unlogged )?table (?:if not exists )?)(public|"public")\./i.test(stmt)) continue;
        const t = unq(m[1]);
        if (s.has(t) && /if not exists/i.test(stmt)) continue;
        const cols = new Map<string, string>();
        for (const part of splitTop(m[2])) {
          const p = part.trim();
          if (/^(constraint|primary key|unique|check|foreign key|exclude|like)\b/i.test(p)) continue;
          const cm = p.match(new RegExp(`^(${ident})\\s+(.*)$`, 's'));
          if (cm) cols.set(unq(cm[1]), colType(cm[2]));
        }
        s.set(t, cols);
        continue;
      }
      if ((m = stmt.match(new RegExp(`^drop table (?:if exists )?(.*?)(?: cascade| restrict)?$`, 'i')))) {
        for (const n of m[1].split(',')) s.delete(unq(n.trim().replace(/^(public|"public")\./i, '')));
        continue;
      }
      if ((m = stmt.match(new RegExp(`^alter table (?:if exists )?(?:only )?${qname} (.*)$`, 'i')))) {
        if (/^alter table (?:if exists )?(?:only )?(?!public\.|"public"\.)\w+\.\w+/i.test(stmt)) continue;
        const t = unq(m[1]);
        const rest = m[2];
        let r: RegExpMatchArray | null;
        if ((r = rest.match(/^rename to (\S+)$/i))) {
          const cols = s.get(t);
          if (cols) { s.delete(t); s.set(unq(r[1]), cols); }
          continue;
        }
        if ((r = rest.match(new RegExp(`^rename (?:column )?(${ident}) to (${ident})$`, 'i')))) {
          const cols = s.get(t);
          const ty = cols?.get(unq(r[1]));
          if (cols && ty !== undefined) { cols.delete(unq(r[1])); cols.set(unq(r[2]), ty); }
          continue;
        }
        const cols = s.get(t) ?? new Map<string, string>();
        if (!s.has(t)) s.set(t, cols);
        for (const action of splitTop(rest)) {
          const a = action.trim();
          let x: RegExpMatchArray | null;
          if ((x = a.match(new RegExp(`^add (?:column )?(?:if not exists )?(${ident}) (.*)$`, 'is'))) && !/^add (constraint|primary|unique|check|foreign)\b/i.test(a)) {
            if (!cols.has(unq(x[1]))) cols.set(unq(x[1]), colType(x[2]));
          } else if ((x = a.match(new RegExp(`^drop (?:column )?(?:if exists )?(${ident})(?: cascade| restrict)?$`, 'i'))) && !/^drop (constraint|default|not null)\b/i.test(a)) {
            cols.delete(unq(x[1]));
          } else if ((x = a.match(new RegExp(`^alter (?:column )?(${ident}) (?:set data )?type (.*)$`, 'i')))) {
            cols.set(unq(x[1]), colType(x[2]));
          }
        }
      }
    }
  }
  return s;
}

export function textLikeColumns(s: Schema): Array<[string, string, string]> {
  const out: Array<[string, string, string]> = [];
  for (const [t, cols] of s) for (const [c, ty] of cols) if (isTextLike(ty)) out.push([t, c, ty]);
  return out;
}
