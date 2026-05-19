import { pruneExpiredAvoidPushUntil } from './avoid-push';

export interface AiUserContext {
  weakness_pattern?: string;
  engagement_pattern?: string;
  tone_notes?: string;
  commitment_status?: 'active' | 'paused' | 'abandoned' | string;
  fatigue_signal?: boolean;
  dropout_risk?: 'low' | 'medium' | 'high' | string;
  /** ניתוח תמליל תקופתי (Cron) */
  current_mood_signal?: 'frustrated' | 'motivated' | 'disengaged' | 'neutral' | 'unknown' | string;
  notes?: string;
  /** תובנת שבריר מגבולות — נטען מחילוץ רמת 4 או ידנית */
  core_insight?: string;
  /** חסם מרכזי שהמשתמש ציין בצ'אט (אות בזמן אמת) */
  main_blocker?: string;
  /** המשתמש ביקש להפחית דחיפה / התראות AI */
  avoid_push?: boolean;
  /** השהיית התראות עד תאריך ISO (למשל אחרי משבר) — לא מחליף avoid_push קבוע */
  avoid_push_until?: string;
  /** כשמוגדר — לא שולחים תזכורות ייעודיות לעדכון משקל (Cron) */
  skip_weight_check_ins?: boolean;
  /** warm_friend | direct | gentle — טון ליווי (ברירת מחדל: warm_friend) */
  coaching_style?: 'warm_friend' | 'direct' | 'gentle' | string;
  /** שעת הגעה טיפוסית לעבודה (HH:MM) — לעיגון הודעות לפני המשרד */
  work_arrival_time?: string;
  /** Web Push subscription (אופציונלי) */
  web_push?: {
    endpoint: string;
    expirationTime?: number | null;
    keys: { p256dh: string; auth: string };
    updated_at?: string;
  } | null;
}

export interface BuildUserContextResult {
  contextString: string;
  raw: {
    name: string | null;
    daysSinceLastActive: number | null;
    aiContext: AiUserContext;
    weeklyCompleted: number;
    chatCommitmentsPreview: string[];
  };
}

interface ProfileRow {
  full_name: string | null;
  last_active_at: string | null;
  ai_context: AiUserContext | null;
}

