/**
 * Backfill בפרודקשן (המפתח קיים רק ב-Vercel): מצפין שורות טקסט ישנות + מטא-דאטה ב-Upstash.
 * idempotent, מוגבל בזמן; רץ מתוך ה-master cron עד שאין יותר מה להצפין. לא מדפיס ערכים.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isEncrypted } from './pii';
import { sealTableRow } from './pii-seal';
import { encryptAiContext, needsTextEncryption, PLAIN_SENTINELS, TABLE_ENC_TEXT, type EncTextTable } from './pii-fields';
import { encryptJson } from './pii';
import { sealVectorMetadata, isUpstashVectorConfigured } from '@/lib/ai/upstash-vector-rest';
import { UPSTASH_NAMESPACE_CONVERSATION_MEMORY, UPSTASH_NAMESPACE_USER_MEMORY } from '@/lib/ai/rag-config';

type Row = Record<string, unknown>;

export async function backfillDerivedPii(admin: SupabaseClient, budgetMs = 60_000) {
  const deadline = Date.now() + budgetMs;
  const out: Record<string, number> = {};
  for (const table of Object.keys(TABLE_ENC_TEXT) as EncTextTable[]) {
    const cols = TABLE_ENC_TEXT[table] as readonly string[];
    const sentinels = [...PLAIN_SENTINELS].map((v) => `"${v}"`).join(',');
    const orFilter = cols.map((c) => `and(${c}.not.like.enc:v1:*,${c}.neq.,${c}.not.in.(${sentinels}))`).join(',');
    out[table] = 0;
    while (Date.now() < deadline) {
      const { data, error } = await admin.from(table).select(['id', 'user_id', ...cols].join(', ')).or(orFilter).limit(200);
      if (error) throw new Error(`${table}: ${error.message}`);
      const rows = (data ?? []) as unknown as Row[];
      if (!rows.length) break;
      const before = out[table];
      for (const r of rows) {
        const todo: Row = {};
        for (const c of cols) if (needsTextEncryption(r[c])) todo[c] = r[c];
        if (!Object.keys(todo).length) continue;
        const { error: uErr } = await admin.from(table).update(await sealTableRow(table, todo, r.user_id as string)).eq('id', r.id as string);
        if (uErr) throw new Error(`${table} update: ${uErr.message}`);
        out[table] += 1;
      }
      if (out[table] === before) break; // only empty strings left
    }
  }
  // profiles.ai_context
  out.ai_context = 0;
  for (let from = 0; Date.now() < deadline; from += 500) {
    const { data, error } = await admin.from('profiles').select('id, ai_context').not('ai_context', 'is', null).order('id').range(from, from + 499);
    if (error) throw new Error(`ai_context: ${error.message}`);
    if (!data?.length) break;
    for (const r of data as Array<{ id: string; ai_context: Row }>) {
      const next = encryptAiContext(r.ai_context, r.id);
      if (JSON.stringify(next) === JSON.stringify(r.ai_context)) continue;
      await admin.from('profiles').update({ ai_context: next }).eq('id', r.id);
      out.ai_context += 1;
    }
  }
  // user_memory_dossier: עמודות jsonb רגישות שנוספו להצפנה מאוחר יותר
  out.dossier = 0;
  for (let from = 0; Date.now() < deadline; from += 200) {
    const { data, error } = await admin.from('user_memory_dossier').select('user_id, personal_context').order('user_id').range(from, from + 199);
    if (error) throw new Error(`dossier: ${error.message}`);
    if (!data?.length) break;
    for (const r of data as Array<{ user_id: string; personal_context: unknown }>) {
      if (r.personal_context === null || r.personal_context === undefined || isEncrypted(r.personal_context) || String(r.personal_context).startsWith('enc:v2:')) continue;
      await admin.from('user_memory_dossier').update({ personal_context: encryptJson(r.personal_context, r.user_id) }).eq('user_id', r.user_id);
      out.dossier += 1;
    }
  }
  // Upstash
  if (isUpstashVectorConfigured()) {
    const url = process.env.UPSTASH_VECTOR_REST_URL!.trim().replace(/\/+$/, '');
    const headers = { Authorization: `Bearer ${process.env.UPSTASH_VECTOR_REST_TOKEN!.trim()}`, 'Content-Type': 'application/json' };
    for (const ns of [UPSTASH_NAMESPACE_USER_MEMORY, UPSTASH_NAMESPACE_CONVERSATION_MEMORY]) {
      out[`vec:${ns}`] = 0;
      let cursor = '0';
      for (let g = 0; g < 500 && Date.now() < deadline; g++) {
        const r = await fetch(`${url}/range/${encodeURIComponent(ns)}`, { method: 'POST', headers, body: JSON.stringify({ cursor, limit: 100, includeMetadata: true, includeVectors: true }) });
        if (!r.ok) throw new Error(`upstash range ${r.status}`);
        const j = (await r.json()) as { result?: { nextCursor?: string; vectors?: Array<{ id: string; vector: number[]; metadata?: Row }> } };
        const vs = j.result?.vectors ?? [];
        const todo = vs.filter((v) => v.metadata && JSON.stringify(sealVectorMetadata(v.metadata)) !== JSON.stringify(v.metadata));
        if (todo.length) {
          const u = await fetch(`${url}/upsert/${encodeURIComponent(ns)}`, { method: 'POST', headers, body: JSON.stringify(todo.map((v) => ({ id: v.id, vector: v.vector, metadata: sealVectorMetadata(v.metadata!) }))) });
          if (!u.ok) throw new Error(`upstash upsert ${u.status}`);
          out[`vec:${ns}`] += todo.length;
        }
        if (!j.result?.nextCursor || !vs.length) break;
        cursor = j.result.nextCursor;
      }
    }
  }
  return out;
}
