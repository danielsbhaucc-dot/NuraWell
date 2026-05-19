'use client';

import { useEffect } from 'react';
import { createClient } from '../supabase/client';
import type { JourneyStepProgress } from '../types/journey';

function mapProgressRow(row: Record<string, unknown>): JourneyStepProgress | null {
  const stepId = typeof row.step_id === 'string' ? row.step_id : null;
  const userId = typeof row.user_id === 'string' ? row.user_id : null;
  if (!stepId || !userId) return null;

  return {
    step_id: stepId,
    user_id: userId,
    video_watched: Boolean(row.video_watched),
    quiz_answers: (row.quiz_answers as JourneyStepProgress['quiz_answers']) ?? {},
    quiz_score: typeof row.quiz_score === 'number' ? row.quiz_score : null,
    game_answers: (row.game_answers as JourneyStepProgress['game_answers']) ?? {},
    game_score: typeof row.game_score === 'number' ? row.game_score : null,
    commitment_accepted: Boolean(row.commitment_accepted),
    tasks_completed: (row.tasks_completed as JourneyStepProgress['tasks_completed']) ?? {},
    task_statuses: (row.task_statuses as JourneyStepProgress['task_statuses']) ?? {},
    habits_progress: (row.habits_progress as JourneyStepProgress['habits_progress']) ?? {},
    is_completed: Boolean(row.is_completed),
    completed_at: typeof row.completed_at === 'string' ? row.completed_at : null,
    last_section:
      typeof row.last_section === 'string'
        ? (row.last_section as JourneyStepProgress['last_section'])
        : 'video',
  };
}

/** האזנה לעדכוני journey_progress בזמן אמת (INSERT/UPDATE). */
export function useJourneyProgressLive(
  userId: string,
  onUpdate: (progress: JourneyStepProgress) => void,
  stepId?: string
): void {
  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`journey-progress-live-${userId}${stepId ? `-${stepId}` : ''}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'journey_progress',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
          if (!row) return;
          const mapped = mapProgressRow(row);
          if (!mapped) return;
          if (stepId && mapped.step_id !== stepId) return;
          onUpdate(mapped);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, stepId, onUpdate]);
}