interface JourneyProgressRow {
  step_id: string | null;
  completed_at: string | null;
  quiz_score: number | null;
  game_score: number | null;
  commitment_accepted: boolean | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysDiffFromNow(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

/**
 * בונה קונטקסט דחוס למודל - 3 שכבות, בערך עד ~500 טוקנים.
 * לא שולח raw data של תמלילים אלא תקצירי התנהגות.
 */
export async function buildUserContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string
): Promise<BuildUserContextResult> {
  const { data: profileData } = await supabase
    .from('profiles')
    .select('full_name, last_active_at, ai_context')
    .eq('id', userId)
    .single();

  const profile = (profileData ?? null) as ProfileRow | null;
  if (!profile) {
    return {
      contextString: 'מידע על המשתמש: משתמש חדש - אין עדיין נתונים אישיים.',
      raw: {
        name: null,
        daysSinceLastActive: null,
        aiContext: {},
        weeklyCompleted: 0,
        chatCommitmentsPreview: [],
      },
    };
  }

  const ctx = (profile.ai_context ?? {}) as AiUserContext;
  const daysSinceLastActive = profile.last_active_at
    ? daysDiffFromNow(profile.last_active_at)
    : null;

  const weekStartIso = isoDaysAgo(7);
  const { data: recentProgressData } = await supabase
    .from('journey_progress')
    .select('step_id, completed_at, quiz_score, game_score, commitment_accepted')
    .eq('user_id', userId)
    .gte('completed_at', weekStartIso)
    .order('completed_at', { ascending: false })
    .limit(15);

  const recentProgress = (recentProgressData ?? []) as JourneyProgressRow[];

  const { data: commitmentsData } = await supabase
    .from('journey_progress')
    .select('step_id, commitment_accepted, completed_at')
    .eq('user_id', userId)
    .eq('commitment_accepted', true)
    .order('completed_at', { ascending: false })
    .limit(3);

  const commitments = (commitmentsData ?? []) as JourneyProgressRow[];

  const progressSummary = summarizeWeeklyProgress(recentProgress);
  const commitmentSummary = summarizeCommitments(commitments);

  const parts: string[] = [];
  parts.push(`שם: ${profile.full_name ?? 'המשתמש'}`);

  if (daysSinceLastActive !== null) {
    parts.push(`ימים מאז כניסה: ${daysSinceLastActive}`);
  }

  if (ctx.weakness_pattern) parts.push(`חולשה שזוהתה: ${ctx.weakness_pattern}`);
  if (ctx.fatigue_signal) parts.push('אות עייפות: כן');
  if (ctx.dropout_risk && ctx.dropout_risk !== 'low') parts.push(`סיכון נטישה: ${ctx.dropout_risk}`);
  if (ctx.tone_notes) parts.push(`טון שעובד: ${ctx.tone_notes}`);
  if (ctx.commitment_status) parts.push(`מצב התחייבות: ${ctx.commitment_status}`);
  if (commitmentSummary) parts.push(`התחייבויות: ${commitmentSummary}`);
  if (progressSummary) parts.push(`שבוע אחרון: ${progressSummary}`);
  if (ctx.notes) parts.push(`תובנה: ${ctx.notes}`);
  if (ctx.core_insight) parts.push(`תובנת ליבה (לטון המנטור): ${ctx.core_insight}`);
  if (ctx.main_blocker) parts.push(`חסם מרכזי (מהמשתמש): ${ctx.main_blocker}`);
  if (ctx.avoid_push) parts.push('העדפה: פחות דחיפה והתראות מאלמוג.');
  if (ctx.avoid_push_until) {
    const ms = new Date(ctx.avoid_push_until).getTime();
    if (Number.isFinite(ms) && Date.now() < ms) parts.push('השהיית דחיפה זמנית פעילה');
  }
  if (ctx.skip_weight_check_ins) parts.push('העדפה: ללא תזכורות ייעודיות לעדכון משקל.');
  if (ctx.current_mood_signal && ctx.current_mood_signal !== 'unknown') {
    parts.push(`אות מצב רגשי (ניתוח אחרון): ${ctx.current_mood_signal}`);
  }

  const chatCommitmentsPreview: string[] = [];

  return {
    contextString: `מידע על המשתמש (לשימוש פנימי בלבד):\n${parts.join('\n')}`,
    raw: {
      name: profile.full_name,
      daysSinceLastActive,
      aiContext: ctx,
      weeklyCompleted: recentProgress.length,
      chatCommitmentsPreview,
    },
  };
}

function summarizeWeeklyProgress(progress: JourneyProgressRow[]): string {
  if (!progress.length) return 'אין פעילות בשבוע האחרון';

  const completed = progress.length;
  const scores = progress.filter((p) => p.quiz_score !== null).map((p) => p.quiz_score as number);
  const avgScore = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;
  const gameWins = progress.filter(
    (p) => typeof p.game_score === 'number' && (p.game_score as number) >= 80
  ).length;

  const parts = [`${completed} שלבים הושלמו`];
  if (avgScore !== null) parts.push(`ציון ממוצע ${avgScore}%`);
  if (gameWins > 0) parts.push(`${gameWins} משחקים חזקים`);
  return parts.join(', ');
}

function summarizeCommitments(commitments: JourneyProgressRow[]): string {
  if (!commitments.length) return '';
  return `${commitments.length} הרגלים פעילים`;
}

/**
 * ממזג patch לתוך profiles.ai_context תוך whitelist לשדות מותרים בלבד.
 */
export async function updateAiContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  patch: Partial<AiUserContext>
): Promise<AiUserContext> {
  const allowedFields: (keyof AiUserContext)[] = [
    'weakness_pattern',
    'engagement_pattern',
    'tone_notes',
    'commitment_status',
    'fatigue_signal',
    'dropout_risk',
    'current_mood_signal',
    'notes',
    'core_insight',
    'main_blocker',
    'avoid_push',
    'avoid_push_until',
    'skip_weight_check_ins',
    'coaching_style',
    'work_arrival_time',
    'web_push',
  ];

  const { data: existing } = await supabase
    .from('profiles')
    .select('ai_context')
    .eq('id', userId)
    .single();

  const current = ((existing as { ai_context: AiUserContext | null } | null)?.ai_context ?? {}) as AiUserContext;

  const filtered = Object.fromEntries(
    Object.entries(patch).filter(([k]) => allowedFields.includes(k as keyof AiUserContext))
  ) as Partial<AiUserContext>;

  let merged: AiUserContext = { ...current, ...filtered };
  if (filtered.avoid_push_until === '') {
    const { avoid_push_until: _removed, ...rest } = merged;
    merged = rest;
  }
  merged = pruneExpiredAvoidPushUntil(merged);

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ ai_context: merged })
    .eq('id', userId);

  if (updateError) {
    throw new Error(`updateAiContext: failed to write profile - ${updateError.message}`);
  }

  return merged;
}
