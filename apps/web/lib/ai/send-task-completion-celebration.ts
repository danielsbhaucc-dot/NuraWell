import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_MODELS } from './client';
import { completeEmpathyNotifyBody } from './empathy-notify-completion';
import { fetchNotifyUserProfile } from './notify-user-profile';
import { ALMOG_NOTIFY_MAX_OUTPUT_TOKENS, buildAlmogNotifySystemPrompt } from './prompts';
import { computeTaskStreak, streakLabelHe } from '../journey/task-streak';
import {
  resolveTaskSchedule,
  slotLabel as slotLabelHe,
} from '../journey/task-schedule';
import type { JourneyTaskSchedule, JourneyTaskSlot } from '../types/journey';

/**
 * 🎉 Celebration system — נשלח מיידית כשמשתמש מסמן ביצוע.
 *
 * שיפורים מהגרסה הקודמת:
 *  1. **פר-סלוט** — לא רק כשהכל הושלם. כל סימון מקבל פרגון.
 *  2. **סטריק דטרמיניסטי** — מחשבים את הרצף מ-DB *לפני* ה-LLM, ושותלים
 *     אותו בפרומפט. ה-AI יודע במדויק "5 ימים רצוף" ולא צריך להמציא.
 *  3. **משפט פסיכולוגי-מנטלי** — מעבר ל-"אלוף", הפרומפט מבקש מ-הAI לתת
 *     משפט קצר על *למה זה חשוב* (אמינות עצמית / זהות / נוירופלסטיות).
 *  4. **תמיכה ב-attempt_failed** — אם דווח על "ניסיתי ונכשלתי", הטון
 *     הופך לאמפתי במקום חוגג.
 */

const CELEBRATION_SYSTEM_COMPLETED = buildAlmogNotifySystemPrompt(
  `המשתמש סימן ביצוע בפועל. אתה כותב פרגון חברי קצר (1–3 משפטים), חם וספציפי.

המבנה הקסום (לפי הסדר):
  שורה 1: פרגון נלהב עם שם וסלנג ("דניאל יתותחחח!! 🔥", "וואלה דניאל!! 💪", "אחיייי דניאל"). השם יכול להיות מסולסל.
  שורה 2: משפט פסיכולוגי-מנטלי קצר על *מה הרגע הזה מייצר אצלך* — אמינות עצמית, זהות, מומנטום, רצף, נוירופלסטיות. דוגמאות: "כל פעם שאתה מסמן את זה — המוח לומד שאתה שומר את המילה לעצמך 💙", "זה הופך אותך לאדם של ההרגל הזה, לא מישהו שמנסה", "המומנטום הזה לא יפסיק, זה כדור שלג חיובי".
  שורה 3 (אופציונלי): אם יש streak / סלוט נוסף פתוח היום / יום מיוחד — הוסף שורה ספציפית. "4 ימים רצוף!!"  / "וגם בערב?" / "סגרת אותו לגמרי 🎯".

חוקים:
  - אסור "המערכת", "עדכנתי", "סימנתי", "ראיתי שעידכנת".
  - שם המשתמש בשורה הראשונה. אפשר עם סלסול.
  - אימוג'י 1–2, רגשי לא דקורטיבי. (🔥 = streak, 💪 = כוח, 💙 = רגש, 🎯 = סגירה).
  - אסור משפט פילוסופי ארוך — חבר בוואטסאפ, לא רב.
  - **השתמש בסטריק שאתה רואה בהקשר**. אם current_streak=4 → תאמר "4 ימים רצוף". אם 1 → "התחלת!". אל תמציא מספר.`
);

const CELEBRATION_SYSTEM_ATTEMPT_FAILED = buildAlmogNotifySystemPrompt(
  `המשתמש דיווח "ניסיתי ונכשלתי" — הוא ניסה ולא הסתדר. *לא חוגגים*, מקבלים בחום ומחזקים את עצם הניסיון.

המבנה (לפי הסדר):
  שורה 1: קבלה חמה — "אחיייי דניאל מקבל אותך 💙", "וואלה דניאל, ניסית — זה כבר משהו", "דניאלל אחי, חזק שאתה מדווח גם בלי הצלחה".
  שורה 2: משפט פסיכולוגי קצר על *הניסיון עצמו*. "מי שמודד עצמו רק בהצלחות מפסיק. מי שמודד גם ניסיונות — מתקדם", "הניסיון בנה לך עכשיו ניסיון — בפעם הבאה תדע אחרת", "המוח לומד גם מכישלון, לא רק מהצלחה".
  שורה 3 (אופציונלי): תזמין אותו בעדינות לנסות שוב — "מחר יש לנו עוד הזדמנות", "בלי לחץ, נראה איך הסלוט הבא". *לא* "תתאמץ יותר".

חוקים:
  - אסור "כל הכבוד שניסית" סטנדרטי. תכתוב כמו חבר אמיתי.
  - אסור "אל תוותר", "הכל בראש", "אתה תצליח". אלו תבניות ריקות.
  - אסור פילוסופיה ארוכה. 1–3 משפטים.
  - אימוג'י רך: 💙, 🤍, 🌱.`
);

