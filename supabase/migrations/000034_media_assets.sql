-- ============================================================
-- NuraWell — Unified media library (Smart Media Manager)
-- Migration: 000034_media_assets.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.media_assets (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind              TEXT        NOT NULL CHECK (kind IN ('image', 'audio', 'file', 'video')),
  file_subtype      TEXT        CHECK (
    file_subtype IS NULL OR file_subtype IN (
      'pdf', 'presentation', 'word', 'spreadsheet', 'archive', 'other'
    )
  ),
  bucket            TEXT        CHECK (bucket IS NULL OR bucket IN ('images', 'audio', 'files')),
  object_key        TEXT,
  public_url        TEXT,
  provider          TEXT        CHECK (provider IS NULL OR provider IN ('bunny')),
  external_id       TEXT,
  external_url      TEXT,
  title             TEXT,
  original_filename TEXT,
  mime_type         TEXT,
  size_bytes        BIGINT,
  original_bytes    BIGINT,
  width             INTEGER,
  height            INTEGER,
  duration_seconds  NUMERIC,
  alt_text          TEXT,
  folder            TEXT,
  source            TEXT        NOT NULL DEFAULT 'upload' CHECK (
    source IN ('upload', 'pixabay', 'pexels', 'suno', 'other')
  ),
  credit            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_by        UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_assets_kind_created_idx
  ON public.media_assets (kind, created_at DESC);

CREATE INDEX IF NOT EXISTS media_assets_file_subtype_idx
  ON public.media_assets (file_subtype)
  WHERE kind = 'file';

CREATE INDEX IF NOT EXISTS media_assets_folder_idx
  ON public.media_assets (folder)
  WHERE folder IS NOT NULL;

CREATE INDEX IF NOT EXISTS media_assets_object_key_idx
  ON public.media_assets (object_key)
  WHERE object_key IS NOT NULL;

DROP TRIGGER IF EXISTS update_media_assets_updated_at ON public.media_assets;
CREATE TRIGGER update_media_assets_updated_at
  BEFORE UPDATE ON public.media_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_media_assets" ON public.media_assets;
CREATE POLICY "admin_all_media_assets" ON public.media_assets
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_assets TO authenticated;
GRANT ALL ON public.media_assets TO service_role;

COMMENT ON TABLE public.media_assets IS
  'ספריית מדיה מרכזית (תמונות/אודיו/קבצים/וידאו). מקור אמת לניהול קבצים ב-Ops.';
COMMENT ON COLUMN public.media_assets.credit IS
  'קרדיט/רישיון: source, author, title, link, license, page_url, photographer_url, requires_attribution';
