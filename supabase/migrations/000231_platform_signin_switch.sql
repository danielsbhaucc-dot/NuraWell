-- 000231 (R20): sign in to NuraWell with the parent account — kill switch.
-- Armed only by the deploy env PLATFORM_SIGNIN_MODE=on. This column can only DOWNGRADE it:
--   signin='off'  -> the parent sign-in button is hidden and /api/v1/central/signin refuses (default; instant rollback)
--   signin='test' -> button only with /login?pl=parent, and only accounts flagged app_metadata.pl_enforce_test
--   signin='all'  -> everyone (owner approval only)
-- Password / passkey / QR login are never affected.
alter table public.platform_link_settings add column if not exists signin text not null default 'off' check (signin in ('off', 'test', 'all'));
