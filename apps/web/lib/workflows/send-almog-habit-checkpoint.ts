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

const HABIT_CHECKPOINT_SYSTEM = `${NURAWELL_MENTOR_PROMPT}

משימה: שליחת תזכורת מעודדת קצרה — נוטיפיקציה חד־פעמית לחלון היום (בוקר/צהריים/ערב).
כתוב טקסט לנוטיפיקציה בלבד: 2–3 משפטים, עד 45 מילים. שאלה אחת חמה, לא חקירה, לא רשימת משימות.

מקור התוכן:
- אם יש "משימות פתוחות" (המשתמש קיבל אותן על עצמו ועדיין לא דיווח על ביצוע) — תן להן עדיפות. שאל ברוך אם התקדם עם משימה אחת מהן, או הזכר אותה בעדינות.
- אם יש "הרגלים" — אפשר להזכיר רוטינה אחת רלוונטית לחלון הזמן.
- אם יש גם וגם — מתמקדים במשימה הפתוחה הראשונה ומשלימים בתחושה רכה לגבי הרגל אחד.

התייחס רק למשימות/הרגלים שמופיעים ברשימה; אל תמציא משימה חדשה.
התחל בפנייה אישית לפי השם והמגדר שסופקו — פעם אחת, טבעי. אלמוג מדבר בגוף ראשון זכר על עצמו.`;

function formatHabitsForPrompt(payload: AlmogHabitCheckpointPayload): string {
  const habitLines = payload.habits.map(
    (h) =>
      `- ${h.title} (${h.frequency === 'per_meal' ? 'לפני ארוחות' : h.frequency === 'daily' ? 'יומי' : 'שבועי'})`
  );
  const taskLines = payload.pendingTasks.map(
    (t) => `- ${t.title}${t.stepTitle ? ` (מתוך הצעד: ${t.stepTitle})` : ''}`
  );

  const parts: string[] = [`חלון זמן: ${SLOT_HE[payload.slot]}`];

  if (taskLines.length > 0) {
    parts.push('משימות פתוחות (התקבלו ועדיין לא דווחו כבוצעו):');
    parts.push(taskLines.join('\n'));
  } else {
    parts.push('משימות פתוחות: אין כרגע — המשתמש סגר את כל מה שקיבל על עצמו.');
  }

  if (habitLines.length > 0) {
    parts.push('הרגלים שמתאימים לחלון הזה:');
    parts.push(habitLines.join('\n'));
  } else {
    parts.push('הרגלים: אין רוטינה תואמת לחלון הזה.');
  }

  parts.push(`צעד: ${payload.stepTitle ?? 'לא ידוע'} · תחנה: ${payload.stationTitle ?? 'לא ידוע'}`);

  return parts.join('\n');
}

/**
 * הודעת AI אחת לכל חלון — חוסך טוקן לעומת בדיקה נפרדת לכל הרגל.
 */
export async function sendAlmogHabitCheckpointNotification(
  admin: SupabaseClient,
  payload: AlmogHabitCheckpointPayload
): Promise<{ body: string }> {
  const { firstName, genderInstruction } = await fetchNotifyUserProfile(admin, payload.userId);

  const systemPrompt = `${HABIT_CHECKPOINT_SYSTEM}\n\nקונטקסט:\n${formatHabitsForPrompt(payload)}`;

  const completion = await openrouter.chat.completions.create({
    model: AI_MODELS.empathy,
    temperature: 0.55,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `פרטי פנייה:
- שם פרטי: ${firstName}
- ${genderInstruction}

כתוב את גוף ההודעה לנוטיפיקציה בלבד. עברית טבעית. אלמוג מדבר בגוף ראשון זכר על עצמו.`,
      },
    ],
  });

  const body = completion.choices[0]?.message?.content?.trim();
  if (!body) throw new Error('Empty habit checkpoint model output');

  const title = `היי ${firstName} · מאלמוג`;

  const habitIds = payload.habits.map((h) => h.id);
  const pendingTaskIds = payload.pendingTasks.map((t) => t.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).from('notifications').insert({
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
  });

  if (error) throw new Error(error.message);
  return { body };
}
