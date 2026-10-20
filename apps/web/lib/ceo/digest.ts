import { withAiUsage } from '@/lib/ai/usage-meter';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CEO_NAME, CEO_SYSTEM_PROMPT } from './agent';
import { audit } from './actions';
import { autoForward, extractFinding, forwardedLine, forwardedSince } from './dev-forward';
import type { CeoChannel } from './channel';
import { allowedChatIds, opsLink } from './channel';
import { digestRecipients, readGideonSettings, type GideonSettings } from './settings';
import { CEO_CONTENT_MODEL, complete } from './llm';
import { TOOL_BY_NAME } from './tools';
import { privacyDigestLine, privacyReopenedLine } from '../privacy/compliance-server';
import { dueForReminder, formatTaskLine, openOwnerTasks, taskButtons } from './owner-tasks';

export type CostAnomaly = { component: string; culprit: string; yesterday_usd: number; baseline_usd: number; ratio: number | null };
export async function costAnomalies(db: SupabaseClient, t?: Pick<GideonSettings, 'cost_ratio_threshold' | 'cost_min_delta_usd' | 'cost_per_user_min_delta_usd' | 'cost_max_single_user_share'>): Promise<CostAnomaly[]> {
  const s = t ?? (await readGideonSettings(db));
  const { data } = await db.rpc('cost_anomalies', {
    p_ratio: s.cost_ratio_threshold,
    p_min_delta: s.cost_min_delta_usd,
    p_min_delta_user: s.cost_per_user_min_delta_usd,
    p_max_share: s.cost_max_single_user_share,
  });
  return (data ?? []) as CostAnomaly[];
}

/** Systemic jump vs 14-day median → likely a bug burning resources. Not single heavy users (filtered in SQL). */
export function formatCostAlert(a: CostAnomaly[]): string {
  const lines = a.map((x) => `• ${x.component === 'per_active_user' ? 'עלות AI למשתמש פעיל' : x.component}: $${Number(x.yesterday_usd).toFixed(3)} אתמול מול $${Number(x.baseline_usd).toFixed(3)} רגיל (×${x.ratio ?? '?'})${x.culprit && x.culprit !== '-' ? `, חשוד: ${x.culprit}` : ''}`);
  return `🚨 חריגת עלות מערכתית\n${lines.join('\n')}\nזה נראה כמו באג ששורף משאבים ולא משתמש כבד. פירוט: ${opsLink('/costs')}`;
}

export type DigestPeriod = 'daily' | 'weekly' | 'monthly';
const DAYS: Record<DigestPeriod, number> = { daily: 1, weekly: 7, monthly: 30 };

const ASK: Record<DigestPeriod, string> = {
  daily: 'כתוב עדכון יומי קצר מאוד (עד 6 שורות): רק מה שחשוב ודורש תשומת לב או פעולה. אם אין כלום חשוב, כתוב שורה אחת "יום שקט" עם 1-2 מספרים.',
  weekly: 'כתוב סיכום שבועי (עד 15 שורות): מגמות מול השבוע הקודם, משתמשים בסיכון, איכות אלמוג (בדוק את הדוגמאות: עברית, בטיחות, לשון זכר, מגדר המשתמש, מסגור הרגלים), פערי תוכן, ו-3 פעולות מומלצות.',
  monthly: 'כתוב דוח חודשי מעמיק (עד 30 שורות): מגמות ושימור, משפך (הרשמה→אונבורדינג→פעילות), עסקי (MRR, נטישה, עלות AI למשתמש), איכות אלמוג עם דוגמאות קונקרטיות לבעיות, פערי תוכן לפי תחנות, ו-5 החלטות מומלצות לחודש הבא לפי סדר עדיפות.',
};

/** All numbers come from SQL/tools; exactly ONE model call per digest. */
export async function buildDigest(...a: Parameters<typeof buildDigestInner>) {
  return withAiUsage({ feature: 'gideon_digest' }, () => buildDigestInner(...a));
}

