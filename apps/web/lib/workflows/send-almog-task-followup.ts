import type { SupabaseClient } from '@supabase/supabase-js';
import { openrouter, AI_MODELS } from '../ai/client';
import { NURAWELL_MENTOR_PROMPT } from '../ai/prompts';
import type { AlmogFollowupUserState } from './almog-followup-state';

const TASK_FOLLOWUP_SYSTEM = `${NURAWELL_MENTOR_PROMPT}

משימה: תזכורת פרואקטיבית — המשתמש בחר במשימה (מקובל) אך לפי המערכת עדיין לא דיווח שביצע אותה אחרי הזמן שנקבע.
כתוב טקסט לנוטיפיקציה בלבד: 2–3 משפטים, עד 50 מילים, בלי כותרת כללית מעלפה, בלי הטפה, בלי "התגעגענו".
התחל בפנייה אישית לפי השם והמגדר שסופקו בהנחיות המשתמש — פעם אחת, טבעי.
השתמש בקונטקסט שסופק (תחנה, צעד, משימה, הרגלים) — אל תמציא משימות או הרגלים שלא הופיעו.`;

async function fetchNotifyUserProfile(
  admin: SupabaseClient,
  userId: string
): Promise<{ firstName: string; genderInstruction: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .from('profiles')
    .select('full_name, gender')
    .eq('id', userId)
    .maybeSingle();

  const row = (data ?? null) as { full_name?: string | null; gender?: string | null } | null;
  const full = (row?.full_name ?? '').trim();
  const firstName = full.split(/\s+/)[0]?.trim() || 'שם';

  const g = row?.gender;
  let genderInstruction =
    'מגדר לא ידוע — פנייה ניטרלית כשאפשר (למשל שם פרטי בלי לשון זכר/נקבה כפויה).';
  if (g === 'female') {
    genderInstruction =
      'המשתמשת נקבה — פנה בלשון נקבה (את, שלך, איתך, מוכנה) במשפט אחד–שניים.';
  } else if (g === 'male') {
    genderInstruction = 'המשתמש זכר — פנה בלשון זכר (אתה, שלך, איתך, מוכן) במשפט אחד–שניים.';
  } else if (g === 'other' || g === 'prefer_not_to_say') {
    genderInstruction =
      'מגדר לא מצוין או "אחר" — פנייה ניטרלית וחמה; העדף שם פרטי בלי לשון מוטה.';
  }

  return { firstName, genderInstruction };
}

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

  const completion = await openrouter.chat.completions.create({
    model: AI_MODELS.empathy,
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

  const body = completion.choices[0]?.message?.content?.trim();
  if (!body) throw new Error('Empty follow-up model output');

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
