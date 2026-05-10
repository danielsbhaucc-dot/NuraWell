import { z } from 'zod';

const videoProviderSchema = z.enum(['heygen', 'bunny', 'youtube', 'vimeo', 'custom']).nullable();

const quizQuestionSchema = z.object({
  id: z.string().max(120),
  question: z.string().max(4000),
  options: z.array(z.string().max(2000)).max(12),
  correct_index: z.number().int().min(0),
  explanation: z.string().max(8000),
});

const gameItemSchema = z.object({
  id: z.string().max(120),
  statement: z.string().max(4000),
  is_true: z.boolean(),
  explanation: z.string().max(8000),
});

const commitmentSchema = z
  .object({
    text: z.string().max(2000),
    emoji: z.string().max(32),
    description: z.string().max(4000),
  })
  .nullable();

const researchSchema = z.object({
  id: z.string().max(120),
  title: z.string().max(500),
  authors: z.string().max(500),
  year: z.string().max(32),
  journal: z.string().max(500),
  finding: z.string().max(8000),
  url: z.union([z.string().url().max(2000), z.literal(''), z.null()]),
});

const journeyTaskSchema = z.object({
  id: z.string().max(120),
  title: z.string().max(500),
  description: z.string().max(2000).nullable(),
  emoji: z.string().max(32),
});

const journeyHabitSchema = z.object({
  id: z.string().max(120),
  title: z.string().max(500),
  description: z.string().max(2000).nullable(),
  emoji: z.string().max(32),
  frequency: z.enum(['daily', 'weekly', 'per_meal']),
  weekly_day: z.number().int().min(0).max(6).nullable().optional(),
});

const journeyStepPayloadSchema = z
  .object({
    course_id: z.string().uuid().nullable().optional(),
    station_id: z.string().uuid().nullable().optional(),
    title: z.string().min(1).max(500),
    description: z.string().max(20000).nullable().optional(),
    step_number: z.number().int().min(1).max(9999).optional(),
    is_published: z.boolean().optional(),
    video_provider: videoProviderSchema.optional(),
    video_external_id: z.string().max(2000).nullable().optional(),
    video_external_url: z.string().max(4000).nullable().optional(),
    video_title: z.string().max(500).nullable().optional(),
    summary_text: z.string().max(50000).nullable().optional(),
    text_content: z.string().max(500000).nullable().optional(),
    duration_minutes: z.number().int().min(0).max(24 * 60).nullable().optional(),
    quiz_questions: z.array(quizQuestionSchema).max(80).optional(),
    game_items: z.array(gameItemSchema).max(80).optional(),
    commitment: commitmentSchema.optional(),
    researches: z.array(researchSchema).max(40).optional(),
    tasks: z.array(journeyTaskSchema).max(40).optional(),
    habits: z.array(journeyHabitSchema).max(40).optional(),
    pdf_url: z.string().max(4000).nullable().optional(),
    pdf_name: z.string().max(500).nullable().optional(),
  })
  .strict();

/** POST — יצירת צעד (תואם ל־StepEditor) */
export const journeyStepInsertSchema = journeyStepPayloadSchema;

/** PATCH — עדכון חלקי (למשל רק is_published) או שמירה מלאה מהעורך */
export const journeyStepPatchSchema = journeyStepPayloadSchema.partial().extend({
  id: z.string().uuid(),
});