async function buildDigestInner(db: SupabaseClient, period: DigestPeriod, deps: { complete?: typeof complete } = {}): Promise<string> {
  const llm = deps.complete ?? complete;
  const days = DAYS[period];
  const run = (name: string, args: Record<string, unknown> = {}) => TOOL_BY_NAME.get(name)!.run(db, TOOL_BY_NAME.get(name)!.schema.parse(args));
  const metrics = await run('metrics', { days });
  const data: Record<string, unknown> = { metrics };
  if (period !== 'daily') {
    const [quality, content] = await Promise.all([run('almog_quality_sample', { days, limit: period === 'monthly' ? 20 : 12 }), run('content_overview')]);
    data.almogSample = quality;
    data.content = (content as { station: string; steps: { published: boolean; video: boolean }[] }[]).map((s) => ({ station: s.station, steps: s.steps.length, published: s.steps.filter((x) => x.published).length, withVideo: s.steps.filter((x) => x.video).length }));
  }
  const settings = await readGideonSettings(db);
  const [tasks, anomalies] = await Promise.all([
    settings.alert_topics.owner_tasks ? openOwnerTasks(db) : Promise.resolve([]),
    settings.alert_topics.cost ? costAnomalies(db, settings) : Promise.resolve([] as CostAnomaly[]),
  ]);
  if (anomalies.length) data.costAnomalies = anomalies;
  if (tasks.length) data.danielOpenTasks = tasks.map((t) => formatTaskLine(t));
  if (period === 'monthly') data.business = await run('business_metrics', { days: 30 });

  // Daily = aggregated numbers + error text only → classified technical (DeepSeek-eligible; guard re-checks).
  // Weekly/monthly include Almog's texts → sensitive (OpenRouter only). Monthly uses the stronger model for deeper insight.
  const { message } = await llm({
    sensitivity: period === 'daily' ? 'technical' : 'sensitive',
    model: period === 'monthly' ? CEO_CONTENT_MODEL : undefined,
    messages: [
      { role: 'system', content: CEO_SYSTEM_PROMPT },
      { role: 'user', content: `${ASK[period]}${tasks.length ? '\nיש משימות פתוחות לדניאל: הזכר אותן בשורה אחת קצרה בסוף.' : ''}${anomalies.length ? '\nיש חריגת עלות מערכתית (costAnomalies): ציין אותה בשורה אחת עם הרכיב והחשוד.' : ''}\nנתונים (${days} ימים, השוואה לתקופה הקודמת בשדות *_prev):\n${JSON.stringify(data)}` },
    ],
  });
  const title = { daily: '☀️ עדכון יומי', weekly: '📊 סיכום שבועי', monthly: '🧭 דוח חודשי' }[period];
  const links = `\n\n🔗 ${opsLink('/business')}\n🔗 ${opsLink('/errors')}\n🔗 ${opsLink('/ceo')}`;
  // monthly only: one deterministic line about open privacy-compliance items (no extra model call)
  // daily: mention compliance items that auto-reopened in the last 24h (once per item, no extra message)
  const privacy = period === 'monthly' ? await privacyDigestLine(db, opsLink('/privacy')).catch(() => null)
    : period === 'daily' ? await privacyReopenedLine(db, opsLink('/privacy')).catch(() => null) : null;
  return `${title} · ${CEO_NAME}\n\n${(message.content ?? '').trim()}${privacy ? `\n\n${privacy}` : ''}${links}`;
}

export async function sendDigest(db: SupabaseClient, channel: CeoChannel, period: DigestPeriod, deps: { complete?: typeof complete; extract?: typeof extractFinding } = {}) {
  const settings = await readGideonSettings(db);
  const chats = digestRecipients(settings, allowedChatIds());
  if (settings.alert_topics[period]) {
    let text = await buildDigest(db, period, deps);
    // auto-consult: technical/quality findings go straight to Or (anonymized, deduped); business stays with Daniel
    // every period: daily carries server errors / cron failures / log spikes; weekly+ also Almog quality & content gaps
    const f = await (deps.extract ?? extractFinding)(text).catch(() => null);
    if (f) await autoForward(db, f, { source: `digest_${period}` }).catch(() => null);
    text += forwardedLine(await forwardedSince(db, new Date(Date.now() - DAYS[period] * 86_400_000).toISOString()).catch(() => []));
    for (const c of chats) await channel.send(c, text, undefined, { kind: 'digest', topic: period });
  }
  // systemic cost alert (separate message, only when the SQL check fires with the admin thresholds)
  const anomalies = settings.alert_topics.cost ? await costAnomalies(db, settings) : [];
  if (anomalies.length) for (const c of chats) await channel.send(c, formatCostAlert(anomalies), undefined, { kind: 'alert', topic: 'cost' });
  // follow-up: one message per due/overdue human task, with done/snooze buttons (max 3/day)
  const due = settings.alert_topics.owner_tasks ? dueForReminder(await openOwnerTasks(db)).slice(0, 3) : [];
  for (const t of due) {
    for (const c of chats) await channel.send(c, `📌 תזכורת: ${formatTaskLine(t)}${t.detail ? `\n${t.detail}` : ''}`, taskButtons(t.id), { kind: 'reminder', topic: 'owner_tasks' });
    await db.from('ceo_owner_tasks').update({ last_reminded_at: new Date().toISOString() }).eq('id', t.id);
  }
  // compliance doc 08: monthly in-DB restore drill (result shows in Ops → פרטיות; failure = open item next digest)
  if (period === 'monthly') await db.rpc('owner_restore_drill').then(() => undefined, () => undefined);
  await audit(db, 'cron', 'digest', { period, chats: chats.length });
  return { sent: chats.length };
}

/** One daily 21:00 IL schedule: monthly on the last day of the month, weekly on Saturday, else daily. ?period= forces one. */
export function periodsFor(now: Date, forced?: string | null): DigestPeriod[] {
  if (forced === 'daily' || forced === 'weekly' || forced === 'monthly') return [forced];
  const il = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const tomorrow = new Date(il.getFullYear(), il.getMonth(), il.getDate() + 1);
  if (tomorrow.getDate() === 1) return ['monthly'];
  if (il.getDay() === 6) return ['weekly'];
  return ['daily'];
}


/** Next run of the configured digest hour (Israel), as epoch seconds, strictly after `now`. */
export function nextDigestAt(hourIl: number, now = new Date()): number {
  for (let h = 1; h <= 48; h++) {
    const t = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000 + h * 3_600_000);
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false }).format(t)) % 24;
    if (hour === hourIl) return Math.floor(t.getTime() / 1000);
  }
  return Math.floor(now.getTime() / 1000) + 86_400;
}

export function israelHourNow(now = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false }).format(now)) % 24;
}
