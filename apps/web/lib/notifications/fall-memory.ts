import type { SupabaseClient } from '@supabase/supabase-js';

export type FallEpisodeStatus = 'open' | 'recovered';
export type FallReasonSource = 'chat' | 'task_note' | 'profile_context' | 'unknown';

export type NotificationFallEpisode = {
  id: string;
  user_id: string;
  status: FallEpisodeStatus;
  started_at: string;
  ended_at: string | null;
  first_seen_date: string;
  last_seen_date: string;
  max_days_absent: number;
  last_activity_at: string | null;
  reason_summary: string | null;
  reason_source: FallReasonSource | null;
  metadata: Record<string, unknown>;
};

export type FallMemoryContext = {
  /** episode פתוח כרגע (אם יש) */
  openEpisode: NotificationFallEpisode | null;
  /** נפילות שהסתיימו — לזיהוי דפוס חוזר */
  recentRecovered: NotificationFallEpisode[];
  /** כמה נפילות היו ב-90 הימים האחרונים */
  totalFallsLast90Days: number;
  /** האם זו נפילה חוזרת (>=2 recovered + open/new absence) */
  isRepeatPattern: boolean;
};

function jerusalemDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

async function inferFallReason(
  admin: SupabaseClient,
  userId: string,
  beforeIso: string
): Promise<{ summary: string | null; source: FallReasonSource }> {
  const windowStart = new Date(new Date(beforeIso).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [chatRes, execRes, profileRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any)
      .from('ai_interactions')
      .select('content, created_at')
      .eq('user_id', userId)
      .eq('role', 'user')
      .gte('created_at', windowStart)
      .lte('created_at', beforeIso)
      .order('created_at', { ascending: false })
      .limit(3),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any)
      .from('journey_task_executions')
      .select('note, outcome, completed_at')
      .eq('user_id', userId)
      .gte('completed_at', windowStart)
      .lte('completed_at', beforeIso)
      .order('completed_at', { ascending: false })
      .limit(3),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any)
      .from('profiles')
      .select('ai_context')
      .eq('id', userId)
      .maybeSingle(),
  ]);

  const chatRows = Array.isArray(chatRes?.data) ? chatRes.data : [];
  for (const row of chatRows as Array<{ content?: string }>) {
    const text = typeof row.content === 'string' ? row.content.trim() : '';
    if (text.length >= 8) {
      const slice = text.length > 120 ? `${text.slice(0, 118)}…` : text;
      return { summary: slice, source: 'chat' };
    }
  }

  const execRows = Array.isArray(execRes?.data) ? execRes.data : [];
  for (const row of execRows as Array<{ note?: string; outcome?: string }>) {
    const note = typeof row.note === 'string' ? row.note.trim() : '';
    if (note.length >= 4) {
      return { summary: note, source: 'task_note' };
    }
    if (row.outcome === 'attempt_failed') {
      return { summary: 'ניסיון משימה שנכשל לפני ההיעדרות', source: 'task_note' };
    }
  }

  const ctx = profileRes?.data?.ai_context as Record<string, unknown> | null | undefined;
  const notes = typeof ctx?.notes === 'string' ? ctx.notes.trim() : '';
  if (notes.length >= 8) {
    const slice = notes.length > 100 ? `${notes.slice(0, 98)}…` : notes;
    return { summary: slice, source: 'profile_context' };
  }

  return { summary: null, source: 'unknown' };
}

/**
 * מסנכרן episode פתוח/סגור לפי daysSinceLastActive.
 * נקרא לפני יצירת התראה habit-checkpoint.
 */
