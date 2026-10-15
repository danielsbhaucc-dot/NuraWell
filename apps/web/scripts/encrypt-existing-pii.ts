/**
 * מיגרציה חד-פעמית: מצפין שורות קיימות (idempotent; ערכים מוצפנים מדולגים).
 * הרצה: PII_ENCRYPTION_KEY=... SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... npx jiti apps/web/scripts/encrypt-existing-pii.ts
 * לא מדפיס ערכים, רק ספירות.
 */
import { sealVectorMetadata } from '../lib/ai/upstash-vector-rest';
import { UPSTASH_NAMESPACE_USER_MEMORY, UPSTASH_NAMESPACE_CONVERSATION_MEMORY } from '../lib/ai/rag-config';
import { DOSSIER_ENCRYPTED_FIELDS, encryptJson, encryptStringArray, isEncrypted } from '../lib/crypto/pii';
import { encryptAiContext, encryptTableRow, TABLE_ENC_TEXT, type EncTextTable, encryptChatContent, encryptMeasurementPatch, encryptProfilePatch, PROFILE_ENC_JSON, PROFILE_ENC_NUMERIC, PROFILE_ENC_TEXT } from '../lib/crypto/pii-fields';

const REF = process.env.SUPABASE_PROJECT_REF!;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN!;

async function sql<T = Record<string, unknown>>(query: string): Promise<T[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`sql ${res.status}`);
  return (await res.json()) as T[];
}
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

