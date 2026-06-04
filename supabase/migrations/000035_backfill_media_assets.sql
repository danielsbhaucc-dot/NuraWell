-- ============================================================
-- NuraWell — Backfill existing media into media_assets
-- Migration: 000035_backfill_media_assets.sql
--
-- מטרה: לאחד את הקרדיטים והמדיה המפוזרים (audio_tracks, journey_stations,
--       site_settings) לתוך media_assets, כך שמנהל הקבצים יציג מקור אמת אחד.
--
--   * מיגרציה 000033 (audio_playlists/audio_tracks) נשארת — היא מפעילה את
--     מוזיקת הרקע בשיעורים ועדיין מקור האמת לניגון. כאן רק *משקפים* את
--     הרצועות גם ל-media_assets לצורך ניהול מאוחד.
--   * idempotent: לא יוצר כפילויות (NOT EXISTS לפי object_key), לא הרסני.
-- ============================================================

-- 1) רצועות אודיו קיימות → media_assets
INSERT INTO public.media_assets
  (kind, bucket, object_key, title, mime_type, size_bytes, duration_seconds, source, credit, created_at)
SELECT
  'audio',
  'audio',
  t.object_key,
  t.title,
  COALESCE(t.mime_type, 'audio/mpeg'),
  t.size_bytes,
  t.duration_seconds,
  CASE lower(COALESCE(t.credit->>'source', ''))
    WHEN 'pixabay' THEN 'pixabay'
    WHEN 'pexels'  THEN 'pexels'
    WHEN 'suno'    THEN 'suno'
    WHEN 'upload'  THEN 'upload'
    ELSE 'other'
  END,
  COALESCE(t.credit, '{}'::jsonb),
  t.created_at
FROM public.audio_tracks t
WHERE t.object_key IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.media_assets m WHERE m.object_key = t.object_key
  );

-- 2) תמונות רקע של תחנות מסע → media_assets
INSERT INTO public.media_assets
  (kind, bucket, object_key, title, mime_type, source, credit, created_at)
SELECT
  'image',
  'images',
  s.cover_image_key,
  COALESCE(NULLIF(s.title, ''), 'תמונת תחנה'),
  'image/webp',
  CASE lower(COALESCE(s.cover_image_credit->>'source', ''))
    WHEN 'pixabay' THEN 'pixabay'
    WHEN 'pexels'  THEN 'pexels'
    ELSE 'other'
  END,
  COALESCE(s.cover_image_credit, '{}'::jsonb),
  COALESCE(s.created_at, now())
FROM public.journey_stations s
WHERE s.cover_image_key IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.media_assets m WHERE m.object_key = s.cover_image_key
  );

-- 3) רקעי login / register → media_assets
INSERT INTO public.media_assets
  (kind, bucket, object_key, title, mime_type, source, credit, created_at)
SELECT 'image', 'images', ss.login_background_key, 'רקע התחברות', 'image/webp',
  CASE lower(COALESCE(ss.login_background_credit->>'source', ''))
    WHEN 'pixabay' THEN 'pixabay' WHEN 'pexels' THEN 'pexels' ELSE 'other' END,
  COALESCE(ss.login_background_credit, '{}'::jsonb), now()
FROM public.site_settings ss
WHERE ss.login_background_key IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.media_assets m WHERE m.object_key = ss.login_background_key);

INSERT INTO public.media_assets
  (kind, bucket, object_key, title, mime_type, source, credit, created_at)
SELECT 'image', 'images', ss.register_background_key, 'רקע הרשמה', 'image/webp',
  CASE lower(COALESCE(ss.register_background_credit->>'source', ''))
    WHEN 'pixabay' THEN 'pixabay' WHEN 'pexels' THEN 'pexels' ELSE 'other' END,
  COALESCE(ss.register_background_credit, '{}'::jsonb), now()
FROM public.site_settings ss
WHERE ss.register_background_key IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.media_assets m WHERE m.object_key = ss.register_background_key);
