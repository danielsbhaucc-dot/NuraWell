import type { SupabaseClient } from '@supabase/supabase-js';
import type { LogFilters } from './query';

/** Viewing / revealing / exporting logs is itself logged (no values, only the filter shape). */
export async function logLogsAccess(db: SupabaseClient, actorId: string, event: 'logs_viewed' | 'logs_revealed' | 'logs_exported', f: LogFilters, rows: number): Promise<void> {
  await db.from('admin_audit_log').insert({
    actor_id: actorId, method: 'SECURITY', path: event,
    detail: { type: f.type, rows, from: f.from ?? null, to: f.to ?? null, filtered: !!(f.actor || f.result || f.q), reveal: !!f.reveal },
  }).then(() => undefined, () => undefined);
}
