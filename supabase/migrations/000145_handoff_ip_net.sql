-- Handoff no longer hard-binds to IP (different proxies per host). Keep a hash of the /24 (/64) for audit only.
alter table public.ops_handoff_tokens add column if not exists ip_net_hash text;
