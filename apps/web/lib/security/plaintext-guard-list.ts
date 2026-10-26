/**
 * Source of scripts/backup/encrypted-columns.txt (the nightly plaintext monitor's column list; counts only).
 *   enforce  registered column of a table whose v2 backfill completed  -> any plaintext FAILS the job (+ owner alert)
 *   pending  registered column of a FIELD_V2 table still backfilling    -> warning; FAILS once the table is activated
 *            in field_enc_enforcement (the monitor promotes it to enforce at run time)
 *   append   registered column of an append-only evidence table (old rows stay as written) -> counts only rows
 *            created after the table's activation; FAILS on any once active, warning before
 *   sweep    registered column of a SWEEP_TABLES table (SQL trigger writes plaintext, cron seals it) -> FAILS on any
 *            plaintext row older than maxPlainMinutes (5th field)
 *   gap      classified sensitive but not yet in field-registry         -> warning, listed (must become enforce)
 * Plus every classified column (`class` lines) so the monitor can fail on prod columns nobody classified.
 */
import { COLUMN_CLASSIFICATION } from './column-classification';
import { APPEND_ONLY_TABLES, ENCRYPTED_TABLES, FIELD_V2_BACKFILL_COMPLETE, SWEEP_TABLES, isBlocked } from './field-registry';

export function plaintextGuardLines(): string[] {
  const out: string[] = [];
  for (const [t, v] of Object.entries(ENCRYPTED_TABLES))
    for (const [c, k] of Object.entries(v.columns))
      if (isBlocked(t, c)) continue;
      else if (t in SWEEP_TABLES) out.push(`sweep ${t} ${c} ${k} ${SWEEP_TABLES[t].maxPlainMinutes} ${SWEEP_TABLES[t].tsCol}`);
      else
        out.push(`${t in APPEND_ONLY_TABLES ? 'append' : FIELD_V2_BACKFILL_COMPLETE.includes(t) ? 'enforce' : 'pending'} ${t} ${c} ${k}`);
  const reg = ENCRYPTED_TABLES as Record<string, { columns: Record<string, string> }>;
  for (const [t, cs] of Object.entries(COLUMN_CLASSIFICATION))
    for (const [c, [cls]] of Object.entries(cs)) if (cls === 'sensitive' && !reg[t]?.columns[c]) out.push(`gap ${t} ${c} any`);
  for (const [t, cs] of Object.entries(COLUMN_CLASSIFICATION)) for (const c of Object.keys(cs)) out.push(`class ${t} ${c} -`);
  return out;
}
