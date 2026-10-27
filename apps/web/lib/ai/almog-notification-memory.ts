import type { SupabaseClient } from '@supabase/supabase-js';
import { describeNotificationSource } from '@/lib/module-api/notifications/lib-notifications-notification-chat-context';
import { extractSource } from '@/lib/module-api/notifications/lib-notifications-replyable';

const LOOKBACK_DAYS = 14;
const MAX_NOTIFICATIONS = 22;
const BODY_CLIP = 220;

const ALMOG_NOTIFY_SOURCES = new Set([
  'almog_habit_checkpoint',
  'almog_personalized_check_in',
  'onboarding_check_in',
  'almog_followup_workflow',
  'almog_journey_companion',
  'almog_life_context',
  'cron_ops',
  'almog_kickoff',
  'almog_scheduled_reminder',
  'almog_passive_presence',
  'almog_sos',
  'almog_intro_welcome',
  'journey_motivation',
  'journey_followup',
  'lesson_feedback',
  'reengagement',
  'crisis_reconnect',
  'micro_win',
  'weight_log',
  'return_visit',
  'habit_checkpoint',
  'habit_checkpoint_batch',
]);

export type AlmogNotificationRecord = {
  id: string;
  title: string;
  body: string;
  source: string | null;
  sourceLabel: string | null;
  sentAt: string;
  sentAtLabel: string;
  isRead: boolean;
  isSent: boolean;
  userRepliedAfter: boolean;
};

function isAlmogNotification(meta: Record<string, unknown> | null, source: string): boolean {
  if (meta?.mentor === 'almog') return true;
  if (ALMOG_NOTIFY_SOURCES.has(source)) return true;
  return source.startsWith('almog');
}

function formatIsraelDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('he-IL', {
      timeZone: 'Asia/Jerusalem',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function effectiveSentAt(row: {
  created_at?: string;
  send_at?: string | null;
  is_sent?: boolean | null;
}): string {
  if (row.is_sent && row.send_at) return row.send_at;
  if (row.send_at && new Date(row.send_at).getTime() <= Date.now()) return row.send_at;
  return row.created_at ?? new Date().toISOString();
}

/**
 * רשימת התראות שאלמוג שלח — 14 ימים אחרונים, עם תאריך/שעה מדויקים וסטטוס תגובה.
 */
export async function fetchRecentAlmogNotifications(
  supabase: SupabaseClient,
  userId: string,
  opts: { lookbackDays?: number; limit?: number } = {}
): Promise<AlmogNotificationRecord[]> {
  const lookbackDays = opts.lookbackDays ?? LOOKBACK_DAYS;
  const limit = opts.limit ?? MAX_NOTIFICATIONS;
  const since = new Date(Date.now() - lookbackDays * 86400000).toISOString();

  const { data: rows, error } = await supabase
    .from('notifications')
    .select('id, title, body, metadata, created_at, send_at, is_sent, is_read')
    .eq('user_id', userId)
    .eq('type', 'ai_message')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit * 2);

  if (error || !rows?.length) return [];

  const filtered: Array<{
    id: string;
    title: string;
    body: string;
    source: string | null;
    sentAt: string;
    isRead: boolean;
    isSent: boolean;
  }> = [];

  for (const row of rows) {
    const meta = (row.metadata ?? null) as Record<string, unknown> | null;
    const source = extractSource(meta);
    if (!isAlmogNotification(meta, source ?? '')) continue;
    const body = typeof row.body === 'string' ? row.body.trim() : '';
    if (!body) continue;
    filtered.push({
      id: row.id as string,
      title: typeof row.title === 'string' ? row.title.trim() : '',
      body,
      source,
      sentAt: effectiveSentAt(row as { created_at?: string; send_at?: string | null; is_sent?: boolean | null }),
      isRead: Boolean(row.is_read),
      isSent: Boolean(row.is_sent),
    });
    if (filtered.length >= limit) break;
  }

  if (!filtered.length) return [];

  const oldestSent = filtered.reduce(
    (min, r) => Math.min(min, new Date(r.sentAt).getTime()),
    Date.now()
  );

  const { data: userMsgs } = await supabase
    .from('ai_interactions')
    .select('created_at')
    .eq('user_id', userId)
    .eq('role', 'user')
    .gte('created_at', new Date(oldestSent - 60000).toISOString())
    .order('created_at', { ascending: true })
    .limit(200);

  const replyTimes = (userMsgs ?? [])
    .map((m) => new Date(m.created_at as string).getTime())
    .filter(Number.isFinite);

  return filtered.map((r) => {
    const sentMs = new Date(r.sentAt).getTime();
    return {
      ...r,
      sourceLabel: describeNotificationSource(r.source),
      sentAtLabel: formatIsraelDateTime(r.sentAt),
      userRepliedAfter: replyTimes.some((t) => t > sentMs + 5000),
    };
  });
}

/** Prompt shows only the newest N distinct notifications in full; older/duplicate ones are counted. */
export const PROMPT_NOTIFICATIONS_FULL = 8;
const PROMPT_BODY_CLIP = 140;

export function formatAlmogNotificationsPromptBlock(
  records: AlmogNotificationRecord[],
  opts: { highlightNotificationId?: string | null } = {}
): string | null {
  if (!records.length) return null;
  const hl = opts.highlightNotificationId ?? null;
  // records arrive newest-first. Dedupe by kind+body: keep the newest, count repeats.
  const groups = new Map<string, { r: AlmogNotificationRecord; n: number; hl: boolean }>();
  for (const r of records) {
    const key = `${r.source ?? ''}|${r.body.replace(/\s+/g, ' ').slice(0, 80)}`;
    const g = groups.get(key);
    if (g) {
      g.n += 1;
      if (r.id === hl) g.hl = true;
    } else groups.set(key, { r, n: 1, hl: r.id === hl });
  }
  const all = [...groups.values()];
  const shown = all.filter((g, i) => i < PROMPT_NOTIFICATIONS_FULL || g.hl);
  const omitted = all.length - shown.length;
  const lines = shown.map(({ r, n, hl: isHl }) => {
    const kind = r.sourceLabel ?? r.source ?? 'הודעה';
    const body = r.body.replace(/\s+/g, ' ');
    const clip = isHl ? 400 : PROMPT_BODY_CLIP;
    const bodyShort = body.length > clip ? `${body.slice(0, clip)}…` : body;
    const status = [r.isSent ? null : 'באפליקציה', r.isRead ? 'נקרא' : 'לא נקרא', r.userRepliedAfter ? 'ענה' : 'לא ענה']
      .filter(Boolean)
      .join('/');
    const rep = n > 1 ? ` ×${n}` : '';
    return `• ${r.sentAtLabel} · ${kind}${rep}: "${bodyShort}" (${status})${isHl ? ' ← מגיבים עכשיו' : ''}`;
  });
  const more = omitted > 0 ? `\n(+${omitted} התראות ישנות יותר ב-14 הימים האחרונים, לא מפורטות)` : '';
  return `[התראות שאלמוג שלח — מקור אמת, שעון ישראל, חדש→ישן. אל תכחיש ואל תמציא התראות. כשהמשתמש מתייחס להודעה/התראה — התאם לשורה לפי זמן ותוכן; שורה "← מגיבים עכשיו" קודמת.]
${lines.join('\n')}${more}`;
}
