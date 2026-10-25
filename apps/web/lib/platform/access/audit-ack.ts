import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Acknowledge once (conditional update); the ack is written to admin_audit_log. Fails closed if the log write fails. */
export async function acknowledgeFinding(db: SupabaseClient, id: string, actorId: string, now = new Date()): Promise<{ ok: true; at: string } | { ok: false }> {
  const at = now.toISOString();
  const { data } = await db.from('access_audit_findings').update({ acknowledged_at: at, acknowledged_by: actorId }).eq('id', id).is('acknowledged_at', null).select('id, product_id');
  const row = (data as { id: string; product_id: string }[] | null)?.[0];
  if (!row) return { ok: false };
  const { error } = await db.from('admin_audit_log').insert({ actor_id: actorId, method: 'SECURITY', path: 'access_audit_ack', detail: { finding: id, product_id: row.product_id } });
  if (error) {
    await db.from('access_audit_findings').update({ acknowledged_at: null, acknowledged_by: null }).eq('id', id).eq('acknowledged_at', at);
    return { ok: false };
  }
  return { ok: true, at };
}