async function main() {
  let dossiers = 0;
  const rows = await sql<Record<string, unknown>>(
    `select user_id, ${DOSSIER_ENCRYPTED_FIELDS.join(', ')} from public.user_memory_dossier`
  );
  for (const r of rows) {
    const uid = r.user_id as string;
    const sets: string[] = [];
    for (const f of DOSSIER_ENCRYPTED_FIELDS) {
      const v = r[f];
      if (v === null || v === undefined || isEncrypted(v)) continue;
      sets.push(`${f} = to_jsonb(${lit(encryptJson(v, uid) as string)}::text)`);
    }
    if (sets.length) {
      await sql(`update public.user_memory_dossier set ${sets.join(', ')} where user_id = ${lit(uid)}`);
      dossiers++;
    }
  }
  let strategies = 0;
  const srows = await sql<{ user_id: string; medical_red_flags: string[] | null }>(
    `select user_id, medical_red_flags from public.user_mentorship_strategy`
  );
  for (const r of srows) {
    const flags = r.medical_red_flags ?? [];
    if (!flags.length || flags.every(isEncrypted)) continue;
    const enc = encryptStringArray(flags, r.user_id);
    await sql(
      `update public.user_mentorship_strategy set medical_red_flags = array[${enc.map(lit).join(',')}]::text[] where user_id = ${lit(r.user_id)}`
    );
    strategies++;
  }
  // profiles
  const pcols = [...PROFILE_ENC_NUMERIC, ...PROFILE_ENC_JSON, ...PROFILE_ENC_TEXT];
  const prows = await sql<Record<string, unknown>>(`select id, ${pcols.join(', ')} from public.profiles`);
  let profilesEnc = 0;
  for (const r of prows) {
    const uid = r.id as string;
    const todo: Record<string, unknown> = {};
    for (const c of pcols) if (r[c] !== null && r[c] !== undefined && !isEncrypted(r[c])) todo[c] = r[c];
    if (!Object.keys(todo).length) continue;
    const enc = encryptProfilePatch(todo, uid);
    const sets = Object.entries(enc).map(([c, v]) =>
      (PROFILE_ENC_JSON as readonly string[]).includes(c) ? `${c} = to_jsonb(${lit(String(v))}::text)` : `${c} = ${v === null ? 'null' : lit(String(v))}`
    );
    await sql(`update public.profiles set ${sets.join(', ')} where id = ${lit(uid)}`);
    profilesEnc++;
  }
  // user_measurements
  const mrows = await sql<Record<string, unknown>>(`select id, user_id, weight_kg, height_cm, bmi, notes from public.user_measurements`);
  let measEnc = 0;
  for (const r of mrows) {
    const todo: Record<string, unknown> = {};
    for (const c of ['weight_kg', 'height_cm', 'bmi', 'notes']) if (r[c] !== null && r[c] !== undefined && !isEncrypted(r[c])) todo[c] = r[c];
    if (!Object.keys(todo).length) continue;
    const enc = encryptMeasurementPatch(todo, r.user_id as string);
    const sets = Object.entries(enc).map(([c, v]) => `${c} = ${v === null ? 'null' : lit(String(v))}`);
    await sql(`update public.user_measurements set ${sets.join(', ')} where id = ${lit(String(r.id))}`);
    measEnc++;
  }
  // ai_interactions.content (batched)
  let chatEnc = 0;
  for (;;) {
    const batch = await sql<{ id: string; user_id: string; content: string }>(
      `select id, user_id, content from public.ai_interactions where content not like 'enc:v1:%' limit 200`
    );
    if (!batch.length) break;
    const values = batch.map((b) => `(${lit(String(b.id))}::uuid, ${lit(encryptChatContent(b.content ?? '', b.user_id))})`).join(',');
    await sql(`update public.ai_interactions a set content = v.c from (values ${values}) as v(id, c) where a.id = v.id`);
    chatEnc += batch.length;
  }
  // derived text tables (batched, idempotent)
  const derived: Record<string, number> = {};
  for (const table of Object.keys(TABLE_ENC_TEXT) as EncTextTable[]) {
    const cols = TABLE_ENC_TEXT[table] as readonly string[];
    const where = cols.map((c) => `(${c} is not null and ${c} <> '' and ${c} not like 'enc:v1:%')`).join(' or ');
    derived[table] = 0;
    for (;;) {
      const batch = await sql<Record<string, unknown>>(`select id, user_id, ${cols.join(', ')} from public.${table} where ${where} limit 200`);
      if (!batch.length) break;
      for (const r of batch) {
        const todo: Record<string, unknown> = {};
        for (const c of cols) if (typeof r[c] === 'string' && r[c] !== '' && !isEncrypted(r[c])) todo[c] = r[c];
        const enc = encryptTableRow(table, todo, r.user_id as string);
        const sets = Object.entries(enc).map(([c, v]) => `${c} = ${lit(String(v))}`);
        await sql(`update public.${table} set ${sets.join(', ')} where id = ${lit(String(r.id))}`);
      }
      derived[table] += batch.length;
    }
  }
  // profiles.ai_context sub-keys
  let aiCtxEnc = 0;
  const crow = await sql<{ id: string; ai_context: Record<string, unknown> | null }>(`select id, ai_context from public.profiles where ai_context is not null`);
  for (const r of crow) {
    const next = encryptAiContext(r.ai_context, r.id);
    if (JSON.stringify(next) === JSON.stringify(r.ai_context)) continue;
    await sql(`update public.profiles set ai_context = ${lit(JSON.stringify(next))}::jsonb where id = ${lit(r.id)}`);
    aiCtxEnc++;
  }
  // Upstash vectors: re-seal plaintext metadata (no re-embedding; same vector ids)
  const vec: Record<string, number> = {};
  const VURL = process.env.UPSTASH_VECTOR_REST_URL?.replace(/\/+$/, '');
  const VTOK = process.env.UPSTASH_VECTOR_REST_TOKEN;
  if (VURL && VTOK) {
    for (const ns of [UPSTASH_NAMESPACE_USER_MEMORY, UPSTASH_NAMESPACE_CONVERSATION_MEMORY]) {
      vec[ns] = 0;
      let cursor = '0';
      for (let g = 0; g < 1000; g++) {
        const r = await fetch(`${VURL}/range/${encodeURIComponent(ns)}`, { method: 'POST', headers: { Authorization: `Bearer ${VTOK}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ cursor, limit: 100, includeMetadata: true, includeVectors: true }) });
        if (!r.ok) throw new Error(`range ${r.status}`);
        const j = (await r.json()) as { result?: { nextCursor?: string; vectors?: Array<{ id: string; vector: number[]; metadata?: Record<string, unknown> }> } };
        const vs = j.result?.vectors ?? [];
        const todo = vs.filter((v) => v.metadata && JSON.stringify(sealVectorMetadata(v.metadata)) !== JSON.stringify(v.metadata));
        if (todo.length) {
          const u = await fetch(`${VURL}/upsert/${encodeURIComponent(ns)}`, { method: 'POST', headers: { Authorization: `Bearer ${VTOK}`, 'Content-Type': 'application/json' }, body: JSON.stringify(todo.map((v) => ({ id: v.id, vector: v.vector, metadata: sealVectorMetadata(v.metadata!) }))) });
          if (!u.ok) throw new Error(`upsert ${u.status}`);
          vec[ns] += todo.length;
        }
        if (!j.result?.nextCursor || !vs.length) break;
        cursor = j.result.nextCursor;
      }
    }
  }
  console.log(JSON.stringify({ derived, aiCtxEnc, vectorsResealed: vec }));
  console.log(JSON.stringify({ profilesEnc, profilesTotal: prows.length, measEnc, measTotal: mrows.length, chatEnc }));
  console.log(JSON.stringify({ dossierRowsEncrypted: dossiers, dossierRowsTotal: rows.length, strategyRowsEncrypted: strategies, strategyRowsTotal: srows.length }));
}

main().catch((e) => {
  console.error('failed:', e instanceof Error ? e.message : 'unknown');
  process.exit(1);
});
