import { z } from 'zod';

const stepSectionSchema = z.enum(['video', 'quiz', 'game', 'commitment', 'summary']);

/** Allowed columns for POST /api/v1/journey-progress — blocks mass-assignment / IDOR attempts. */
export const journeyProgressUpsertSchema = z
  .object({
    step_id: z.string().uuid(),
    video_watched: z.boolean().optional(),
    quiz_answers: z.record(z.string(), z.number().int().min(0)).optional(),
    quiz_score: z.number().int().min(0).max(100).nullable().optional(),
    game_answers: z.record(z.string(), z.boolean()).optional(),
    game_score: z.number().int().min(0).max(100).nullable().optional(),
    commitment_accepted: z.boolean().optional(),
    tasks_completed: z.record(z.string(), z.boolean()).optional(),
    task_statuses: z.record(z.string(), z.unknown()).optional(),
    habits_progress: z.record(z.string(), z.array(z.boolean())).optional(),
    habit_meta: z.record(z.string(), z.unknown()).optional(),
    is_completed: z.boolean().optional(),
    completed_at: z.string().nullable().optional(),
    last_section: stepSectionSchema.optional(),
  })
  .strict();

export type JourneyProgressUpsertInput = z.infer<typeof journeyProgressUpsertSchema>;