type JourneyTaskJson = { id: string; title: string; description?: string | null; schedule?: string; times_per_day?: number; weekly_day?: number };

function parseTasks(raw: unknown): JourneyTaskJson[] {
  if (!Array.isArray(raw)) return [];
  const tasks: JourneyTaskJson[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id : '';
    const title = typeof row.title === 'string' ? row.title : '';
    if (!id || !title) continue;
    tasks.push({
      id,
      title,
      description: typeof row.description === 'string' ? row.description : null,
      schedule: typeof row.schedule === 'string' ? row.schedule : undefined,
      times_per_day: typeof row.times_per_day === 'number' ? row.times_per_day : undefined,
      weekly_day: typeof row.weekly_day === 'number' ? row.weekly_day : undefined,
    });
  }
  return tasks;
}

function stationTitleFromJoin(raw: unknown): string | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const t = raw[0] && typeof raw[0] === 'object' ? (raw[0] as { title?: string }).title : undefined;
    return typeof t === 'string' ? t : null;
  }
  if (typeof raw === 'object' && 'title' in raw) {
    const t = (raw as { title?: unknown }).title;
    return typeof t === 'string' ? t : null;
  }
  return null;
}

/**
 * Cooldown — מונע ספאם במקרה של double-click או רענון. שעון לפי `source`
 * (per_slot ↔ full_day) וגם לפי `task_id` כדי שכמה משימות באותו רגע יקבלו
 * חגיגה נפרדת.
 */
async function recentCelebrationExists(
  admin: SupabaseClient,
  userId: string,
  taskId: string,
  slot: string | null,
  windowMs: number
): Promise<boolean> {
  const since = new Date(Date.now() - windowMs).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await admin
    .from('notifications')
    .select('id, metadata, created_at')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(25);

  if (error || !Array.isArray(data)) return false;
  return data.some((row: { metadata?: unknown }) => {
    const m = row.metadata as Record<string, unknown> | null | undefined;
    if (m?.source !== 'task_completion_celebration') return false;
    if (m?.task_id !== taskId) return false;
    /** אם הוא חגג ספציפית את ה-slot הזה ב-90s אחרונים → דלג. */
    if (slot && m?.slot && m.slot !== slot) return false;
    return true;
  });
}

export type SendCelebrationOptions = {
  userId: string;
  stepId: string;
  taskId: string;
  /** סלוט ספציפי שזה עתה סומן (אם רלוונטי). undefined → חגיגה כללית. */
  slot?: JourneyTaskSlot | null;
  /** האם זה דיווח על "ניסיתי ונכשלתי". ברירת מחדל — completed. */
  outcome?: 'completed' | 'attempt_failed';
  /** האם הסלוט כבר היה מסומן (idempotent — חיזוק עדין, לא חגיגה מלאה). */
  wasAlreadyDone?: boolean;
};

/**
 * נוטיפיקציה מיידית אחרי סימון משימה/סלוט — טקסט מותאם ב-AI עם streak.
 */
