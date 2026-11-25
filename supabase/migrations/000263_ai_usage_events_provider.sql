-- Serving provider name (OpenRouter `provider` field) on the internal AI usage log.
-- Name only: no prompt, no completion, no personal data.
-- Apply in the local lab only with this change. Do not apply to the live database
-- until the change is reviewed and an apply is explicitly approved.
set lock_timeout = '120s';

alter table public.ai_usage_events
  add column if not exists provider text;

comment on column public.ai_usage_events.provider is
  'OpenRouter serving provider name for this call. Name only; no request or response content.';
