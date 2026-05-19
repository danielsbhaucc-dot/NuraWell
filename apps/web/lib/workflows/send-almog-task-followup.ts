import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_MODELS } from '../ai/client';
import {
  fetchTodayAlmogTouches,
  formatTodayTouchesCooldownBlock,
} from '../ai/almog-notify-day-context';
import { completeEmpathyNotifyBody } from '../ai/empathy-notify-completion';
import { fetchNotifyUserProfile } from '../ai/notify-user-profile';
import { buildCoachingStylePromptBlock } from '../ai/almog-coaching-style';
import type { AiUserContext } from '../ai/memory';
import { ALMOG_NOTIFY_SHARED_RULES, NURAWELL_MENTOR_PROMPT } from '../ai/prompts';
import type { AlmogFollowupUserState } from './almog-followup-state';
import { habitSlotFromCheckInTime } from './personalized-check-in-journey';

const TASK_FOLLOWUP_SYSTEM = `${NURAWELL_MENTOR_PROMPT}

${ALMOG_NOTIFY_SHARED_RULES}

משימה: מגע אחרי זמן — check-in חברי, לא מעקב ביצוע.
- "מה קורה?" / "מה חוסם?" — לא "עדיין לא סימנת" / "ראיתי שלא".
- 2–3 משפטים קצרים, שאלה פתוחה בסוף. השתמש רק בקונטקסט שסופק.`;

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
  const slot = habitSlotFromCheckInTime(
    new Date().toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Jerusalem',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  );

  const [{ firstName, genderInstruction }, styleBlock, todayTouches] = await Promise.all([
    fetchNotifyUserProfile(admin, userId),
    fetchCoachingStyle(admin, userId),
    fetchTodayAlmogTouches(admin, userId),
  ]);

  const cooldownBlock = formatTodayTouchesCooldownBlock(todayTouches, slot);

  const systemPrompt = `${TASK_FOLLOWUP_SYSTEM}\n\n${styleBlock}${
    cooldownBlock ? `\n\n${cooldownBlock}` : ''
  }\n\nקונטקסט מערכת:\n${formatStateForPrompt(state, taskId)}`;

  const body = await completeEmpathyNotifyBody({
    label: 'task_followup',
    temperature: 0.78,
    presencePenalty: 0.45,
    frequencyPenalty: 0.5,
    maxTokens: 320,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `פרטי פנייה למשתמש:
- שם פרטי לשימוש בהודעה: ${firstName}
- ${genderInstruction}

כתוב את גוף ההודעה לנוטיפיקציה בלבד — 2–3 משפטים, שאלה פתוחה בסוף. עברית טבעית.`,
      },
    ],
  });

  const title = `${firstName} · מאלמוג`;

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

async function fetchCoachingStyle(admin: SupabaseClient, userId: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .from('profiles')
    .select('ai_context')
    .eq('id', userId)
    .maybeSingle();
  const ctx = (data as { ai_context?: AiUserContext | null } | null)?.ai_context ?? null;
  return buildCoachingStylePromptBlock(ctx);
}
