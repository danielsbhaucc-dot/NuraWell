-- 000260: close the one-time pii_access_log reseal path (apply after the 000259 run reached 0 unsealed cells).
-- Restores the hard append-only rule: every UPDATE/DELETE/TRUNCATE is rejected again. No GUC exception remains.
-- Keeps pii_unsealed() (read-only, service_role) for the monitor, and the checkpoint hashes as evidence.
drop trigger if exists trg_pii_access_log_immutable on public.pii_access_log;
create trigger trg_pii_access_log_immutable before update or delete on public.pii_access_log
  for each row execute function public.pii_access_log_immutable();
drop function if exists public.pii_reseal_apply(jsonb);
drop function if exists public.pii_access_log_guard();
