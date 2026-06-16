/**
 * הזרקת <CURRENT_USER_STRATEGY> לפרומפט המנטור.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { fetchUserMentorshipStrategy } from './persist-strategy';
import type { MentorshipStrategy } from './schema';

const MEDICAL_SAFETY_RULE =
  'אם קיימים medical_red_flags — אסור לתת ייעוץ רפואי, תזונתי, תרופתי או אבחון. ' +
  'הפנה בעדינות לרופא/דיאטנית. התמקד אך ורק בתמיכה התנהגותית ונפשית — ללא המלצות על סוכר, כולסטרול, כאב או תרופות.';

export function formatCurrentUserStrategy(strategy: MentorshipStrategy): string {
  const lines: string[] = ['<CURRENT_USER_STRATEGY>'];

  lines.push(`<PsychologicalApproach>${strategy.psychological_approach}</PsychologicalApproach>`);

  if (strategy.active_blockers.length > 0) {
    lines.push('<ActiveBlockers>');
    for (const b of strategy.active_blockers) lines.push(`- ${b}`);
    lines.push('</ActiveBlockers>');
  }

  if (strategy.current_focus.length > 0) {
    lines.push('<CurrentFocus>');
    for (const f of strategy.current_focus) lines.push(`- ${f}`);
    lines.push('</CurrentFocus>');
  }

  if (strategy.medical_red_flags.length > 0) {
    lines.push('<MedicalRedFlags>');
    for (const f of strategy.medical_red_flags) lines.push(`- ${f}`);
    lines.push('</MedicalRedFlags>');
    lines.push(`<SafetyInstruction>${MEDICAL_SAFETY_RULE}</SafetyInstruction>`);
  }

  lines.push(`<NextBestAction>${strategy.next_best_action}</NextBestAction>`);
  lines.push('</CURRENT_USER_STRATEGY>');

  return lines.join('\n');
}

/** שולף אסטרטגיה ומחזיר בלוק XML מוכן להזרקה לפרומפט. */
export async function getActiveContext(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const row = await fetchUserMentorshipStrategy(supabase, userId);
  if (!row.next_best_action && !row.psychological_approach) return '';
  return formatCurrentUserStrategy(row);
}

/** @deprecated */
export const formatMentorBrief = formatCurrentUserStrategy;
