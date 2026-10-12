import type { SupabaseClient } from '@supabase/supabase-js';
import { CEO_NAME, CEO_SYSTEM_PROMPT } from './agent';
import { audit } from './actions';
import type { CeoChannel } from './channel';
import { allowedChatIds, opsLink } from './channel';
import { CEO_CONTENT_MODEL, complete } from './llm';
import { TOOL_BY_NAME } from './tools';

export type DigestPeriod = 'daily' | 'weekly' | 'monthly';
const DAYS: Record<DigestPeriod, number> = { daily: 1, weekly: 7, monthly: 30 };

const ASK: Record<DigestPeriod, string> = {
  daily: 'כתוב עדכון יומי קצר מאוד (עד 6 שורות): רק מה שחשוב ודורש תשומת לב או פעולה. אם אין כלום חשוב, כתוב שורה אחת "יום שקט" עם 1-2 מספרים.',
  weekly: 'כתוב סיכום שבועי (עד 15 שורות): מגמות מול השבוע הקודם, משתמשים בסיכון, איכות אלמוג (בדוק את הדוגמאות: עברית, בטיחות, לשון זכר, מגדר המשתמש, מסגור הרגלים), פערי תוכן, ו-3 פעולות מומלצות.',
  monthly: 'כתוב דוח חודשי מעמיק (עד 30 שורות): מגמות ושימור, משפך (הרשמה→אונבורדינג→פעילות), עסקי (MRR, נטישה, עלות AI למשתמש), איכות אלמוג עם דוגמאות קונקרטיות לבעיות, פערי תוכן לפי תחנות, ו-5 החלטות מומלצות לחודש הבא לפי סדר עדיפות.',
};

/** All numbers come from SQL/tools; exactly ONE model call per digest. */
export async function buildDigest(db: SupabaseClient, period: DigestPeriod, deps: { complete?: typeof complete } = {}): Promise<string> {
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
  if (period === 'monthly') data.business = await run('business_metrics', { days: 30 });

  // Daily = aggregated numbers + error text only → classified technical (DeepSeek-eligible; guard re-checks).
  // Weekly/monthly include Almog's texts → sensitive (OpenRouter only). Monthly uses the stronger model for deeper insight.
  const { message } = await llm({
    sensitivity: period === 'daily' ? 'technical' : 'sensitive',
    model: period === 'monthly' ? CEO_CONTENT_MODEL : undefined,
    messages: [
      { role: 'system', content: CEO_SYSTEM_PROMPT },
      { role: 'user', content: `${ASK[period]}\nנתונים (${days} ימים, השוואה לתקופה הקודמת בשדות *_prev):\n${JSON.stringify(data)}` },
    ],
  });
  const title = { daily: '☀️ עדכון יומי', weekly: '📊 סיכום שבועי', monthly: '🧭 דוח חודשי' }[period];
  const links = `\n\n🔗 ${opsLink('/business')}\n🔗 ${opsLink('/errors')}\n🔗 ${opsLink('/ceo')}`;
  return `${title} · ${CEO_NAME}\n\n${(message.content ?? '').trim()}${links}`;
}

export async function sendDigest(db: SupabaseClient, channel: CeoChannel, period: DigestPeriod, deps: { complete?: typeof complete } = {}) {
  const text = await buildDigest(db, period, deps);
  const chats = [...allowedChatIds()];
  for (const c of chats) await channel.send(c, text);
  await audit(db, 'cron', 'digest', { period, chats: chats.length });
  return { sent: chats.length };
}

/** One daily schedule. Adds weekly on Sunday and monthly on the 1st (Israel time). ?period= forces one. */
export function periodsFor(now: Date, forced?: string | null): DigestPeriod[] {
  if (forced === 'daily' || forced === 'weekly' || forced === 'monthly') return [forced];
  const il = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  if (il.getDate() === 1) return ['monthly'];
  if (il.getDay() === 0) return ['weekly'];
  return ['daily'];
}

