import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { prefilter, toModelPayload, type AccessEvent, type Flagged } from '@platform/access';

export type AuditModel = (payload: string) => Promise<{ ref: string; severity: 'low' | 'medium' | 'high'; summary: string }[]>;
export type AuditDeps = { model?: AuditModel; alert?: (text: string) => Promise<void>; now?: number; productId?: string };

const SYSTEM = 'You review pseudonymous admin-access events. Each item has a ref, kind, local hour, rule signals and numeric features. ' +
  'Return JSON {"findings":[{"ref":"e1","severity":"low|medium|high","summary":"<=200 chars, Hebrew"}]} only for items that look like misuse or attack. No other text.';

export const groqAuditModel: AuditModel = async (payload) => {
  const { getClientForModel, AI_MODELS } = await import('@/lib/ai/client');
  const { withAiUsage } = await import('@/lib/ai/usage-meter');
  const r = await withAiUsage({ feature: 'access_audit' }, () => getClientForModel('background_groq').chat.completions.create({
    model: AI_MODELS.background_groq, temperature: 0, max_tokens: 800, response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: payload }],
  }));
  const j = JSON.parse(r.choices[0]?.message?.content ?? '{}') as { findings?: unknown };
  return Array.isArray(j.findings) ? (j.findings as { ref: string; severity: 'low' | 'medium' | 'high'; summary: string }[]) : [];
};

/** Rule-only fallback severity (used when the model fails, so a flagged night is never silently dropped). */
export function ruleSeverity(f: Flagged): 'low' | 'medium' | 'high' {
  if (f.signals.includes('probe_burst') || (f.signals.includes('new_country') && f.signals.includes('odd_hours'))) return 'high';
  if (f.signals.includes('many_subjects') || f.signals.includes('new_country') || f.signals.includes('new_device')) return 'medium';
  return 'low';
}

/** Nightly: DB events → rule prefilter → (only if flagged) cheap model on pseudonymous features → findings + owner alert. */
export async function runAccessAudit(db: SupabaseClient, deps: AuditDeps = {}) {
  const now = deps.now ?? Date.now();
  const to = new Date(now).toISOString();
  const from = new Date(now - 24 * 3600_000).toISOString();
  const known = new Date(now - 30 * 86_400_000).toISOString();
  const [logs, grants, probes, enrolls, hist] = await Promise.all([
    db.from('pii_access_log').select('at, actor_id, subject_id, event, country, device_id').gte('at', from).lt('at', to).limit(5000),
    db.from('pii_access_grants').select('created_at, actor_id, subject_id, reason, ticket_ref, country, device_id').gte('created_at', from).lt('created_at', to).limit(2000),
    db.from('ops_probe_daily').select('day, hits, country').gte('day', from.slice(0, 10)).limit(2000),
    db.from('ops_device_enrollments').select('created_at, user_id, completed_at, match_result, device_id').gte('created_at', from).limit(500),
    db.from('pii_access_log').select('country, device_id').gte('at', known).lt('at', from).limit(10000),
  ]);
  const ev: AccessEvent[] = [];
  for (const r of (logs.data ?? []) as { at: string; actor_id: string; subject_id: string | null; event: string; country: string | null; device_id: string | null }[])
    if (r.event === 'view') ev.push({ at: Date.parse(r.at), actorId: r.actor_id, kind: 'pii_view', subjectId: r.subject_id, country: r.country, deviceId: r.device_id });
  for (const r of (grants.data ?? []) as { created_at: string; actor_id: string; subject_id: string; reason: string; ticket_ref: string | null; country: string | null; device_id: string | null }[])
    ev.push({ at: Date.parse(r.created_at), actorId: r.actor_id, kind: 'pii_grant', subjectId: r.subject_id, reason: r.reason, ticketRef: r.ticket_ref, country: r.country, deviceId: r.device_id });
  for (const r of (probes.data ?? []) as { day: string; hits: number; country: string | null }[])
    ev.push({ at: Date.parse(`${r.day}T12:00:00Z`), actorId: 'probe', kind: 'probe', count: r.hits });
  for (const r of (enrolls.data ?? []) as { created_at: string; user_id: string; completed_at: string | null; match_result: string | null; device_id: string | null }[])
    if (r.completed_at) ev.push({ at: Date.parse(r.completed_at), actorId: r.user_id, kind: 'device_enrolled', deviceId: r.device_id });

  const productId = deps.productId ?? 'nurawell';
  const { data: run } = await db.from('access_audit_runs').insert({ product_id: productId, window_from: from, window_to: to, events: ev.length }).select('id').single();
  const runId = (run as { id: string } | null)?.id;
  if (!ev.length) return { runId, events: 0, flagged: 0, modelCalled: false, findings: 0 }; // no events → no AI call

  const k = (hist.data ?? []) as { country: string | null; device_id: string | null }[];
  const flagged = prefilter(ev, { countries: new Set(k.map((x) => x.country).filter(Boolean) as string[]), devices: new Set(k.map((x) => x.device_id).filter(Boolean) as string[]) });
  let modelCalled = false; let error: string | null = null;
  let out: { ref: string; severity: 'low' | 'medium' | 'high'; summary: string }[] = [];
  if (flagged.length) {
    try { modelCalled = true; out = await (deps.model ?? groqAuditModel)(toModelPayload(flagged)); }
    catch (e) { error = e instanceof Error ? e.message.slice(0, 120) : 'model_error'; }
    if (error) out = flagged.map((f) => ({ ref: f.ref, severity: ruleSeverity(f), summary: `אותות: ${f.signals.join(', ')}` }));
  }
  const byRef = new Map(flagged.map((f) => [f.ref, f]));
  const rows = out.filter((o) => byRef.has(o.ref) && ['low', 'medium', 'high'].includes(o.severity)).slice(0, 50).map((o) => {
    const f = byRef.get(o.ref)!; const e = ev[Number(o.ref.slice(1)) - 1];
    return { run_id: runId, product_id: productId, severity: o.severity, signals: f.signals, summary: String(o.summary ?? '').slice(0, 400), event_kind: f.kind,
      event_at: e ? new Date(e.at).toISOString() : null, actor_id: e && /^[0-9a-f-]{36}$/.test(e.actorId) ? e.actorId : null };
  });
  if (rows.length && runId) await db.from('access_audit_findings').insert(rows);
  if (runId) await db.from('access_audit_runs').update({ flagged: flagged.length, model_called: modelCalled, findings: rows.length, error }).eq('id', runId);
  const serious = rows.filter((r) => r.severity !== 'low');
  if (serious.length && deps.alert) await deps.alert(`🛡️ ביקורת גישה לילית: ${serious.length} ממצאים (${rows.filter((r) => r.severity === 'high').length} חמורים).\n${serious.slice(0, 5).map((r) => `• [${r.severity}] ${r.summary}`).join('\n')}\nפירוט: Ops ← אבטחה.`);
  return { runId, events: ev.length, flagged: flagged.length, modelCalled, findings: rows.length };
}
