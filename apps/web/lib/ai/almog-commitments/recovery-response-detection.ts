/**
 * זיהוי חוסר תגובה — שאילתות recovery, נדנודים, וצעדים מותאמים שלא נענו.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

function envHours(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function envDays(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** שעות מינימום לפני שמסמנים "לא ענה" להקשר צ'אט */
export const RECOVERY_NO_REPLY_CHAT_HOURS = envHours('RECOVERY_NO_REPLY_CHAT_HOURS', 8);
/** שעות לפני הסלמה אוטומטית לתוכנית מותאמת */
export const RECOVERY_NO_REPLY_ESCALATE_HOURS = envHours('RECOVERY_NO_REPLY_ESCALATE_HOURS', 24);
/** ימים לפני סימון שצעד recovery יומי לא בוצע ולא נענה */
export const RECOVERY_ASSIGNMENT_STALE_DAYS = envDays('RECOVERY_ASSIGNMENT_STALE_DAYS', 2);

export type UnansweredRecoveryKind =
  | 'inquiry_no_reply'
  | 'assignment_no_reply'
  | 'recovery_step_stale';

export type UnansweredRecoverySignal = {
  kind: UnansweredRecoveryKind;
  userId: string;
  taskTitle: string;
  journeyTaskId: string | null;
  stepId: string | null;
  assignmentId: string | null;
  blockerId: string | null;
  sentAt: string;
  hoursSince: number;
  severity: 'awareness' | 'follow_up' | 'escalate_plan';
  bodySnippet: string;
};

type ResponseCache = {
  lastRespondedAt: string | null;
  userMessageTimes: number[];
};

async function loadResponseCache(
  admin: SupabaseClient,
  userId: string,
  sinceIso: string
): Promise<ResponseCache> {
  const [profileRes, msgsRes] = await Promise.all([
    admin.from('profiles').select('last_responded_at').eq('id', userId).maybeSingle(),
    admin
      .from('ai_interactions')
      .select('created_at')
      .eq('user_id', userId)
      .eq('role', 'user')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true })
      .limit(80),
  ]);

  const lastRespondedAt =
    (profileRes.data as { last_responded_at?: string | null } | null)?.last_responded_at ??
    null;
  const userMessageTimes = ((msgsRes.data ?? []) as Array<{ created_at?: string }>)
    .map((r) => new Date(String(r.created_at)).getTime())
    .filter((t) => Number.isFinite(t));

  return { lastRespondedAt, userMessageTimes };
}

function respondedSince(cache: ResponseCache, sinceIso: string): boolean {
  if (cache.lastRespondedAt && cache.lastRespondedAt >= sinceIso) return true;
  const sinceMs = new Date(sinceIso).getTime();
  return cache.userMessageTimes.some((t) => t >= sinceMs);
}

function hoursSince(iso: string, now: Date): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, (now.getTime() - t) / 3_600_000);
}

function severityForHours(h: number): UnansweredRecoverySignal['severity'] {
  if (h >= RECOVERY_NO_REPLY_ESCALATE_HOURS) return 'escalate_plan';
  if (h >= RECOVERY_NO_REPLY_CHAT_HOURS) return 'follow_up';
  return 'awareness';
}

type ReminderMeta = {
  source?: string;
  signal_kind?: string;
  journey_task_id?: string;
  step_id?: string;
  task_title?: string;
};

