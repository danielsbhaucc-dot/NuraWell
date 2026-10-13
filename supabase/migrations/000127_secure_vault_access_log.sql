-- Audit of every server-side vault resolve (never the value).
create table if not exists public.secure_vault_access_log (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid references public.secure_vault_items(id) on delete set null,
  ref text not null,
  action text not null,
  outcome text not null check (outcome in ('granted','denied_action','denied_owner','not_found','error')),
  created_at timestamptz not null default now()
);
create index if not exists secure_vault_access_log_user_idx on public.secure_vault_access_log(user_id, created_at desc);
alter table public.secure_vault_access_log enable row level security;
revoke all on public.secure_vault_access_log from anon;
drop policy if exists "vault log owner select" on public.secure_vault_access_log;
create policy "vault log owner select" on public.secure_vault_access_log for select to authenticated using (user_id = (select auth.uid()));
-- writes only via service role.
