'use client';

import { createContext, useContext } from 'react';

/** Step ids whose task the user is practicing (unified task model) — half credit until the step is completed. */
export const PracticingStepsContext = createContext<Set<string>>(new Set());

export function useStepCredit() {
  const practicing = useContext(PracticingStepsContext);
  return (s: { id: string; progress?: { is_completed?: boolean | null } | null }) =>
    s.progress?.is_completed ? 1 : practicing.has(s.id) ? 0.5 : 0;
}