export async function detectUnansweredRecoverySignals(
  admin: SupabaseClient,
  userId: string,
  now: Date = new Date(),
  opts: { activeRecoveryTaskIds?: ReadonlySet<string> } = {}
): Promise<UnansweredRecoverySignal[]> {
  const out: UnansweredRecoverySignal[] = [];
  const seen = new Set<string>();
  const sinceIso = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const responseCache = await loadResponseCache(admin, userId, sinceIso);
  const activeRecovery = opts.activeRecoveryTaskIds ?? new Set<string>();

  const { data: sentReminders } = await admin
    .from('scheduled_reminders')
    .select('id, sent_at, title, body, assignment_id, blocker_id, metadata')
    .eq('user_id', userId)
    .eq('status', 'sent')
    .gte('sent_at', sinceIso)
    .order('sent_at', { ascending: false })
    .limit(20);

  for (const row of (sentReminders ?? []) as Array<{
    id: string;
    sent_at: string | null;
    title: string;
    body: string;
    assignment_id: string | null;
    blocker_id: string | null;
    metadata: ReminderMeta | null;
  }>) {
    const sentAt = row.sent_at;
    if (!sentAt) continue;

    const meta = row.metadata ?? {};
    const source = meta.source ?? '';
    const isInquiry = source === 'struggle_inquiry';
    const isRecoveryFollowUp =
      source === 'struggle_followup' || source === 'recovery_no_reply_followup';
    if (!isInquiry && !isRecoveryFollowUp) continue;

    const h = hoursSince(sentAt, now);
    if (h < RECOVERY_NO_REPLY_CHAT_HOURS) continue;
    if (respondedSince(responseCache, sentAt)) continue;

    const journeyTaskId =
      typeof meta.journey_task_id === 'string' ? meta.journey_task_id : null;
    if (journeyTaskId && activeRecovery.has(journeyTaskId)) continue;

    const stepId = typeof meta.step_id === 'string' ? meta.step_id : null;
    const taskTitle =
      typeof meta.task_title === 'string'
        ? meta.task_title
        : row.body.slice(0, 80) || row.title;

    const key = `inquiry|${journeyTaskId ?? row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      kind: 'inquiry_no_reply',
      userId,
      taskTitle,
      journeyTaskId,
      stepId,
      assignmentId: row.assignment_id,
      blockerId: row.blocker_id,
      sentAt,
      hoursSince: h,
      severity: severityForHours(h),
      bodySnippet: row.body.slice(0, 120),
    });
  }

  const staleBefore = new Date(
    now.getTime() - RECOVERY_ASSIGNMENT_STALE_DAYS * 86_400_000
  ).toISOString();

  const { data: easedRows } = await admin
    .from('almog_assignments')
    .select('id, title, given_at, last_done_at, related_step_id, metadata')
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('relation', 'eases')
    .lte('given_at', staleBefore)
    .limit(6);

  for (const row of (easedRows ?? []) as Array<{
    id: string;
    title: string;
    given_at: string;
    last_done_at: string | null;
    related_step_id: string | null;
    metadata: Record<string, unknown> | null;
  }>) {
    if (row.last_done_at && row.last_done_at >= staleBefore) continue;

    const journeyTaskId =
      typeof row.metadata?.journey_task_id === 'string'
        ? row.metadata.journey_task_id
        : null;
    if (journeyTaskId && activeRecovery.has(journeyTaskId)) continue;

    const key = `step|${row.id}`;
    if (seen.has(key)) continue;

    const responded = respondedSince(responseCache, row.given_at);
    const h = hoursSince(row.given_at, now);
    if (h < RECOVERY_NO_REPLY_CHAT_HOURS) continue;

    seen.add(key);
    out.push({
      kind: responded ? 'recovery_step_stale' : 'assignment_no_reply',
      userId,
      taskTitle: row.title,
      journeyTaskId,
      stepId: row.related_step_id,
      assignmentId: row.id,
      blockerId:
        typeof row.metadata?.blocker_id === 'string' ? row.metadata.blocker_id : null,
      sentAt: row.given_at,
      hoursSince: h,
      severity: severityForHours(h),
      bodySnippet: `צעד מותאם "${row.title}" — לא סומן ביצוע`,
    });
  }

  return out;
}

export function formatUnansweredRecoveryForChat(
  signals: UnansweredRecoverySignal[]
): string | null {
  const relevant = signals.filter((s) => s.severity !== 'awareness');
  if (!relevant.length) return null;

  const lines = relevant.slice(0, 4).map((s) => {
    const hours = Math.round(s.hoursSince);
    if (s.kind === 'inquiry_no_reply') {
      return `- שאלת על "${s.taskTitle}" לפני ~${hours} שעות — לא ענה. (${s.bodySnippet.slice(0, 70)}…)`;
    }
    if (s.kind === 'assignment_no_reply') {
      return `- נתת צעד מותאם "${s.taskTitle}" — לא ענה ולא סימן ביצוע (כ-${hours} שעות).`;
    }
    return `- הצעד "${s.taskTitle}" תקוע בלי עדכון כ-${hours} שעות.`;
  });

  return (
    `[חוסר תגובה — recovery]\n${lines.join('\n')}\n` +
    `המשתמש לא ענה / לא עדכן. הישאר עדין ולא מאשים. שאל בקול אחד קצר מה חסם — או הצע צעד קטן יותר אם מתאים.`
  );
}
