-- ============================================================
-- NuraWell — Challenge phase 3: wrap-up, lesson, cron metadata
-- Migration: 000071_challenge_phase3.sql
-- ============================================================

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS challenge_eating_window_lesson JSONB;

COMMENT ON COLUMN public.site_settings.challenge_eating_window_lesson IS
  'Lesson shown before eating-window setup: {title, body_html, video_url?}';

ALTER TABLE public.challenge_enrollments
  ADD COLUMN IF NOT EXISTS wrap_up_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completion_summary JSONB;

COMMENT ON COLUMN public.challenge_enrollments.wrap_up_seen_at IS
  'When user viewed the day-14 completion screen';
COMMENT ON COLUMN public.challenge_enrollments.completion_summary IS
  'Summary generated at challenge end';

UPDATE public.site_settings
SET challenge_eating_window_lesson = COALESCE(
  challenge_eating_window_lesson,
  '{
    "title": "חלון אכילה 12:12 — למה זה עובד",
    "body_html": "<p>אוכלים בתוך חלון קבוע עוזר לגוף לשרוף שומן בצורה טבעית — בלי להרעיב.</p><p><strong>12 שעות אכילה, 12 שעות מנוחה</strong> — מותאם לשעות שלך.</p><p>במהלך האתגר, אלמוג יעזור לך לעמוד בזה — זו לא דיאטה, זו הרגל.</p>",
    "video_url": null
  }'::jsonb
)
WHERE id = 1;
