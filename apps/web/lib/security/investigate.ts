/**
 * "איך הוא נכנס" — investigation of one session / IP / account. Read-only, server only.
 * Sources: auth.sessions + mfa_amr_claims (method, IP, UA, AAL), admin_audit_log (routes, exports, session id),
 * security_signals (failed attempts, first seen), auth audit log when the project keeps it, incidents.
 * Raw IPs are shown to the admin only (this is behind admin + step-up); nothing leaves to Telegram.
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hashIp } from '@/lib/logs/signals';
import { isUuid } from './ir';
import { methodHe, verdictFor, type Facts } from '@/lib/security-core/verdict';
export { methodHe, verdictFor, type Facts, type Verdict } from '@/lib/security-core/verdict';

export type InvestigateInput = { user?: string; session?: string; ip?: string; ipHash?: string; days?: number };
export type SessionRow = { id: string; user_id: string; created_at: string; updated_at: string | null; refreshed_at: string | null; ip: string | null; user_agent: string | null; aal: string | null; not_after: string | null; methods: string[] };
export type TimelineItem = { ts: string; kind: 'session' | 'fail' | 'success' | 'route' | 'export' | 'security' | 'auth'; title: string; detail?: string; ip?: string | null; country?: string | null };



const SENSITIVE = /\/(legal|logs|secure|vault|keys|users|export|ops\/security|db-backup|transcript)/i;
const EXPORT = /export|download|backup/i;

async function rawIpForHash(db: SupabaseClient, h: string): Promise<string | null> {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data } = await db.from('admin_audit_log').select('ip').not('ip', 'is', null).gte('created_at', since).order('created_at', { ascending: false }).limit(2000);
  for (const r of (data ?? []) as { ip: string }[]) if (hashIp(r.ip) === h) return r.ip;
  return null;
}

export async function investigate(db: SupabaseClient, input: InvestigateInput) {
  const days = Math.max(1, Math.min(input.days ?? 14, 90));
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  let ip = input.ip?.trim() || null;
  const ipHash = input.ipHash || (ip ? hashIp(ip) : null);
  if (!ip && ipHash) ip = await rawIpForHash(db, ipHash);
  let user = isUuid(input.user) ? input.user : null;

  const listArgs = { p_user: user, p_ip: user ? null : ip, p_limit: 200 };
  let sessions: SessionRow[] = [];
  if (user || ip || input.session) {
    const { data } = await db.rpc('ops_list_sessions', input.session && !user && !ip ? { p_user: null, p_ip: null, p_limit: 200 } : listArgs);
    sessions = (data ?? []) as SessionRow[];
  }
  const focus = input.session ? sessions.find((s) => s.id === input.session) ?? null : ip ? sessions.find((s) => s.ip === ip) ?? null : sessions[0] ?? null;
  if (!user && focus) user = focus.user_id;
  if (!ip && focus?.ip) ip = focus.ip;
  const h = ipHash ?? (ip ? hashIp(ip) : null);
  if (user && !listArgs.p_user) {
    const { data } = await db.rpc('ops_list_sessions', { p_user: user, p_ip: null, p_limit: 200 });
    sessions = (data ?? []) as SessionRow[];
  }
  const linked = sessions.filter((s) => (user && s.user_id === user) || (ip && s.ip === ip));

  const [{ data: prof }, auditQ, sigQ, { data: known }, { data: incidents }, authQ, trailQ] = await Promise.all([
    user ? db.from('profiles').select('role').eq('id', user).maybeSingle() : Promise.resolve({ data: null }),
    user ? db.from('admin_audit_log').select('created_at, method, path, ip, detail').eq('actor_id', user).gte('created_at', start.toISOString()).order('created_at', { ascending: true }).limit(1000)
      : ip ? db.from('admin_audit_log').select('created_at, method, path, ip, detail, actor_id').eq('ip', ip).gte('created_at', start.toISOString()).order('created_at', { ascending: true }).limit(1000) : Promise.resolve({ data: [] }),
    h ? db.from('security_signals').select('created_at, kind, path, country, actor_id').eq('ip_hash', h).gte('created_at', new Date(end.getTime() - 90 * 86_400_000).toISOString()).order('created_at', { ascending: true }).limit(1000) : Promise.resolve({ data: [] }),
    h ? db.from('ops_known_places').select('ip_hash, created_at, via').eq('ip_hash', h).maybeSingle() : Promise.resolve({ data: null }),
    db.from('security_incidents').select('id, created_at, opened_via, status, actions').or([user ? `subject_user.eq.${user}` : '', h ? `ip_hash.eq.${h}` : ''].filter(Boolean).join(',') || 'id.is.null').order('created_at', { ascending: false }).limit(10),
    (user || ip) ? db.rpc('ops_auth_events', { p_user: user, p_ip: ip, p_start: start.toISOString(), p_end: end.toISOString() }) : Promise.resolve({ data: [] }),
    (user || ip) ? db.rpc('ops_session_trail', { p_user: user, p_ip: ip, p_start: start.toISOString(), p_end: end.toISOString() }) : Promise.resolve({ data: [] }),
  ]);
  type A = { created_at: string; method: string; path: string; ip: string | null; detail: Record<string, unknown> | null };
  const auditAll = ((auditQ as { data: A[] | null }).data ?? []);
  const audit = auditAll.filter((a) => !input.session || (a.detail?.session ?? null) === input.session || (!a.detail?.session && (!ip || a.ip === ip)));
  type S = { created_at: string; kind: string; path: string | null; country: string | null };
  const sig = ((sigQ as { data: S[] | null }).data ?? []);
  type E = { ts: string; action: string; ip: string | null; provider: string | null };
  const authEvents = ((authQ as { data: E[] | null }).data ?? []);

  const firstOk = sig.find((s) => s.kind === 'admin_ok' || s.kind === 'login_ok');
  const firstSuccessTs = focus?.created_at ?? firstOk?.created_at ?? audit[0]?.created_at ?? null;
  const failKinds = new Set(['admin_401', 'admin_403', 'login_fail']);
  const failsBefore = sig.filter((s) => failKinds.has(s.kind) && (!firstSuccessTs || s.created_at <= firstSuccessTs)).length
    + authEvents.filter((e) => /fail|invalid|denied/i.test(e.action) && (!firstSuccessTs || e.ts <= firstSuccessTs)).length;
  const countries = Array.from(new Set(sig.map((s) => s.country).filter(Boolean))) as string[];
  const country = (focus && audit.find((a) => a.ip === focus.ip)?.detail?.country as string | undefined) ?? firstOk?.country ?? countries[0] ?? null;
  const older = sessions.filter((s) => focus && s.id !== focus.id && s.created_at < focus.created_at);
  const newDevice = !!focus?.user_agent && older.length > 0 && !older.some((s) => s.user_agent === focus.user_agent);
  const { data: priorCountries } = country && user ? await db.from('security_signals').select('country').eq('actor_id', user).neq('ip_hash', h ?? '').gte('created_at', new Date(end.getTime() - 90 * 86_400_000).toISOString()).limit(300) : { data: null };
  const pc = ((priorCountries ?? []) as { country: string | null }[]).map((r) => r.country);
  const newCountry = !!country && pc.length > 0 && !pc.includes(country);
  const routes = audit.filter((a) => a.method !== 'SECURITY');
  const exports = audit.filter((a) => EXPORT.test(a.path));
  const sensitive = routes.filter((a) => SENSITIVE.test(a.path));
  const refreshedOld = !!focus && !!focus.refreshed_at && Date.parse(focus.refreshed_at) - Date.parse(focus.created_at) > 7 * 86_400_000 && newDevice;

  const facts: Facts = {
    sessionMethods: focus?.methods ?? [], aal: focus?.aal ?? null, failsBefore, newDevice, newCountry, knownPlace: !!known,
    exports: exports.length, sensitiveRoutes: new Set(sensitive.map((a) => a.path)).size, routes: routes.length, refreshedOld,
    isAdmin: (prof as { role?: string } | null)?.role === 'admin', activeSessions: linked.length,
  };

  const timeline: TimelineItem[] = [];
  for (const s of sig) if (failKinds.has(s.kind)) timeline.push({ ts: s.created_at, kind: 'fail', title: s.kind === 'login_fail' ? 'ניסיון התחברות שנכשל' : 'ניסיון גישה לניהול שנדחה', detail: s.path ?? undefined, country: s.country });
  if (firstOk) timeline.push({ ts: firstOk.created_at, kind: 'success', title: 'נראה לראשונה מהכתובת הזו (הצלחה)', country: firstOk.country });
  for (const s of linked) timeline.push({ ts: s.created_at, kind: 'session', title: `נפתח חיבור: ${s.methods.map(methodHe).join(' + ') || 'שיטה לא ידועה'}${s.aal === 'aal2' ? ' · דו-שלבי' : ''}`, detail: s.user_agent ?? undefined, ip: s.ip });
  // Server-side trail of every session ever opened (survives logout/revoke/expiry; see migration 000189).
  type T = { ts: string; session_id: string; aal: string | null; ip: string | null; user_agent: string | null };
  const liveIds = new Set(linked.map((s) => s.id));
  for (const t of ((trailQ as { data: T[] | null }).data ?? [])) if (!liveIds.has(t.session_id)) timeline.push({ ts: t.ts, kind: 'session', title: `נפתח חיבור (כבר לא פעיל)${t.aal === 'aal2' ? ' · דו-שלבי' : ''}`, detail: t.user_agent ?? undefined, ip: t.ip });
  for (const e of authEvents) timeline.push({ ts: e.ts, kind: 'auth', title: `אירוע התחברות: ${e.action}`, detail: e.provider ?? undefined, ip: e.ip });
  // collapse routes: one row per distinct path per hour
  const seen = new Set<string>();
  for (const a of audit) {
    const key = `${a.path}|${a.created_at.slice(0, 13)}`;
    if (seen.has(key)) continue; seen.add(key);
    timeline.push({ ts: a.created_at, kind: a.method === 'SECURITY' ? 'security' : EXPORT.test(a.path) ? 'export' : 'route', title: a.method === 'SECURITY' ? `פעולת אבטחה: ${a.path}` : `${a.method} ${a.path}`, ip: a.ip, country: (a.detail?.country as string) ?? null });
  }
  timeline.sort((x, y) => x.ts.localeCompare(y.ts));

  return {
    subject: { user, ip, ipHash: h, session: input.session ?? focus?.id ?? null, country, isAdmin: facts.isAdmin, knownPlace: known ?? null },
    focus, linked, facts, verdict: verdictFor(facts), timeline: timeline.slice(-300),
    routes: Array.from(routes.reduce((m, a) => m.set(a.path, (m.get(a.path) ?? 0) + 1), new Map<string, number>())).map(([path, n]) => ({ path, n })).sort((a, b) => b.n - a.n).slice(0, 40),
    exports: exports.slice(-40).map((a) => ({ ts: a.created_at, path: a.path })),
    incidents: incidents ?? [],
    gaps: [
      ...(authEvents.length ? [] : ['יומן ההתחברויות המובנה של ספק ההזדהות לא נשמר במסד. כל חיבור חדש נרשם אצלנו בצד השרת, וניסיונות סיסמה כושלים נספרים מדף הכניסה, כך שניסיון שעוקף את דף הכניסה לא ייספר.']),
      ...(audit.some((a) => a.detail?.session) ? [] : ['פעולות ישנות נרשמו בלי מזהה חיבור; החל מעכשיו כל פעולת ניהול נרשמת עם מזהה החיבור.']),
    ],
  };
}
