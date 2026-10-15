/**
 * מיגרציה חד-פעמית: מצפין שורות קיימות (idempotent; ערכים מוצפנים מדולגים).
 * הרצה: PII_ENCRYPTION_KEY=... SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... npx jiti apps/web/scripts/encrypt-existing-pii.ts
 * לא מדפיס ערכים, רק ספירות.
 */
import { DOSSIER_ENCRYPTED_FIELDS, encryptJson, encryptStringArray, isEncrypted } from '../lib/crypto/pii';

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
  console.log(JSON.stringify({ dossierRowsEncrypted: dossiers, dossierRowsTotal: rows.length, strategyRowsEncrypted: strategies, strategyRowsTotal: srows.length }));
}

main().catch((e) => {
  console.error('failed:', e instanceof Error ? e.message : 'unknown');
  process.exit(1);
});