export async function syncFallMemoryForUser(
  admin: SupabaseClient,
  args: {
    userId: string;
    daysSinceLastActive: number;
    lastActivityAt: string | null;
    now?: Date;
    slot?: string;
    pendingTaskTitles?: string[];
  }
): Promise<FallMemoryContext> {
  const now = args.now ?? new Date();
  const todayKey = jerusalemDateKey(now);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: openRow } = await (admin as any)
    .from('notification_fall_episodes')
    .select('*')
    .eq('user_id', args.userId)
    .eq('status', 'open')
    .maybeSingle();

  const openEpisode = (openRow ?? null) as NotificationFallEpisode | null;

  if (args.daysSinceLastActive === 0 && openEpisode) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from('notification_fall_episodes')
      .update({
        status: 'recovered',
        ended_at: now.toISOString(),
        last_activity_at: args.lastActivityAt ?? now.toISOString(),
      })
      .eq('id', openEpisode.id);
  } else if (args.daysSinceLastActive >= 1) {
    if (!openEpisode) {
      const reason = args.lastActivityAt
        ? await inferFallReason(admin, args.userId, args.lastActivityAt)
        : { summary: null, source: 'unknown' as FallReasonSource };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any).from('notification_fall_episodes').insert({
        user_id: args.userId,
        status: 'open',
        started_at: now.toISOString(),
        first_seen_date: todayKey,
        last_seen_date: todayKey,
        max_days_absent: args.daysSinceLastActive,
        last_activity_at: args.lastActivityAt,
        reason_summary: reason.summary,
        reason_source: reason.source,
        metadata: {
          slot: args.slot ?? null,
          pending_tasks: args.pendingTaskTitles ?? [],
        },
      });
    } else {
      const nextMax = Math.max(openEpisode.max_days_absent, args.daysSinceLastActive);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any)
        .from('notification_fall_episodes')
        .update({
          last_seen_date: todayKey,
          max_days_absent: nextMax,
        })
        .eq('id', openEpisode.id);
    }
  }

  const since90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: recoveredRows } = await (admin as any)
    .from('notification_fall_episodes')
    .select('*')
    .eq('user_id', args.userId)
    .eq('status', 'recovered')
    .gte('started_at', since90)
    .order('ended_at', { ascending: false })
    .limit(5);

  const recentRecovered = (Array.isArray(recoveredRows) ? recoveredRows : []) as NotificationFallEpisode[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (admin as any)
    .from('notification_fall_episodes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', args.userId)
    .gte('started_at', since90);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: currentOpen } = await (admin as any)
    .from('notification_fall_episodes')
    .select('*')
    .eq('user_id', args.userId)
    .eq('status', 'open')
    .maybeSingle();

  const totalFalls = typeof count === 'number' ? count : recentRecovered.length;
  const isRepeatPattern =
    args.daysSinceLastActive >= 1 && recentRecovered.length >= 1;

  return {
    openEpisode: (currentOpen ?? null) as NotificationFallEpisode | null,
    recentRecovered,
    totalFallsLast90Days: totalFalls,
    isRepeatPattern,
  };
}

/** בלוק פרומפט קצר ל-LLM — זיכרון נפילות קודמות. */
export function formatFallMemoryPromptBlock(ctx: FallMemoryContext): string | null {
  if (!ctx.openEpisode && ctx.recentRecovered.length === 0) return null;

  const lines: string[] = ['זיכרון נפילות קודמות (השתמש רק אם רלוונטי — אל תמציא):'];

  if (ctx.isRepeatPattern) {
    lines.push('- זו נפילה חוזרת: המשתמש כבר נעלם בעבר, חזר, ושוב נעלם.');
    lines.push('- מותר טון כמו "שוב נעלמת לי?" / "אתה שוב נעלם לי?" — רק אם זה נשמע טבעי.');
  }

  if (ctx.openEpisode) {
    lines.push(
      `- נפילה נוכחית: ${ctx.openEpisode.max_days_absent} ימים בלי תגובה (מ-${ctx.openEpisode.first_seen_date}).`
    );
    if (ctx.openEpisode.reason_summary) {
      lines.push(`- סיבה ידועה לפני הנפילה: ${ctx.openEpisode.reason_summary}`);
    }
  }

  const last = ctx.recentRecovered[0];
  if (last) {
    const duration = last.max_days_absent;
    const ended = last.ended_at ? last.ended_at.slice(0, 10) : 'לא ידוע';
    lines.push(
      `- נפילה קודמת: ${duration} ימים, הסתיימה ב-${ended}${
        last.reason_summary ? ` (סיבה: ${last.reason_summary})` : ''
      }.`
    );
  }

  if (ctx.totalFallsLast90Days > 1) {
    lines.push(`- סה"כ ${ctx.totalFallsLast90Days} נפילות ב-90 הימים האחרונים.`);
  }

  return lines.join('\n');
}
