-- Guides upgrade: access control, background images, media image type

-- Course/guide metadata
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS background_image_key TEXT,
  ADD COLUMN IF NOT EXISTS unlock_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'discoverable'
    CHECK (visibility IN ('hidden', 'discoverable'));

COMMENT ON COLUMN public.courses.background_image_key IS 'R2 object key for full-page guide background';
COMMENT ON COLUMN public.courses.unlock_at IS 'Scheduled unlock — guide visible only after this time';
COMMENT ON COLUMN public.courses.visibility IS 'hidden = not listed; discoverable = listed when unlocked';

-- Enrollment access tiers
ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS access_type TEXT NOT NULL DEFAULT 'full'
    CHECK (access_type IN ('trial', 'full')),
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS granted_by TEXT
    CHECK (granted_by IS NULL OR granted_by IN ('admin', 'ai', 'self', 'schedule')),
  ADD COLUMN IF NOT EXISTS granted_reason TEXT;

COMMENT ON COLUMN public.enrollments.access_type IS 'trial = time-limited; full = permanent';
COMMENT ON COLUMN public.enrollments.trial_ends_at IS 'When trial access expires';
COMMENT ON COLUMN public.enrollments.granted_by IS 'Who granted access: admin, ai, self, schedule';
COMMENT ON COLUMN public.enrollments.granted_reason IS 'Human-readable reason for grant';

-- Access grant audit log
CREATE TABLE IF NOT EXISTS public.guide_access_grants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id       UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  access_type     TEXT NOT NULL CHECK (access_type IN ('trial', 'full')),
  trial_ends_at   TIMESTAMPTZ,
  granted_by      TEXT NOT NULL CHECK (granted_by IN ('admin', 'ai', 'self', 'schedule')),
  granted_reason  TEXT,
  signal_text     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guide_access_grants_user
  ON public.guide_access_grants(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_guide_access_grants_course
  ON public.guide_access_grants(course_id);

ALTER TABLE public.guide_access_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY guide_access_grants_select_own ON public.guide_access_grants
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY guide_access_grants_admin_all ON public.guide_access_grants
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Extend media_files to support image type
ALTER TABLE public.media_files DROP CONSTRAINT IF EXISTS media_files_file_type_check;
ALTER TABLE public.media_files
  ADD CONSTRAINT media_files_file_type_check
  CHECK (file_type IN ('audio', 'pdf', 'presentation', 'video_url', 'image'));
