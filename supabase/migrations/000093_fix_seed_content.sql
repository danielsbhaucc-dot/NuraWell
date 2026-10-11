-- 000093: content fixes on the seed step (no user data touched)
-- broken pdf link ("Google.co.il" is not a PDF) → no PDF shown
update public.journey_steps set pdf_url = null, pdf_name = null
where id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' and pdf_url ilike '%google.%';

-- habit h1: a sentence was saved in the emoji field → keep the text as the title (if missing), real emoji
update public.journey_steps s set habits = (
  select jsonb_agg(
    case when x->>'id' = 'h1' and length(coalesce(x->>'emoji','')) > 8
      then x || jsonb_build_object(
        'title', coalesce(nullif(x->>'title',''), x->>'emoji'),
        'emoji', '💧')
      else x end order by ord)
  from jsonb_array_elements(s.habits) with ordinality t(x, ord))
where s.id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' and s.habits is not null and jsonb_array_length(s.habits) > 0;
