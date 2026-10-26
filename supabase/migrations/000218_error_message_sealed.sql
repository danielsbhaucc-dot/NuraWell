-- error_events.message is now sealed (enc:v2, field-registry). ceo_metrics grouped errors by plaintext message;
-- group by source only (msg kept as null for shape compatibility). Body otherwise identical to 000109 (prod md5 verified).
create or replace function public.ceo_metrics(p_days int default 1)
returns jsonb language sql stable security definer set search_path to 'public' as $$
with s as (select now() - make_interval(days => p_days) as since, now() - make_interval(days => p_days*2) as prev),
u as (select id, created_at, last_active_at, onboarding_completed, engagement_status from profiles where role = 'user')
select jsonb_build_object(
  'days', p_days,
  'users_total', (select count(*) from u),
  'users_new', (select count(*) from u, s where u.created_at >= s.since),
  'users_new_prev', (select count(*) from u, s where u.created_at >= s.prev and u.created_at < s.since),
  'active', (select count(*) from u, s where u.last_active_at >= s.since),
  'active_prev', (select count(*) from u, s where u.last_active_at >= s.prev and u.last_active_at < s.since),
  'not_onboarded_2d', (select count(*) from u where not coalesce(onboarding_completed,false) and created_at < now() - interval '2 days'),
  'inactive_7d', (select count(*) from u where coalesce(last_active_at, created_at) < now() - interval '7 days'),
  'engagement', (select coalesce(jsonb_object_agg(k, n), '{}') from (select coalesce(engagement_status,'unknown') k, count(*) n from u group by 1) x),
  'task_done', (select count(*) from task_events e, s where e.occurred_at >= s.since and e.kind in ('done','completed','complete') and e.user_id in (select id from u)),
  'task_missed', (select count(*) from task_events e, s where e.occurred_at >= s.since and e.kind in ('missed','skipped','skip') and e.user_id in (select id from u)),
  'level_up', (select count(*) from task_events e, s where e.occurred_at >= s.since and e.to_level > e.from_level and e.user_id in (select id from u)),
  'level_down', (select count(*) from task_events e, s where e.occurred_at >= s.since and e.to_level < e.from_level and e.user_id in (select id from u)),
  'sos', (select count(*) from guardian_sos_events g, s where g.created_at >= s.since and g.user_id in (select id from u)),
  'sos_red_flag', (select count(*) from guardian_sos_events g, s where g.created_at >= s.since and g.red_flag and g.user_id in (select id from u)),
  'notifications_sent', (select count(*) from notifications n, s where n.created_at >= s.since and n.user_id in (select id from u)),
  'notifications_read_pct', (select round(100.0 * count(*) filter (where is_read) / nullif(count(*),0), 1) from notifications n, s where n.created_at >= s.since and n.user_id in (select id from u)),
  'chat_messages_user', (select count(*) from ai_interactions a, s where a.created_at >= s.since and a.role = 'user' and a.user_id in (select id from u)),
  'errors', (select count(*) from error_events e, s where e.created_at >= s.since and e.severity in ('error','fatal')),
  'errors_top', (select coalesce(jsonb_agg(x), '[]') from (select coalesce(source, route, '?') src, null::text msg, count(*) n from error_events e, s where e.created_at >= s.since and e.severity in ('error','fatal') group by 1 order by 3 desc limit 3) x),
  'subs_active', (select count(*) from subscriptions where status in ('active','past_due')),
  'subs_canceled', (select count(*) from subscriptions, s where canceled_at >= s.since),
  'steps_unpublished', (select count(*) from journey_steps where not coalesce(is_published,false)),
  'steps_no_video', (select count(*) from journey_steps where is_published and coalesce(video_external_id, video_external_url, '') = ''),
  'stations_without_steps', (select count(*) from journey_stations st where not exists (select 1 from journey_steps j where j.station_id = st.id and j.is_published)),
  'pending_ceo_actions', (select count(*) from ceo_pending_actions where status = 'pending' and expires_at > now())
);
$$;
