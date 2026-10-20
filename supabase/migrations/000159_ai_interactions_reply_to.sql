-- WhatsApp-style reply quoting: an assistant message may reference an earlier USER message
-- of the same user+session. Only the id is stored (never a plaintext snippet; content stays
-- encrypted per user). No FK so a deleted original renders as "ההודעה נמחקה" instead of vanishing.
alter table public.ai_interactions
  add column if not exists reply_to_message_id uuid null;

create index if not exists ai_interactions_reply_to_idx
  on public.ai_interactions (reply_to_message_id)
  where reply_to_message_id is not null;

comment on column public.ai_interactions.reply_to_message_id is
  'Quoted earlier user message (same user_id + session_id, validated server-side). Id only, no content.';
