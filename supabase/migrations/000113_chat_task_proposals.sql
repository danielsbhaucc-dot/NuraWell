-- Tasks Almog detects in chat (writer or background extractor) are PROPOSED, not written to the plan.
-- The chat shows a "לעדכן בתוכנית שלך?" card (throttled); only a user confirm writes user_task_assignments.
create table if not exists public.chat_task_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid null,
  title text not null check (char_length(title) between 4 and 120),
  reason text null,
  status text not null default 'pending' check (status in ('pending','shown','confirmed','dismissed','expired')),
  shown_count int not null default 0,
  shown_at timestamptz null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz null
);
create index if not exists chat_task_proposals_user_open on public.chat_task_proposals (user_id, created_at) where status in ('pending','shown');
create unique index if not exists chat_task_proposals_user_title_open on public.chat_task_proposals (user_id, lower(title)) where status in ('pending','shown');
alter table public.chat_task_proposals enable row level security;
drop policy if exists chat_task_proposals_owner_select on public.chat_task_proposals;
create policy chat_task_proposals_owner_select on public.chat_task_proposals for select using (auth.uid() = user_id);
-- writes only via service role (server routes)
