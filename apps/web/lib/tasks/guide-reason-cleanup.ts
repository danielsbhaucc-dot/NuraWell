/**
 * One-off cleanup (approved by Daniel): before 000212, offerGuideTask wrote the user's `reason` into the SHARED
 * guide row (task_definitions, source='guide', owner_user_id IS NULL → plaintext, visible to every user of that guide).
 * Moves that text onto the owning user's own user_task_assignments.reason (enc:v2 with the user's key, via the
 * encryption wrapper of the passed client) and then sets the shared description to NULL.
 *
 * Run ONLY after migrations 000212 + 000214 and the matching code are deployed (the wrapper must seal
 * user_task_assignments.reason and the app must read guide descriptions from the assignment).
 *
 * Attribution: the upsert overwrote description on every offer, so the text belongs to the LAST user offered that
 * guide = the assignment created closest to the definition's updated_at (within ATTRIBUTION_WINDOW_MS).
 * If the user already has a reason (written by the new code) it is kept; the shared text is only removed.
 * Rows with no unique match are counted as `unattributed`; their description is nulled only with allowUnattributed.
 *
 * Idempotent; reports counts only, never values or ids.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const ATTRIBUTION_WINDOW_MS = 2 * 60_000;

export type GuideRow = { id: string; description: string | null; updated_at: string };
export type AsgRow = { id: string; user_id: string; definition_id: string; reason: string | null; created_at: string };
export type CleanupCounts = {
  leaked_rows: number;
  moved_to_assignment: number;
  kept_existing_reason: number;
  unattributed: number;
  descriptions_nulled: number;
};
export type PlanItem = { defId: string; move?: { asgId: string; userId: string }; keep?: boolean; unattributed?: boolean };

const nonEmpty = (s: string | null | undefined) => typeof s === 'string' && s.trim().length > 0;

export function planGuideCleanup(defs: GuideRow[], asgs: AsgRow[]): PlanItem[] {
  return defs.filter((d) => nonEmpty(d.description)).map((d) => {
    const t = Date.parse(d.updated_at);
    const near = asgs
      .filter((a) => a.definition_id === d.id && Math.abs(Date.parse(a.created_at) - t) <= ATTRIBUTION_WINDOW_MS)
      .sort((a, b) => Math.abs(Date.parse(a.created_at) - t) - Math.abs(Date.parse(b.created_at) - t));
    const unique = near.length === 1 || (near.length > 1 && Math.abs(Date.parse(near[0].created_at) - t) < Math.abs(Date.parse(near[1].created_at) - t));
    if (!near.length || !unique) return { defId: d.id, unattributed: true };
    const a = near[0];
    if (nonEmpty(a.reason)) return { defId: d.id, keep: true };
    return { defId: d.id, move: { asgId: a.id, userId: a.user_id } };
  });
}

async function loadLeaked(admin: SupabaseClient) {
  const { data, error } = await admin
    .from('task_definitions')
    .select('id, description, updated_at')
    .eq('source', 'guide')
    .is('owner_user_id', null)
    .not('description', 'is', null);
  if (error) throw new Error(`[guide-cleanup] load defs: ${error.code ?? 'error'}`);
  return ((data ?? []) as GuideRow[]).filter((d) => nonEmpty(d.description));
}

export async function runGuideReasonCleanup(
  admin: SupabaseClient,
  opts: { dryRun: boolean; allowUnattributed?: boolean }
): Promise<{ counts: CleanupCounts; verify?: { remaining: number; reasons_decrypt: boolean } }> {
  const defs = await loadLeaked(admin);
  const counts: CleanupCounts = { leaked_rows: defs.length, moved_to_assignment: 0, kept_existing_reason: 0, unattributed: 0, descriptions_nulled: 0 };
  if (!defs.length) return { counts, verify: opts.dryRun ? undefined : { remaining: 0, reasons_decrypt: true } };
  const { data: asgData, error } = await admin
    .from('user_task_assignments')
    .select('id, user_id, definition_id, reason, created_at')
    .in('definition_id', defs.map((d) => d.id));
  if (error) throw new Error(`[guide-cleanup] load assignments: ${error.code ?? 'error'}`);
  const plan = planGuideCleanup(defs, (asgData ?? []) as AsgRow[]);
  const byId = new Map(defs.map((d) => [d.id, d]));
  const moved: Array<{ asgId: string; userId: string; text: string }> = [];
  for (const p of plan) {
    if (p.move) counts.moved_to_assignment++;
    else if (p.keep) counts.kept_existing_reason++;
    else counts.unattributed++;
  }
  if (opts.dryRun) return { counts };

  for (const p of plan) {
    if (p.unattributed && !opts.allowUnattributed) continue;
    if (p.move) {
      const text = byId.get(p.defId)!.description!.trim().slice(0, 500);
      // the wrapped client seals reason as enc:v2 with this user's key
      const { error: e1 } = await admin.from('user_task_assignments').update({ reason: text }).eq('id', p.move.asgId).eq('user_id', p.move.userId);
      if (e1) throw new Error(`[guide-cleanup] write reason: ${e1.code ?? 'error'}`);
      moved.push({ ...p.move, text });
    }
    const { error: e2 } = await admin.from('task_definitions').update({ description: null }).eq('id', p.defId).eq('source', 'guide').is('owner_user_id', null);
    if (e2) throw new Error(`[guide-cleanup] null description: ${e2.code ?? 'error'}`);
    counts.descriptions_nulled++;
  }

  // verify: no shared guide row keeps text (unattributed rows left on purpose are still counted → non-zero = fail)
  const remaining = (await loadLeaked(admin)).length;
  let reasonsDecrypt = true;
  for (const m of moved) {
    const { data } = await admin.from('user_task_assignments').select('reason').eq('id', m.asgId).eq('user_id', m.userId).maybeSingle();
    const got = (data as { reason?: unknown } | null)?.reason;
    if (got !== m.text) reasonsDecrypt = false; // wrapper decrypts on read; ciphertext or mismatch = fail
  }
  return { counts, verify: { remaining, reasons_decrypt: reasonsDecrypt } };
}
