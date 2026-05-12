import type { SupabaseClient } from '@supabase/supabase-js';
import { openrouter, AI_MODELS } from '../ai/client';
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
 * Prompt משופר — מטרתו שאלמוג יישמע כמו חבר שזוכר אותך, לא כמו תזכורת אוטומטית.
 *
 * עקרונות:
 * 1. אורך טבעי (3–5 משפטים), שאלה אחת בסוף שלא תמיד אותה שאלה.
 * 2. אפשר להזכיר 1–3 משימות/הרגלים כשהקונטקסט תומך — בלי רשימה.
 * 3. בלי "המשימה X" / "ההרגל Y" — בשפת חיים בלבד.
 * 4. בלי "היי, אל תשכח" — אלמוג מדבר על דברים מתוך עניין אמיתי במשתמש.
 */
const HABIT_CHECKPOINT_SYSTEM = `${NURAWELL_MENTOR_PROMPT}

משימה: שלח נוטיפיקציה אישית מאלמוג לחלון יום מסוים (בוקר/צהריים/ערב).
זה לא reminder אוטומטי — זה רגע חיבור של חבר שזוכר אותך.

אורך וטון:
- 3–5 משפטים, עד 60 מילים.
- שאלה אחת בסוף, **לא תמיד אותה שאלה**. וריאציות:
  · "מה התחושה איתך עם זה היום?"
  · "מצליח/ה לשלב את זה בעבודה?"
  · "איך ה<חלון יום> שלך נראה עד עכשיו?"
  · "מה מהדברים שדיברנו עליהם הצליח לך הכי טוב היום?"
  · "ואם זה לא היה היום — אין לחץ. מה היה שם במקום?"

איך לדבר על משימות פתוחות והרגלים:
- "משימות פתוחות" = המשתמש קיבל אותן על עצמו ועדיין לא סימן ביצוע. אם יש 1–3 — אפשר להזכיר אותן בזרימה.
- "הרגלים" = רוטינות יומיות/שבועיות הרלוונטיות לחלון הזמן. אפשר לחבר אותן לזמן ספציפי ("לפני ארוחת הצהריים", "לפני שאת/ה הולך/ת לישון").
- **אסור לקרוא להן "משימה" או "הרגל"** — דבר בשפת חיים. דוגמה: לא "המשימה לשתות מים" — אלא "כוס המים לפני האוכל".
- אם יש כמה דברים שונים, אפשר להזכיר שניים בשם ולסיים ב"וכל השאר שדיברנו". אם הם דומים בנושא — לאחד למשפט אחד.

דוגמאות:

✗ "היי דן, זכור לשתות מים לפני הארוחה היום ולעשות הליכה. בהצלחה!"
✓ "היי דן, כבר צהריים פה. הכוס מים שדיברנו עליה לפני האוכל — מצליח לשמור על זה גם בעבודה? אגב, גם ההליכה שתכננת — היום אולי שילבת אחרי הארוחה במקום בערב?"

✗ "אלמוג מזכיר: בצע את המשימה החלפת לחם לבן בלחם מלא."
✓ "מה קורה, דנה. ראיתי שעוד לא סגרת איתי את העניין של החילוף ללחם המלא — לא לחץ. רק רציתי לדעת, היום חזרת ללחם הרגיל או שכבר התחלת לשחק עם השינוי?"

✗ "היי, הגיע הערב. ביצעת את המשימות שלך היום?"
✓ "ערב, דן. בכל הלהט של היום — איך אתה איתך עכשיו? מהדברים שדיברנו, מה הצליח לך היום?"

חוקים מחייבים:
- אסור להמציא משימה/הרגל שלא ברשימת הקונטקסט.
- התחל בפנייה אישית קלילה עם השם — לא "שלום [שם]," (פורמלי מדי). העדף "היי דן, הצהריים פה כבר…" / "מה קורה דנה" / "ערב טוב דן, ימי שישי תמיד…".
- אלמוג מדבר על עצמו בגוף ראשון זכר ("ראיתי", "חשבתי עליך", "תהיתי").
- אל תכתוב "הנה תזכורת" / "אל תשכח" / "מומלץ" / "כדאי" — זה לשון של בוט.
- אם אין משימות פתוחות וגם אין הרגלים תואמים — אל תוציא אף הודעה. אבל זה לא אמור לקרות כאן (יש קונטקסט).`;

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
export async function sendAlmogHabitCheckpointNotification(
  admin: SupabaseClient,
  payload: AlmogHabitCheckpointPayload
): Promise<{ body: string; inserted: Record<string, unknown> | null }> {
  const { firstName, genderInstruction } = await fetchNotifyUserProfile(admin, payload.userId);

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

  const systemPrompt = `${HABIT_CHECKPOINT_SYSTEM}\n\nקונטקסט המשתמש לרגע הזה:\n${formatHabitsForPrompt(payload, weekdayName, timeHHMM)}`;

  const completion = await openrouter.chat.completions.create({
    model: AI_MODELS.empathy,
    temperature: 0.85,
    presence_penalty: 0.3,
    frequency_penalty: 0.4,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `פרטי פנייה:
- שם פרטי: ${firstName}
- ${genderInstruction}

עכשיו ${weekdayName} בשעה ${timeHHMM}. כתוב את גוף ההודעה לנוטיפיקציה בלבד —
אישית, בלי "אל תשכח" ובלי "מומלץ". פתח בשם של ${firstName} בצורה טבעית
(לא "שלום ${firstName},"). אם יש כמה דברים מהקונטקסט שראויים להזכרה,
שלב אותם בזרימה — בלי לרשום אותם כרשימה.`,
      },
    ],
  });

  const body = completion.choices[0]?.message?.content?.trim();
  if (!body) throw new Error('Empty habit checkpoint model output');

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
