-- Almog post-send quality check: audit of automatic reply edits. Original + edited text are
-- encrypted exactly like ai_interactions.content (app-layer, per-user). Service-role only.
create table if not exists public.ai_interaction_edits (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  interaction_id uuid not null unique references public.ai_interactions(id) on delete cascade,
  user_id uuid not null,
  session_id uuid,
  original_content text not null,
  edited_content text not null,
  source text not null default 'almog_reply_qc',
  model text,
  cost_usd numeric(12,8) not null default 0
);
create index if not exists ai_interaction_edits_user_idx on public.ai_interaction_edits (user_id, created_at desc);
alter table public.ai_interaction_edits enable row level security;
revoke all on public.ai_interaction_edits from anon, authenticated;
