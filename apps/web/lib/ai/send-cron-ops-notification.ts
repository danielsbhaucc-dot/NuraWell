import type { SupabaseClient } from '@supabase/supabase-js';

import { buildCoachingStylePromptBlock } from './almog-coaching-style';
import { completeEmpathyNotifyBody } from './empathy-notify-completion';
import type { CronOpsAction } from './cron-ops-action';
import { extractFirstName } from './cron-ops-action';
import { fetchNotifyUserProfile } from './notify-user-profile';
import {
  ALMOG_NOTIFY_MAX_OUTPUT_TOKENS,
  CRISIS_RECONNECT_NOTIFY_PROMPT,
  CRON_OPS_NOTIFY_PROMPT,
} from './prompts';
import type { AiUserContext } from './memory';
import { cronOpsReasonHint } from './roller-coaster';
import type { HabitGapSignal } from './roller-coaster';

const ACTION_HE: Record<Exclude<CronOpsAction, 'silent'>, string> = {
  celebrate: 'חגיגת רצף / התמדה — הכרה חמה, שאלה מה עזר',
  micro_win: 'צעד זעיר להחזרת מומנטום — בלי אשמה',
  check_in: 'בקשה עדינה לעדכון משקל או תחושת גוף — לא נודניק',
  re_engage: 'חיבור מחדש אחרי היעדרות — סקרנות, לא "התגעגענו"',
  crisis_reconnect: 'משבר רכבת-הרים — חיבור מחדש רך, צעד זעיר (מים), בלי שיפוט',
};

export type CronOpsLlmParams = {
  userId: string;
  action: Exclude<CronOpsAction, 'silent'>;
  reason: string;
  daysSinceActive: number;
  daysSinceLastWeight: number | null;
  streakDays: number | null;
  aiContext: Record<string, unknown>;
  habitGap?: HabitGapSignal | null;
};

/**
 * נוטיפיקציית Cron מותאמת אישית ב-LLM (במקום תבנית קבועה).
 */
export async function generateCronOpsNotificationBody(
  admin: SupabaseClient,
  params: CronOpsLlmParams
): Promise<string> {
  const { firstName, genderInstruction } = await fetchNotifyUserProfile(admin, params.userId);
  const ctx = params.aiContext as AiUserContext;
  const styleBlock = buildCoachingStylePromptBlock(ctx);
  const mood = String(ctx.current_mood_signal ?? 'unknown');
  const notesRaw = typeof ctx.notes === 'string' ? ctx.notes.trim() : '';
  const notes = notesRaw.length > 90 ? `${notesRaw.slice(0, 88)}…` : notesRaw;

  const reasonHint = cronOpsReasonHint(params.reason, params.habitGap ?? null);
  const systemBase =
    params.action === 'crisis_reconnect' ? CRISIS_RECONNECT_NOTIFY_PROMPT : CRON_OPS_NOTIFY_PROMPT;

  const contextBlock = [
    `סוג פעולה: ${ACTION_HE[params.action]}`,
    `סיבה פנימית: ${reasonHint}`,
    `ימים מאז פעילות אחרונה: ${params.daysSinceActive}`,
    params.daysSinceLastWeight != null
      ? `ימים מאז עדכון משקל: ${params.daysSinceLastWeight}`
      : null,
    params.streakDays != null ? `רצף ימים: ${params.streakDays}` : null,
    mood !== 'unknown' ? `אות רגשי אחרון: ${mood}` : null,
    notes ? `תובנה מהניתוח: ${notes}` : null,
    styleBlock,
  ]
    .filter(Boolean)
    .join('\n');

  return completeEmpathyNotifyBody({
    label: `cron_ops_${params.action}`,
    temperature: 0.8,
    presencePenalty: 0.45,
    frequencyPenalty: 0.5,
    maxTokens: 192,
    messages: [
      { role: 'system', content: `${systemBase}\n\nקונטקסט:\n${contextBlock}` },
      {
        role: 'user',
        content: `פרטי פנייה:
- שם: ${firstName}
- ${genderInstruction}

כתוב רק את גוף ההודעה — 2–3 משפטים קצרים, שאלה פתוחה בסוף.`,
      },
    ],
  });
}

export function cronOpsNotificationTitle(
  action: Exclude<CronOpsAction, 'silent'>,
  fullName: string | null
): string {
  const first = extractFirstName(fullName);
  switch (action) {
    case 'celebrate':
      return `יופי, ${first}! · מאלמוג`;
    case 'check_in':
      return `רגע קצר · מאלמוג`;
    default:
      return `${first} · מאלמוג`;
  }
}
