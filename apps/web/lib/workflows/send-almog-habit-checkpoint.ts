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

משימה: בדיקת הרגל קצרה — נוטיפיקציה חד־פעמית לחלון היום (בוקר/צהריים/ערב ייפרט בקונטקסט).
כתוב טקסט לנוטיפיקציה בלבד: 2–3 משפטים, עד 45 מילים. שאלה אחת חמה, לא חקירה, לא רשימת משימות.
התייחס רק להרגלים שמופיעים ברשימה; אל תמציא.
התחל בפנייה אישית לפי השם והמגדר שסופקו — פעם אחת, טבעי.`;

function formatHabitsForPrompt(payload: AlmogHabitCheckpointPayload): string {
  const lines = payload.habits.map(
    (h) => `- ${h.title} (${h.frequency === 'per_meal' ? 'לפני ארוחות' : h.frequency === 'daily' ? 'יומי' : 'שבועי'})`
  );
  return [
    `חלון זמן: ${SLOT_HE[payload.slot]}`,
    `הרגלים לבדיקה:`,
    lines.join('\n'),
    `צעד: ${payload.stepTitle ?? 'לא ידוע'} · תחנה: ${payload.stationTitle ?? 'לא ידוע'}`,
  ].join('\n');
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
      model: AI_MODELS.empathy,
      recipient_first_name: firstName,
    },
  });

  if (error) throw new Error(error.message);
  return { body };
}
