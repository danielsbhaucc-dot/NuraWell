-- כתובת האתר הציבורית (לוגין, לינקים) — ניתן לעדכן מפאנל Ops; ברירת מחדל Vercel עד חיבור דומיין קבוע
CREATE TABLE IF NOT EXISTS public.site_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CONSTRAINT site_settings_single_row CHECK (id = 1),
  public_app_url TEXT NOT NULL DEFAULT 'https://nurawell.vercel.app',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.site_settings IS 'הגדרות אתר גלובליות — שורה יחידה id=1';

INSERT INTO public.site_settings (id, public_app_url)
VALUES (1, 'https://nurawell.vercel.app')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_settings_select_public"
  ON public.site_settings
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "site_settings_update_admin"
  ON public.site_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (true);
