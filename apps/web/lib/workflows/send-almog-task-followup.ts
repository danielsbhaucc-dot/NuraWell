import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_MODELS } from '../ai/client';
import { completeEmpathyNotifyBody } from '../ai/empathy-notify-completion';
import { fetchNotifyUserProfile } from '../ai/notify-user-profile';
import { NURAWELL_MENTOR_PROMPT } from '../ai/prompts';
import type { AlmogFollowupUserState } from './almog-followup-state';

const TASK_FOLLOWUP_SYSTEM = `${NURAWELL_MENTOR_PROMPT}

משימה: תזכורת פרואקטיבית — המשתמש בחר במשימה (מקובל) אך לפי המערכת עדיין לא דיווח שביצע אותה אחרי הזמן שנקבע.
כתוב טקסט לנוטיפיקציה בלבד: 2–3 משפטים, עד 50 מילים, בלי כותרת כללית מעלפה, בלי הטפה, בלי "התגעגענו".
התחל בפנייה אישית לפי השם והמגדר שסופקו בהנחיות המשתמש — פעם אחת, טבעי.
השתמש בקונטקסט שסופק (תחנה, צעד, משימה, הרגלים) — אל תמציא משימות או הרגלים שלא הופיעו.`;

function formatStateForPrompt(state: AlmogFollowupUserState, taskId: string): string {
  const lines: string[] = [
    `מזהה משימה במערכת: ${taskId}`,
    `כותרת המשימה (אם ידוע): ${state.taskStepTitle ?? 'לא זוהה'}`,
    `תחנת המשימה: ${state.taskStationTitle ?? 'לא ידוע'}`,
    `תחנה נוכחית במסע (עדכון אחרון): ${state.currentStationTitle ?? 'לא ידוע'}`,
    `צעד נוכחי: ${state.currentStepTitle ?? 'לא ידוע'} (#${state.currentStepNumber ?? '?'})`,
    `הרגלים פעילים בצעד הנוכחי: ${state.activeHabits.map((h) => h.title).join('; ') || 'אין'}`,
    `הרגלים מ"צעדים שהושלמו" (שורשים): ${state.ingrainedHabits.map((h) => `${h.title} (מ${h.fromStepTitle})`).join('; ') || 'אין'}`,
  ];
  return lines.join('\n');
}

/**
 * יוצר טקסט עם OpenRouter ושומר נוטיפיקציה (service role).
 */
export async function sendAlmogTaskFollowupNotification(
  admin: SupabaseClient,
  userId: string,
  taskId: string,
  state: AlmogFollowupUserState
): Promise<{ body: string }> {
  const { firstName, genderInstruction } = await fetchNotifyUserProfile(admin, userId);

  const systemPrompt = `${TASK_FOLLOWUP_SYSTEM}\n\nקונטקסט מערכת:\n${formatStateForPrompt(state, taskId)}`;

  const body = await completeEmpathyNotifyBody({
    label: 'task_followup',
    temperature: 0.65,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `פרטי פנייה למשתמש:
- שם פרטי לשימוש בהודעה: ${firstName}
- ${genderInstruction}

כתוב את גוף ההודעה לנוטיפיקציה בלבד. עברית טבעית. אלמוג מדבר בגוף ראשון זכר על עצמו.`,
      },
    ],
  });

  const title = `היי ${firstName} · מאלמוג`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).from('notifications').insert({
    user_id: userId,
    type: 'ai_message',
    title,
    body,
    icon_emoji: '🌿',
    action_url: '/journey',
    is_read: false,
    is_sent: false,
    send_at: new Date().toISOString(),
    metadata: {
      source: 'almog_followup_workflow',
      task_id: taskId,
      model: AI_MODELS.empathy,
      recipient_first_name: firstName,
    },
  });

  if (error) throw new Error(error.message);
  return { body };
}
