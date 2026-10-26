-- enc-enforce part 2 (pairs with 000203).
-- 1) Split technical filter keys out of metadata so metadata can be encrypted (were BLOCKED in field-registry):
--      ai_interactions.redaction_notice  <- metadata.redaction_notice (health-chat-redaction counts prior notices)
--      scheduled_reminders.source        <- metadata.source           (sos-care-loop cancels sos_followup reminders)
--    The app writer (lib/security/field-write.ts prepareWriteRow) fills both on every write that carries metadata.
--    Backfill copies the key from rows whose metadata is still a plaintext json object (encrypted rows are a string).
-- 2) CHECK constraints that bound plaintext length / format would reject ciphertext on the newly encrypted system
--    columns; replaced with a generous ciphertext-sized bound (values are validated in the app before sealing).

alter table public.ai_interactions add column if not exists redaction_notice boolean not null default false;
update public.ai_interactions set redaction_notice = true
 where jsonb_typeof(metadata) = 'object' and metadata @> '{"redaction_notice": true}' and not redaction_notice;
create index if not exists ai_interactions_redaction_notice_idx
  on public.ai_interactions (session_id, user_id) where redaction_notice;

alter table public.scheduled_reminders add column if not exists source text;
update public.scheduled_reminders set source = metadata->>'source'
 where jsonb_typeof(metadata) = 'object' and metadata ? 'source' and source is distinct from metadata->>'source';
create index if not exists scheduled_reminders_source_pending_idx
  on public.scheduled_reminders (user_id, source) where status = 'pending';

do $c$
declare r record;
begin
  for r in select * from (values
    ('demo_access_links', 'demo_access_links_guest_name_len', 'guest_name'),
    ('demo_access_links', 'demo_access_links_reason_len', 'reason'),
    ('gideon_telegram_identities', 'gideon_telegram_identities_reason_check', 'reason'),
    ('ip_blocks', 'ip_blocks_note_check', 'note'),
    ('ip_blocks', 'ip_blocks_reason_check', 'reason'),
    ('notify_style_rules', 'notify_style_rules_avoid_check', 'avoid'),
    ('notify_style_rules', 'notify_style_rules_prefer_check', 'prefer'),
    ('security_signals', 'security_signals_country_check', 'country'),
    ('security_signals', 'security_signals_path_check', 'path'),
    ('tg_action_nonces', 'tg_action_nonces_country_check', 'country')
  ) v(t, con, col) loop
    if to_regclass('public.' || r.t) is not null then
      execute format('alter table public.%I drop constraint if exists %I', r.t, r.con);
      execute format('alter table public.%I add constraint %I check (char_length(%I) <= 16384) not valid', r.t, r.con, r.col);
    end if;
  end loop;
end $c$;
