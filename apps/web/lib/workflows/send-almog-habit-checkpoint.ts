import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_MODELS } from '../ai/client';
import { completeEmpathyNotifyBody } from '../ai/empathy-notify-completion';
import { fetchNotifyUserProfile } from '../ai/notify-user-profile';
import { NURAWELL_MENTOR_PROMPT } from '../ai/prompts';
import type { AlmogHabitCheckpointPayload, HabitCheckpointSlot } from './almog-habit-checkpoint-payload';

const SLOT_HE: Record<HabitCheckpointSlot, string> = {
  morning: 'בוקר',
  midday: 'צהריים',
  evening: 'ערב',
};

const WEEKDAY_HE = [
  'יום ראשון',
  'יום שני',
  'יום שלישי',
  'יום רביעי',
  'יום חמישי',
  'יום שישי',
  'שבת',
];

/**
 * Prompt משופר — מטרתו שאלמוג ייתן **תובנות**, לא עובדות.
 *
 * עקרונות:
 * 1. תובנה אחת קטנה שמחברת בין ההרגל/המשימה לתחושה אנושית — לא נתון מדעי.
 * 2. דירבון בכיף — לא דחיפה מתוסכלת.
 * 3. אורך מאוזן (3–5 משפטים) שמרגיש קצר אבל מספיק עמוק.
 * 4. ניקוז שונות בלי לחזור על ההודעה הקודמת שאלמוג שלח באותו slot.
 */
const HABIT_CHECKPOINT_SYSTEM = `${NURAWELL_MENTOR_PROMPT}

משימה: שלח נוטיפיקציה מאלמוג לחלון יום (בוקר/צהריים/ערב). זה לא reminder — זה רגע של חיבור.

עיקרון מרכזי — תובנות, לא עובדות:
- אסור לזרוק נתון מדעי ("מים מפחיתים תיאבון ב-22%"). זה חינוך, לא קשר.
- כן: תובנה קטנה שמחברת בין ההרגל/המשימה לחיים האמיתיים של המשתמש.
- תובנה = איך זה מרגיש או מה זה נותן ברגע. לא מה זה עושה לגוף.
- אם אין לך תובנה אמיתית — אל תכתוב משפט תובנה. עדיף בלי.

דוגמאות לתובנה (✓ vs עובדה ✗):
✗ "מים לפני האוכל מורידים תיאבון ועוזרים לעיכול."
✓ "כוס המים לפני האוכל זה לא קסם — היא בעיקר נותנת לך 30 שניות לפני שהראש קופץ למסקנות."

✗ "הליכה אחרי ארוחה מסייעת לשרוף קלוריות וחיונית לבריאות."
✓ "ההליכה אחרי הארוחה לא קשורה ל'לשרוף'. היא נותנת למוח שלוש דקות לפני שהוא קופץ למסכים."

✗ "החלפת לחם לבן בלחם מלא משפרת את האיזון הגליקמי."
✓ "המעבר ללחם מלא — זה לא טעם של 'בריא'. זה רק להרגיל את הראש שמשהו אחר יכול להיות בצלחת."

דירבון בכיף — לא מסכנות, לא דחיפה:
✗ "חבל לפספס היום, התחלת כל כך יפה."
✓ "אם הוא יקרה היום — מצוין. אם לא — מחר לא נעלם."

✗ "תזכור שאתה ב-NuraWell בשביל לעצב את חייך מחדש!"
✓ "אין דרמה אם זה לא קרה — היום הוא יום אחד מתוך הרבה."

איך לדבר על משימות פתוחות והרגלים (1–3 שילובים בזרימה):
- "משימות פתוחות" = המשתמש קיבל אותן ועדיין לא סימן ביצוע. אם יש 1–3 — אפשר להזכיר אותן בזרימה טבעית.
- "רוטינות" = הרגלים יומיים/שבועיים. אפשר לחבר לזמן ("לפני ארוחת הצהריים").
- **אסור** לקרוא להן "משימה" / "הרגל" בטקסט — דבר בשפת חיים. דוגמה: לא "המשימה לשתות מים" — "כוס המים לפני האוכל".
- כשיש כמה דברים שונים: שניים בשם + "וכל השאר שדיברנו". כשהם דומים בנושא: לאחד למשפט אחד.

מבנה מומלץ (לא נוקשה — שונה כל פעם):
1. פתיחה אישית עם השם (לא "שלום ${'$'}{שם}," — טבעי כמו "היי דן, צהריים פה כבר…").
2. הזכרה של 1–3 דברים מהקונטקסט.
3. תובנה קטנה (לא תמיד! רק כשיש לה מקום).
4. שאלה חמה — לא תמיד אותה. וריאציות:
   · "מה התחושה איתך עם זה?"
   · "מצליח/ה לשלב בעבודה/בקצב?"
   · "מה מהדברים שדיברנו עליהם הצליח לך היום?"
   · "ואם לא היום — אין לחץ. מה היה שם במקום?"
   · "איך הראש שלך עכשיו?"

חוקים מחייבים:
- אסור להמציא דבר שלא ברשימה.
- אסור: "אל תשכח" / "מומלץ" / "כדאי" / "הנה תזכורת" / "חשוב לזכור" / "המסע שלך".
- אלמוג מדבר על עצמו בגוף ראשון זכר ("ראיתי", "חשבתי עליך").
- אורך: 3–5 משפטים, עד 65 מילים. שאלה אחת לסיום.

אם בקונטקסט יש "ההודעה האחרונה ששלחתי" — אל תחזור עליה. שנה זווית (מהרגל למשימה, מתובנה לחיבור רגשי, מבוקר לערב). חיוני שיורגש שכל הודעה חדשה.`;

