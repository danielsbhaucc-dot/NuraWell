import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { type AutoFacts, type ComplianceRow, openItems, reopenedItems } from './compliance-checklist';

export async function loadCompliance(db: SupabaseClient) {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: rows }, { count: users }, { count: audits }, { data: docs }] = await Promise.all([
    db.from('owner_compliance_status').select('item_key, done, done_at, updated_at, meta'),
    db.from('profiles').select('id', { count: 'exact', head: true }),
    db.from('admin_audit_log').select('id', { count: 'exact', head: true }).gte('created_at', since),
    db.from('owner_compliance_docs').select('slug, updated_at'),
  ]);
  const list = (rows ?? []) as ComplianceRow[];
  const map = new Map(list.map((r) => [r.item_key, r]));
  const drillRow = map.get('backup_drill');
  const m = (drillRow?.meta ?? {}) as Record<string, unknown>;
  const facts: AutoFacts = {
    userCount: users ?? 0,
    auditEvents30d: audits ?? 0,
    drill: drillRow ? { ok: Boolean(drillRow.done), at: drillRow.updated_at } : null,
  };
  const lastUpdated = list.reduce<string | null>((a, r) => (!a || r.updated_at > a ? r.updated_at : a), null);
  return { rows: list, map, facts, drillMeta: m, lastUpdated, docs: (docs ?? []) as { slug: string; updated_at: string }[] };
}

/** One lean line for Gideon's monthly digest (null when nothing is open). */
export async function privacyDigestLine(db: SupabaseClient, link: string): Promise<string | null> {
  const { map, facts } = await loadCompliance(db);
  const open = openItems(map, facts);
  if (!open.length) return null;
  const names = open.slice(0, 3).map((i) => i.title).join(' · ');
  return `🔐 פרטיות: ${open.length} סעיפים פתוחים (${names}${open.length > 3 ? ' ועוד' : ''})\n🔗 ${link}`;
}

/** Daily digest: items that auto-reopened in the last 24h (each mentioned once). */
export async function privacyReopenedLine(db: SupabaseClient, link: string, now = new Date()): Promise<string | null> {
  const { map, facts } = await loadCompliance(db);
  const re = reopenedItems(map, facts, new Date(now.getTime() - 86_400_000), now);
  if (!re.length) return null;
  return `🔁 פרטיות: נפתח מחדש לטיפול: ${re.map((i) => i.title).join(' · ')}\n🔗 ${link}`;
}
