'use client';

import { createContext, useContext } from 'react';

/** Step ids whose task the user is practicing (unified task model) — half credit until the step is completed. */
export const PracticingStepsContext = createContext<Set<string>>(new Set());

type CreditStep = { id: string; progress?: { is_completed?: boolean | null } | null };

/** Returns a credit function: 1 for a completed step, 0.5 while its task is being practiced, else 0. */
export const useStepCredit = () => {
  const practicing = useContext(PracticingStepsContext);
  return (step: CreditStep): number => {
    if (step.progress?.is_completed) return 1;
    return practicing.has(step.id) ? 0.5 : 0;
  };
};
