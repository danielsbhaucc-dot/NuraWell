/**
 * מיגרציה חד-פעמית: מצפין שורות קיימות (idempotent; ערכים מוצפנים מדולגים).
 * הרצה: PII_ENCRYPTION_KEY=... SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... npx jiti apps/web/scripts/encrypt-existing-pii.ts
 * לא מדפיס ערכים, רק ספירות.
 */
import { DOSSIER_ENCRYPTED_FIELDS, encryptJson, encryptStringArray, isEncrypted } from '../lib/crypto/pii';
import { encryptChatContent, encryptMeasurementPatch, encryptProfilePatch, PROFILE_ENC_JSON, PROFILE_ENC_NUMERIC, PROFILE_ENC_TEXT } from '../lib/crypto/pii-fields';

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
  console.log(JSON.stringify({ profilesEnc, profilesTotal: prows.length, measEnc, measTotal: mrows.length, chatEnc }));
  console.log(JSON.stringify({ dossierRowsEncrypted: dossiers, dossierRowsTotal: rows.length, strategyRowsEncrypted: strategies, strategyRowsTotal: srows.length }));
}

main().catch((e) => {
  console.error('failed:', e instanceof Error ? e.message : 'unknown');
  process.exit(1);
});
