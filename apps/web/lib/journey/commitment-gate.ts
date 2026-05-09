import type { JourneyStepProgress } from '../types/journey';

/** האם המשתמש סיים את שלב ההתחייבות — כולל קבלה (true), או דחייה עם מעבר לסיכום שנשמר ב־DB */
export function isCommitmentGateResolved(stepHasCommitment: boolean, p: JourneyStepProgress): boolean {
  if (!stepHasCommitment) return true;
  if (p.is_completed || p.last_section === 'summary') return true;
  if (p.commitment_accepted === true) return true;
  return false;
}
