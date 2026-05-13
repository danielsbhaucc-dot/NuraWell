import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_MODELS } from './client';
import { completeEmpathyNotifyBody } from './empathy-notify-completion';
import { fetchNotifyUserProfile } from './notify-user-profile';
import { NURAWELL_MENTOR_PROMPT } from './prompts';

const CELEBRATION_SYSTEM = `${NURAWELL_MENTOR_PROMPT}

משימה: המשתמש דיווח עכשיו במערכת שסיים לבצע משימה שקיבל במסע (סימן V על ביצוע).
כתוב הודעת נוטיפיקציה קצרה בלבד (2–4 משפטים, עד 65 מילים):
- חגיגה אמיתית אבל לא מוגזמת; בלי "מדהים על הכל" גנרי.
- התאם את עוצמת הרגש והטון לפי **מה שנשמע מניסוח המשימה**: צעד קטן/פשוט → הכרה חמה וקלילה; משימה שנשמעת דורשת עקביות, אנרגיה, או שינוי הרגל → הוקרה עמוקה יותר, אפשר לנרמל אם זה נשמע מאתגר.
- אם המשימה נשמעת טכנית/יומיומית — אל תגזים בדרמה; אם נשמעת רגשית או קשה — תן מקום לרגע אנושי.
- בלי רשימות, בלי כותרת, בלי "שמרנו בזיכרון".
- התחל בפנייה אישית עם השם — פעם אחת, טבעי.`;

type JourneyTaskJson = { id: string; title: string; description?: string | null };

function parseTasks(raw: unknown): JourneyTaskJson[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const id = typeof row.id === 'string' ? row.id : '';
      const title = typeof row.title === 'string' ? row.title : '';
      if (!id || !title) return null;
      const description = typeof row.description === 'string' ? row.description : null;
      return { id, title, description };
    })
    .filter((x): x is JourneyTaskJson => Boolean(x));
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

async function recentCelebrationExists(
  admin: SupabaseClient,
  userId: string,
  taskId: string,
  windowMs: number
): Promise<boolean> {
  const since = new Date(Date.now() - windowMs).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('notifications')
    .select('id, metadata, created_at')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(25);

  if (error || !Array.isArray(data)) return false;
  return data.some((row: { metadata?: unknown }) => {
    const m = row.metadata as Record<string, unknown> | null | undefined;
    return m?.source === 'task_completion_celebration' && m?.task_id === taskId;
  });
}

/**
 * נוטיפיקציה מיידית אחרי סימון "ביצעתי" על משימה — טקסט מותאם ב-AI.
 */
export async function sendTaskCompletionCelebration(
  admin: SupabaseClient,
  userId: string,
  stepId: string,
  taskId: string
): Promise<{ body: string; skipped?: boolean }> {
  if (await recentCelebrationExists(admin, userId, taskId, 90_000)) {
    return { body: '', skipped: true };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prog } = await (admin as any)
    .from('journey_progress')
    .select('task_statuses')
    .eq('user_id', userId)
    .eq('step_id', stepId)
    .maybeSingle();

  const taskStatuses = (prog?.task_statuses ?? null) as Record<string, { status?: string; execution_done?: boolean }> | null;
  const row = taskStatuses?.[taskId];
  if (!row || row.status !== 'accepted' || row.execution_done !== true) {
    throw new Error('Task not in completed-accepted state');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: stepRow } = await (admin as any)
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

  const { firstName, genderInstruction } = await fetchNotifyUserProfile(admin, userId);

  const contextBlock = [
    `שם המשימה: ${taskTitle}`,
    `תיאור המשימה (לעומק טון): ${taskDescription}`,
    `צעד: ${stepTitle}${stepNum != null ? ` (#${stepNum})` : ''}`,
    station ? `תחנה במסע: ${station}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const body = await completeEmpathyNotifyBody({
    label: 'task_completion_celebration',
    temperature: 0.75,
    messages: [
      { role: 'system', content: `${CELEBRATION_SYSTEM}\n\nקונטקסט:\n${contextBlock}` },
      {
        role: 'user',
        content: `פרטי פנייה:
- שם פרטי: ${firstName}
- ${genderInstruction}

כתוב רק את גוף ההודעה לנוטיפיקציה. אלמוג בגוף ראשון זכר על עצמו.`,
      },
    ],
  });

  const title = `יופי, ${firstName}! · מאלמוג`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).from('notifications').insert({
    user_id: userId,
    type: 'ai_message',
    title,
    body,
    icon_emoji: '✨',
    action_url: '/journey',
    is_read: false,
    is_sent: false,
    send_at: new Date().toISOString(),
    metadata: {
      source: 'task_completion_celebration',
      task_id: taskId,
      step_id: stepId,
      model: AI_MODELS.empathy,
      recipient_first_name: firstName,
    },
  });

  if (error) throw new Error(error.message);
  return { body };
}
