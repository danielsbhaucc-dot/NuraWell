import { pruneExpiredAvoidPushUntil } from './avoid-push';
import type { JourneyFollowUp } from './journey-follow-up-promise';
import type { LifeContext } from './life-context';

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
  /**
   * היעד הראשי שהמשתמש הזכיר — משפט אחד נרטיבי בעברית.
   * דוגמה: "להוריד 3 ק"ג עד הקיץ", "להפסיק לאכול בלילה".
   * מתעדכן מה-Background Insight Engine או ידנית מהצ'אט.
   * משמש כ"למה" מאחורי כל מגע — אלמוג מזכיר אותו רק כשטבעי, לא בכל הודעה.
   */
  current_goal?: string;
  /**
   * הפוקוס/הצעד שאלמוג עובד עליו עם המשתמש כרגע — כפי שהמשתמש יבין אותו.
   * דוגמה: "שבוע 2 — כוחה של רוויה", "שבוע מים".
   * שונה מ-`stepTitle` של ה-DB: זה הניסוח שאלמוג בחר עבור המשתמש הזה.
   */
  current_focus?: string;
  /**
   * עד 3 פעולות פתוחות שהמשתמש צריך לעשות עכשיו — סנפ-שוט אנושי, לא JSON של ה-DB.
   * דוגמה: ["לשתות 2 כוסות מים לפני צהריים", "להירשם להליכת ערב"].
   * מתעדכן מה-Background Insight Engine. הכוונה ל-AI היא לא "checklist" — אלא מה
   * שאלמוג מבין שעל הראש של המשתמש; הוא יכול להזכיר אחד מהם בעדינות אם רלוונטי.
   */
  pending_focus?: string[];
  /**
   * עד 3 חסמים שהמשתמש מתמודד איתם — קצר, בעברית.
   * דוגמה: ["מתקשה לזכור לשתות בבוקר", "לחוץ בעבודה השבוע"].
   * שונה מ-`main_blocker` (מחרוזת בודדת, מאות בזמן אמת מהצ'אט):
   * זה מערך מצטבר שמתעדכן מהאנליסט הרקע ושומר היסטוריה קצרה של דפוסים.
   */
  struggles?: string[];
  /**
   * זמינות יומית — דגל זמני, יום-בודד (PR C).
   * שונה מ-`avoid_push` (קבוע) ו-`avoid_push_until` (cooldown אחרי משבר):
   * זה "היום מוצף לי" — חוסם בוקר/צהריים ומשאיר רק מגע ערב אחד דואג.
   * `date` ב-YYYY-MM-DD בלוח ירושלים. אם `date` לא היום — הדגל מתעלם.
   */
  daily_availability?: { date: string; level: 'low' | 'normal' };
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
  /** מעקב אחרי הבטחה בצ'אט — "אמשיך מחר", "עוד שעה" */
  journey_follow_up?: JourneyFollowUp | null;
  /** חופשה / אשפוז / נסיעה — התאמת דחיפה וטון */
  life_context?: LifeContext | null;
  /** סיכום שיחה מתגלגל קצר לצמצום חלון הודעות גולמיות בפרומפט */
  chat_summary?: string;
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

/** YYYY-MM-DD בלוח ירושלים — מקור אמת אחד לתאריך "היום" עבור daily_availability. */
export function israelDateKeyForAiContext(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * האם זמינות יומית "low" פעילה עכשיו (תאריך תואם להיום בירושלים).
 * שדה ישן מאתמול → מתעלם, כדי שלא נישאר עם דגל תקוע.
 */
export function isDailyAvailabilityLowToday(
  availability: AiUserContext['daily_availability'] | null | undefined,
  now: Date = new Date()
): boolean {
  if (!availability || availability.level !== 'low') return false;
  if (typeof availability.date !== 'string' || !availability.date.trim()) return false;
  return availability.date === israelDateKeyForAiContext(now);
}

function compactHumanList(items: unknown, maxItems = 3): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .slice(0, maxItems);
}

/**
 * Working Memory לצ'אט — השכבה האנושית הדחוסה מתוך profiles.ai_context.
 * זה לא RAG ולא היסטוריית שיחה: זה "מה אלמוג אמור לזכור על האדם עכשיו".
 */
