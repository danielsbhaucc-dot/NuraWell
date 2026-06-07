import { z } from 'zod';

const videoProviderSchema = z.enum(['heygen', 'bunny', 'youtube', 'vimeo', 'custom']).nullable();

const questionTtsMetaSchema = z
  .object({
    content_hash: z.string().max(64),
    object_key: z.string().max(500),
    url: z.string().max(4000),
    media_asset_id: z.string().uuid().optional(),
    voice_id: z.string().max(80),
    model_id: z.string().max(80),
    size_bytes: z.number().int().min(0).optional(),
    status: z.enum(['ready', 'error']),
    error: z.string().max(2000).optional(),
    generated_at: z.string().max(80).optional(),
  })
  .optional()
  .nullable();

const quizQuestionSchema = z.object({
  id: z.string().max(120),
  question: z.string().max(4000),
  options: z.array(z.string().max(2000)).max(12),
  correct_index: z.number().int().min(0),
  explanation: z.string().max(8000),
  tts: questionTtsMetaSchema,
});

const gameItemSchema = z.object({
  id: z.string().max(120),
  statement: z.string().max(4000),
  is_true: z.boolean(),
  explanation: z.string().max(8000),
  tts: questionTtsMetaSchema,
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
  source_text: z.string().max(120000).optional(),
  ai_summary: z.string().max(12000).optional(),
  key_findings: z.array(z.string().max(2000)).max(12).optional(),
  practical_takeaway: z.string().max(8000).optional(),
  limitations: z.string().max(8000).optional(),
  evidence_level: z.enum(['low', 'moderate', 'high', 'unknown']).optional(),
  rag_doc_id: z.string().uuid().optional(),
  last_scanned_at: z.string().max(80).optional(),
  scan_status: z.enum(['idle', 'scanning', 'ready', 'error']).optional(),
  scan_error: z.string().max(2000).optional(),
});

const taskDifficultyMetricSchema = z
  .object({
    kind: z.enum([
      'quantity',
      'time_before_event',
      'time_after_event',
      'time_of_day',
      'frequency',
      'duration',
      'custom',
    ]),
    value: z.union([z.number(), z.string(), z.null()]).optional(),
    unit: z.enum(['cups', 'minutes', 'hours', 'times', 'days', 'custom']).optional(),
    direction: z.enum(['higher_is_harder', 'lower_is_harder', 'custom']).optional(),
  })
  .optional();

const taskDifficultyLevelSchema = z.object({
  id: z.string().max(120),
  label: z.string().max(500),
  description: z.string().max(2000),
  emoji: z.string().max(32).optional(),
  order: z.number().int().min(0).max(99),
  is_recommended: z.boolean().optional(),
  is_minimum_viable: z.boolean().optional(),
  metric: taskDifficultyMetricSchema,
});

const taskLevelingSchema = z
  .object({
    levels: z.array(taskDifficultyLevelSchema).min(2).max(12),
    start_level_id: z.string().max(120).nullable(),
    recommended_level_id: z.string().max(120).nullable(),
    level_up_after_success_days: z.number().int().min(1).max(90),
    allow_user_downgrade: z.boolean(),
    allow_user_upgrade: z.boolean(),
    ai_rationale: z.string().max(4000).nullable().optional(),
  })
  .nullable()
  .optional();

const journeyTaskSchema = z.object({
  id: z.string().max(120),
  title: z.string().max(500),
  description: z.string().max(2000).nullable(),
  emoji: z.string().max(32),
  schedule: z
    .enum(['one_time', 'daily', 'multi_daily', 'weekly', 'per_meal'])
    .optional(),
  times_per_day: z.number().int().min(1).max(6).nullable().optional(),
  weekly_day: z.number().int().min(0).max(6).nullable().optional(),
  meal_timing: z.enum(['before', 'after']).nullable().optional(),
  meal_target: z.enum(['fixed', 'all']).nullable().optional(),
  leveling: taskLevelingSchema,
});

const journeyHabitSchema = z.object({
  id: z.string().max(120),
  title: z.string().max(500),
  description: z.string().max(2000).nullable(),
  emoji: z.string().max(32),
  frequency: z.enum(['daily', 'weekly', 'per_meal']),
  weekly_day: z.number().int().min(0).max(6).nullable().optional(),
  meal_timing: z.enum(['before', 'after']).nullable().optional(),
  meal_target: z.enum(['fixed', 'all']).nullable().optional(),
  target_days: z.number().int().min(1).max(365).nullable().optional(),
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
    audio_playlist_id: z.string().uuid().nullable().optional(),
  })
  .strict();

/** POST — יצירת צעד (תואם ל־StepEditor) */
export const journeyStepInsertSchema = journeyStepPayloadSchema;

/** PATCH — עדכון חלקי (למשל רק is_published) או שמירה מלאה מהעורך */
export const journeyStepPatchSchema = journeyStepPayloadSchema.partial().extend({
  id: z.string().uuid(),
});
