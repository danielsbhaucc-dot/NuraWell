-- Root-cause dedupe for Almog tasks (almog_assignments).
-- Problem: several insert paths (chat persist, journey bridge, SOS ease, blockers) each built their own
-- exact-text dedupe_key, and the key normalisation changed over time ("לשתות" vs "שתות"), so the same task
-- was created again and again in slightly different wording ("לשתות חצי כוס מים" ×2, "שתיה של מים", ...).
-- Fix: one DB-level guard for ALL paths — a new active task is rejected (23505) when the user already has
-- an active task with the same meaning by Hebrew-stem token overlap. Mirrors lib/ai/almog-commitments/title-similarity.ts.

create or replace function public.nw_title_tokens(t text)
returns text[] language plpgsql immutable set search_path to 'pg_catalog' as $$
declare
  tok text; s text; out text[] := '{}';
  stop text[] := array['של','את','על','עם','או','גם','זה','זו','היא','הוא','אני','כל','רק','לי','לך'];
begin
  foreach tok in array regexp_split_to_array(btrim(regexp_replace(lower(coalesce(t,'')), '[^[:alnum:]]+', ' ', 'g')), ' ') loop
    if tok = '' or tok = any(stop) then continue; end if;
    s := tok;
    if char_length(s) > 3 and left(s,1) in ('ל','ה','ו','ב') then s := substr(s,2); end if;
    loop
      exit when char_length(s) <= 2;
      if s ~ '(יות|ות|ית|יה|ים)$' and char_length(s) - 2 >= 2 then s := left(s, char_length(s)-2);
      elsif s ~ '[תהי]$' then s := left(s, char_length(s)-1);
      else exit; end if;
    end loop;
    if char_length(s) >= 2 and not s = any(out) then out := out || s; end if;
  end loop;
  return out;
end $$;

create or replace function public.nw_titles_similar(a text, b text)
returns boolean language plpgsql immutable set search_path to 'pg_catalog', 'public' as $$
declare ta text[] := public.nw_title_tokens(a); tb text[] := public.nw_title_tokens(b); i int; u int; sm int;
begin
  if cardinality(ta) = 0 or cardinality(tb) = 0 then return false; end if;
  select count(*) into i from unnest(ta) x where x = any(tb);
  u := cardinality(ta) + cardinality(tb) - i;
  sm := least(cardinality(ta), cardinality(tb));
  return (i::numeric / u) >= 0.72 or (i::numeric / sm) >= 0.85;
end $$;

create or replace function public.almog_assignments_block_similar_trg()
returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $$
begin
  -- 'eases' rows are structural (journey/SOS micro-steps keyed by a unique dedupe_key, they replace a frozen
  -- parent) and their callers rely on the insert succeeding, so they are exempt; free-form tasks are not.
  if new.status = 'active' and coalesce(new.relation, 'standalone') <> 'eases' and exists (
    select 1 from public.almog_assignments a
    where a.user_id = new.user_id and a.status = 'active' and a.id <> new.id
      and public.nw_titles_similar(a.title, new.title)
  ) then
    raise exception 'similar active assignment exists' using errcode = '23505';
  end if;
  return new;
end $$;

-- "zz" so it fires after trg_almog_assignments_title (triggers run in name order) and sees the normalised title.
drop trigger if exists trg_almog_assignments_zz_no_similar on public.almog_assignments;
create trigger trg_almog_assignments_zz_no_similar
  before insert on public.almog_assignments
  for each row execute function public.almog_assignments_block_similar_trg();

-- One-time cleanup: keep the most-practised (then oldest) task of each similar group, drop the rest.
do $$
declare r record; kept record; dup boolean;
begin
  create temp table _keep (user_id uuid, title text) on commit drop;
  for r in select id, user_id, title, history from public.almog_assignments where status = 'active'
           order by user_id, done_count desc nulls last, created_at asc loop
    select exists (select 1 from _keep k where k.user_id = r.user_id and public.nw_titles_similar(k.title, r.title)) into dup;
    if dup then
      update public.almog_assignments
        set status = 'dropped',
            history = (coalesce(case when jsonb_typeof(history) = 'array' then history end, '[]'::jsonb)
                       || jsonb_build_array(jsonb_build_object('at', now(), 'action', 'dropped', 'note', 'אוחד עם משימה דומה')))
        where id = r.id;
    else
      insert into _keep values (r.user_id, r.title);
    end if;
  end loop;
end $$;
