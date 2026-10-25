-- Security advisor hardening (2026-10-25)
-- 1) Pin search_path on append-only evidence triggers (prevents search_path hijack).
alter function public.trg_consent_evidence_append_only() set search_path = public, pg_temp;
alter function public.trg_media_evidence_append_only() set search_path = public, pg_temp;
-- 2) Trigger-only SECURITY DEFINER functions must never be callable via /rest/v1/rpc.
--    Triggers fire regardless of EXECUTE grants, so revoking is behaviour-neutral.
revoke execute on function public.trg_measurements_health_guard() from public, anon, authenticated;
revoke execute on function public.trg_memories_health_guard() from public, anon, authenticated;
revoke execute on function public.trg_profiles_health_guard() from public, anon, authenticated;