export function formatAiWorkingMemoryPromptBlock(
  ctx: AiUserContext | null | undefined,
  now: Date = new Date()
): string | null {
  if (!ctx) return null;

  const lines: string[] = ['[זיכרון עובד — מקור אמת אישי]'];
  if (ctx.current_goal) lines.push(`יעד נוכחי: ${ctx.current_goal}`);
  if (ctx.current_focus) lines.push(`פוקוס נוכחי: ${ctx.current_focus}`);
  if (ctx.main_blocker) lines.push(`חסם שעלה בצ'אט: ${ctx.main_blocker}`);
  if (ctx.current_mood_signal && ctx.current_mood_signal !== 'unknown') {
    lines.push(`מצב רגשי אחרון: ${ctx.current_mood_signal}`);
  }

  const pending = compactHumanList(ctx.pending_focus);
  if (pending.length > 0) {
    lines.push(`פעולות שעל הראש שלו: ${pending.join(' · ')}`);
  }

  const struggles = compactHumanList(ctx.struggles);
  if (struggles.length > 0) {
    lines.push(`חסמים חוזרים: ${struggles.join(' · ')}`);
  }

  if (ctx.notes) lines.push(`תובנת רקע: ${ctx.notes}`);
  if (ctx.tone_notes) lines.push(`טון שעובד איתו: ${ctx.tone_notes}`);
  if (isDailyAvailabilityLowToday(ctx.daily_availability, now)) {
    lines.push('היום זמינות נמוכה: האט קצב, בלי לחפור ובלי לדחוף משימות.');
  }

  if (lines.length === 1) return null;
  lines.push('השתמש בזה בעדינות ובקיצור; אל תגיד "אני רואה בזיכרון" ואל תציג רשימת דאטה.');
  return lines.join('\n');
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
  if (ctx.current_goal) parts.push(`יעד שהמשתמש הזכיר: ${ctx.current_goal}`);
  if (ctx.current_focus) parts.push(`פוקוס נוכחי: ${ctx.current_focus}`);
  if (Array.isArray(ctx.pending_focus) && ctx.pending_focus.length > 0) {
    parts.push(`פעולות פתוחות בראש שלו: ${ctx.pending_focus.slice(0, 3).join(' · ')}`);
  }
  if (Array.isArray(ctx.struggles) && ctx.struggles.length > 0) {
    parts.push(`חסמים מצטברים (מהאנליסט): ${ctx.struggles.slice(0, 3).join(' · ')}`);
  }
  if (isDailyAvailabilityLowToday(ctx.daily_availability)) {
    parts.push('היום: זמינות נמוכה — המשתמש ביקש להאט (מוצף/יום עמוס)');
  }
  if (ctx.avoid_push) parts.push('העדפה: פחות דחיפה והתראות מאלמוג.');
  if (ctx.avoid_push_until) {
    const ms = new Date(ctx.avoid_push_until).getTime();
    if (Number.isFinite(ms) && Date.now() < ms) parts.push('השהיית דחיפה זמנית פעילה');
  }
  if (ctx.skip_weight_check_ins) parts.push('העדפה: ללא תזכורות ייעודיות לעדכון משקל.');
  if (ctx.current_mood_signal && ctx.current_mood_signal !== 'unknown') {
    parts.push(`אות מצב רגשי (ניתוח אחרון): ${ctx.current_mood_signal}`);
  }
  if (ctx.journey_follow_up?.label && ctx.journey_follow_up.check_at) {
    parts.push(
      `הבטחה למעקב במסע: ${ctx.journey_follow_up.label} (בדיקה ~${ctx.journey_follow_up.check_at})`
    );
  }
  const life = ctx.life_context;
  if (life?.summary) {
    parts.push(`הקשר חיים: ${life.summary} (דחיפה: ${life.push_level})`);
  }

  const chatCommitmentsPreview: string[] = ctx.journey_follow_up?.label
    ? [ctx.journey_follow_up.label]
    : [];

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
    'journey_follow_up',
    'life_context',
    'chat_summary',
    'web_push',
    'current_goal',
    'current_focus',
    'pending_focus',
    'struggles',
    'daily_availability',
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
  if (filtered.journey_follow_up === null) {
    const { journey_follow_up: _jf, ...rest } = merged;
    merged = rest;
  }
  if (filtered.life_context === null) {
    const { life_context: _lc, ...rest } = merged;
    merged = rest;
  }
  if ((filtered as { daily_availability?: unknown }).daily_availability === null) {
    const { daily_availability: _da, ...rest } = merged;
    merged = rest;
  }
  /** מחיקת `pending_focus` / `struggles` בעת העברת מערך ריק — patch מפורש לאיפוס. */
  if (Array.isArray(filtered.pending_focus) && filtered.pending_focus.length === 0) {
    const { pending_focus: _pf, ...rest } = merged;
    merged = rest;
  }
  if (Array.isArray(filtered.struggles) && filtered.struggles.length === 0) {
    const { struggles: _s, ...rest } = merged;
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