export async function sendTaskCompletionCelebration(
  admin: SupabaseClient,
  userIdOrOptions: string | SendCelebrationOptions,
  stepIdLegacy?: string,
  taskIdLegacy?: string
): Promise<{ body: string; title?: string; skipped?: boolean }> {
  /**
   * תאימות לאחור: התומכים הישנים קראו ל-function עם (admin, userId, stepId, taskId).
   * הגרסה החדשה תומכת ב-options object שמאפשר slot + outcome.
   */
  const opts: SendCelebrationOptions =
    typeof userIdOrOptions === 'string'
      ? {
          userId: userIdOrOptions,
          stepId: stepIdLegacy ?? '',
          taskId: taskIdLegacy ?? '',
        }
      : userIdOrOptions;

  const { userId, stepId, taskId } = opts;
  const slot = opts.slot ?? null;
  const outcome = opts.outcome ?? 'completed';

  /** Cooldown של 60s פר-slot, 90s פר-task. */
  const cooldownMs = slot ? 60_000 : 90_000;
  if (await recentCelebrationExists(admin, userId, taskId, slot, cooldownMs)) {
    return { body: '', skipped: true };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: stepRow } = await admin
    .from('journey_steps')
    .select('title, step_number, tasks, journey_stations(title)')
    .eq('id', stepId)
    .maybeSingle();

  const step = stepRow as {
    title?: string | null;
    step_number?: number | null;
    tasks?: unknown;
    journey_stations?: unknown;
  } | null;

  const tasks = parseTasks(step?.tasks);
  const task = tasks.find((t) => t.id === taskId);
  const taskTitle = task?.title ?? 'משימה';
  const taskDescription = (task?.description ?? '').trim() || 'אין תיאור נוסף';

  const stepTitle = step?.title?.trim() || 'צעד במסע';
  const stepNum = typeof step?.step_number === 'number' ? step.step_number : null;
  const station = stationTitleFromJoin(step?.journey_stations);

  /**
   * חישוב סטריק *לפני* ה-AI. ה-LLM מקבל את current_streak כעובדה.
   * אם המשימה one_time → נדלג על הסטריק (לא רלוונטי).
   */
  const resolvedSched = task
    ? resolveTaskSchedule({
        schedule: task.schedule as JourneyTaskSchedule | undefined,
        times_per_day: typeof task.times_per_day === 'number' ? task.times_per_day : null,
        weekly_day: typeof task.weekly_day === 'number' ? task.weekly_day : null,
      })
    : null;

  const streak = resolvedSched && outcome === 'completed'
    ? await computeTaskStreak(admin, {
        userId,
        stepId,
        taskId,
        schedule: resolvedSched.schedule,
        timesPerDay: resolvedSched.times_per_day,
        weeklyDay: resolvedSched.weekly_day,
      })
    : null;

  const { firstName, genderInstruction } = await fetchNotifyUserProfile(admin, userId);

  /** בלוק קונטקסט קומפקטי ל-LLM — כולל סטריק + מצב סלוטים היום. */
  const contextLines: string[] = [
    `שם המשימה: ${taskTitle}`,
    `תיאור: ${taskDescription}`,
    `צעד: ${stepTitle}${stepNum != null ? ` (#${stepNum})` : ''}`,
  ];
  if (station) contextLines.push(`תחנה: ${station}`);

  if (slot) {
    contextLines.push(
      `סלוט שסומן עכשיו: ${slotLabelHe(slot)}`
    );
  }

  if (streak && resolvedSched && resolvedSched.schedule !== 'one_time') {
    contextLines.push(`*** סטריק (חשוב מאוד) ***`);
    contextLines.push(`current_streak: ${streak.currentStreak} (${streakLabelHe(streak)})`);
    contextLines.push(`best_streak: ${streak.bestStreak}`);
    contextLines.push(`total_completed_days: ${streak.totalCompletedDays}`);
    contextLines.push(
      `today: ${streak.todayActive ? 'יום סגור לגמרי (כל הסלוטים הושלמו) — חגוג זה' : `עוד ${streak.todayPendingSlots.length} סלוט/ים פתוחים היום (${streak.todayPendingSlots.map((s) => slotLabelHe(s)).join(', ')})`}`
    );
    if (streak.currentStreak >= 3) {
      contextLines.push(`🔥 הזכר את הסטריק בפועל בהודעה — זה רגע ניצחון.`);
    }
  }

  if (opts.wasAlreadyDone) {
    contextLines.push(`(הערה: הסלוט הזה כבר היה מסומן — חיזוק עדין, לא הודעה כפולה.)`);
  }

  const systemPrompt =
    outcome === 'attempt_failed' ? CELEBRATION_SYSTEM_ATTEMPT_FAILED : CELEBRATION_SYSTEM_COMPLETED;

  const body = await completeEmpathyNotifyBody({
    label: outcome === 'attempt_failed' ? 'task_attempt_support' : 'task_completion_celebration',
    temperature: 0.75,
    maxTokens: ALMOG_NOTIFY_MAX_OUTPUT_TOKENS,
    messages: [
      { role: 'system', content: `${systemPrompt}\n\nקונטקסט:\n${contextLines.join('\n')}` },
      {
        role: 'user',
        content: `פרטי פנייה:
- שם פרטי: ${firstName}
- ${genderInstruction}

כתוב רק את גוף ההודעה. אלמוג בגוף ראשון זכר על עצמו.`,
      },
    ],
  });

  /** טייטל דינמי לפי outcome + streak. */
  const titleEmoji = outcome === 'attempt_failed' ? '💙' : streak && streak.currentStreak >= 3 ? '🔥' : '✨';
  const titlePrefix =
    outcome === 'attempt_failed'
      ? `${firstName}, אני איתך`
      : streak && streak.currentStreak >= 4
        ? `${firstName} אש 🔥`
        : `יופי, ${firstName}!`;
  const title = `${titlePrefix} · מאלמוג ${titleEmoji}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await admin.from('notifications').insert({
    user_id: userId,
    type: 'ai_message',
    title,
    body,
    icon_emoji: outcome === 'attempt_failed' ? '💙' : '✨',
    action_url: '/journey',
    is_read: false,
    is_sent: false,
    send_at: new Date().toISOString(),
    metadata: {
      source: 'task_completion_celebration',
      task_id: taskId,
      step_id: stepId,
      ...(slot ? { slot } : {}),
      outcome,
      ...(streak
        ? {
            streak_current: streak.currentStreak,
            streak_best: streak.bestStreak,
            today_active: streak.todayActive,
          }
        : {}),
      model: AI_MODELS.empathy,
      recipient_first_name: firstName,
      mentor: 'almog',
    },
  });

  if (error) throw new Error(error.message);

  return { body, title };
}
