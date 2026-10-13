-- Admin-configurable rules for when Almog may open a guide (lib/guides/guide-rules.ts).
-- NULL = code defaults. Additive and nullable.
alter table public.site_settings add column if not exists guide_rules jsonb;
comment on column public.site_settings.guide_rules is 'Rules for AI-opened guides (enabled, explicit request, signals, companion auto-open, cooldown, max active, blocked phrases). NULL = defaults.';
