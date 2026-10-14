-- Why a chat session was closed (shown in the chat thread + history; no user notification).
alter table public.chat_sessions
  add column if not exists close_reason text
  check (close_reason is null or close_reason in ('user', 'almog_ended', 'auto_idle', 'auto_abandoned', 'admin'));

comment on column public.chat_sessions.close_reason is
  'user | almog_ended (conversation ended with a goodbye) | auto_idle (no activity) | auto_abandoned (no reply for 24h) | admin';
