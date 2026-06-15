/**
 * 💾 שכבת קריאה/כתיבה ל-program_state + pending_ai_proposal (profiles).
 * משותפת ל-cron (האורקסטרטור) ול-API route (תגובת המשתמש על ההצעה).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { ProgramProposal, ProgramState } from './program-state';

export type ProgramRow = {
  program_state: ProgramState | null;
  program_state_updated_at: string | null;
  pending_ai_proposal: ProgramProposal | null;
};

export async function readProgramRow(
  admin: SupabaseClient,
  userId: string
): Promise<ProgramRow | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await admin
    .from('profiles')
    .select('program_state, program_state_updated_at, pending_ai_proposal')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    program_state: (data.program_state ?? null) as ProgramState | null,
    program_state_updated_at: (data.program_state_updated_at ?? null) as string | null,
    pending_ai_proposal: (data.pending_ai_proposal ?? null) as ProgramProposal | null,
  };
}

/** כותב את המצב בלבד (זול — נעשה בכל ריצת אורקסטרטור). */
export async function writeProgramState(
  admin: SupabaseClient,
  userId: string,
  state: ProgramState
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await admin
    .from('profiles')
    .update({ program_state: state, program_state_updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) {
    throw new Error(`writeProgramState failed: ${error.message}`);
  }
}

/** שומר/מנקה את ההצעה הפתוחה (null = ניקוי). */
export async function writePendingProposal(
  admin: SupabaseClient,
  userId: string,
  proposal: ProgramProposal | null
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await admin
    .from('profiles')
    .update({ pending_ai_proposal: proposal })
    .eq('id', userId);
  if (error) {
    throw new Error(`writePendingProposal failed: ${error.message}`);
  }
}
