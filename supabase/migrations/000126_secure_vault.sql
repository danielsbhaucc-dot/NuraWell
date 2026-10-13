-- Secure vault: user-entered sensitive values, AES-256-GCM encrypted in the app (key: SECURE_VAULT_KEY env, never in DB).
create table if not exists public.secure_vault_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ref text not null unique,
  kind text not null check (kind in ('id','passport','card','bank','address','phone','other')),
  ciphertext text not null,
  iv text not null,
  tag text not null,
  last4 text,
  created_at timestamptz not null default now()
);
create index if not exists secure_vault_items_user_idx on public.secure_vault_items(user_id, created_at desc);
alter table public.secure_vault_items enable row level security;
revoke all on public.secure_vault_items from anon;
drop policy if exists "vault owner select" on public.secure_vault_items;
create policy "vault owner select" on public.secure_vault_items for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "vault owner delete" on public.secure_vault_items;
create policy "vault owner delete" on public.secure_vault_items for delete to authenticated using (user_id = (select auth.uid()));
-- inserts only via server (service role) after encryption; no client insert/update policy.