function dedupeByTitle<T extends { title: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const k = it.title.trim().toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

function formatHabitsForPrompt(
  payload: AlmogHabitCheckpointPayload,
  weekdayName: string,
  timeHHMM: string
): string {
  const habits = dedupeByTitle(payload.habits);
  const tasks = dedupeByTitle(payload.pendingTasks);

  const habitLines = habits.map(
    (h) =>
      `- ${h.title} (${h.frequency === 'per_meal' ? 'מסביב לארוחות' : h.frequency === 'daily' ? 'יומי' : 'שבועי'})`
  );
  const taskLines = tasks.map(
    (t) => `- ${t.title}${t.stepTitle ? ` (מהצעד "${t.stepTitle}")` : ''}`
  );

  const parts: string[] = [
    `חלון יום: ${SLOT_HE[payload.slot]}`,
    `${weekdayName} · השעה ${timeHHMM} בישראל`,
  ];

  if (taskLines.length > 0) {
    parts.push(
      `\nמשימות שהמשתמש קיבל על עצמו ועדיין לא דיווח על ביצוע (${taskLines.length}):`
    );
    parts.push(taskLines.join('\n'));
    parts.push(
      taskLines.length === 1
        ? 'יש משימה אחת בלבד — אפשר להתמקד בה.'
        : taskLines.length <= 3
          ? 'אפשר להזכיר את כולן או חלקן בזרימה טבעית.'
          : `יש ${taskLines.length} משימות. בחר את 1–3 שנראות לך הכי רלוונטיות לחלון הזמן והזכר אותן.`
    );
  } else {
    parts.push('\nמשימות פתוחות: אין — המשתמש סגר את כל מה שקיבל על עצמו.');
  }

  if (habitLines.length > 0) {
    parts.push(`\nרוטינות מהמסע שמתאימות לחלון הזה (${habitLines.length}):`);
    parts.push(habitLines.join('\n'));
  } else {
    parts.push('\nרוטינות: אין רוטינה תואמת לחלון הזה.');
  }

  parts.push(
    `\nאיפה המשתמש במסע: צעד "${payload.stepTitle ?? 'לא ידוע'}" בתחנה "${payload.stationTitle ?? 'לא ידוע'}"`
  );

  return parts.join('\n');
}

/**
 * הודעת AI אחת לכל חלון — חוסך טוקן לעומת בדיקה נפרדת לכל הרגל.
 */
/**
 * שליפת ההודעה האחרונה ש-Almog שלח למשתמש מסוג habit-checkpoint
 * (ב-7 הימים האחרונים). מטרתה למנוע חזרה — לא רוב הקונטקסט.
 * עלות: ~100 טוקנים בלבד.
 */
async function fetchLastCheckpointBody(
  admin: SupabaseClient,
  userId: string
): Promise<string | null> {
  const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .from('notifications')
    .select('body, metadata, created_at')
    .eq('user_id', userId)
    .eq('type', 'ai_message')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(5);

  if (!Array.isArray(data) || data.length === 0) return null;

  for (const row of data) {
    const m = (row.metadata ?? null) as { source?: string } | null;
    if (m?.source === 'almog_habit_checkpoint' && typeof row.body === 'string') {
      return row.body.trim();
    }
  }
  return null;
}

export async function sendAlmogHabitCheckpointNotification(
  admin: SupabaseClient,
  payload: AlmogHabitCheckpointPayload
): Promise<{ body: string; inserted: Record<string, unknown> | null }> {
  const [{ firstName, genderInstruction }, lastBody] = await Promise.all([
    fetchNotifyUserProfile(admin, payload.userId),
    fetchLastCheckpointBody(admin, payload.userId),
  ]);

  /**
   * זמן + יום בשבוע ב-Asia/Jerusalem — חשוב כדי שאלמוג ידע אם זה שישי אחה"צ
   * (תחושה אחרת לגמרי מאשר יום שני בבוקר) ולא יוציא תזכורת כללית.
   */
  const ilFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const ilParts = ilFormatter.formatToParts(new Date());
  const hour = ilParts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = ilParts.find((p) => p.type === 'minute')?.value ?? '00';
  const timeHHMM = `${hour}:${minute}`;
  const ilDow = new Date().toLocaleDateString('en-US', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'short',
  });
  const dowMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekdayName = WEEKDAY_HE[dowMap[ilDow] ?? 0];

  const contextParts: string[] = [formatHabitsForPrompt(payload, weekdayName, timeHHMM)];
  if (lastBody) {
    /** קיצוץ כדי לא לבזבז טוקנים — 200 תווים מספיקים כדי לתפוס את הזווית */
    const trimmed = lastBody.slice(0, 200);
    contextParts.push(
      `\nההודעה האחרונה ששלחתי לאותו משתמש (אל תחזור על זווית/נושא/שאלה זהים):\n"${trimmed}${lastBody.length > 200 ? '…' : ''}"`
    );
  }

  const systemPrompt = `${HABIT_CHECKPOINT_SYSTEM}\n\nקונטקסט המשתמש לרגע הזה:\n${contextParts.join('\n')}`;

  const body = await completeEmpathyNotifyBody({
    label: 'habit_checkpoint',
    temperature: 0.85,
    presencePenalty: 0.4,
    frequencyPenalty: 0.45,
    maxTokens: 640,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `פרטי פנייה:
- שם פרטי: ${firstName}
- ${genderInstruction}

עכשיו ${weekdayName} בשעה ${timeHHMM}. כתוב את גוף ההודעה לנוטיפיקציה בלבד —
אישית, בלי "אל תשכח" ובלי "מומלץ", תובנה במקום עובדה. אם יש לי הודעה
קודמת בקונטקסט — אל תחזור על הזווית שלה.`,
      },
    ],
  });

  const title = `היי ${firstName} · מאלמוג`;

  const habitIds = payload.habits.map((h) => h.id);
  const pendingTaskIds = payload.pendingTasks.map((t) => t.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error } = await (admin as any)
    .from('notifications')
    .insert({
      user_id: payload.userId,
      type: 'ai_message',
      title,
      body,
      icon_emoji: '🌿',
      action_url: '/journey',
      is_read: false,
      is_sent: false,
      send_at: new Date().toISOString(),
      metadata: {
        source: 'almog_habit_checkpoint',
        slot: payload.slot,
        checkpoint_date: payload.checkpointDate,
        habit_ids: habitIds,
        pending_task_ids: pendingTaskIds,
        model: AI_MODELS.empathy,
        recipient_first_name: firstName,
      },
    })
    .select('id, user_id, type, title, archived_at, is_read, is_sent, created_at')
    .single();

  if (error) throw new Error(error.message);
  return { body, inserted: inserted as Record<string, unknown> | null };
}
