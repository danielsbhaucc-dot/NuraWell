-- 000106: onboarding safety screening (ED history / pregnancy / fluid restriction / medical follow-up / minor)
alter table public.profiles add column if not exists safety_screening jsonb;
comment on column public.profiles.safety_screening is 'Onboarding safety screening answers + derived adaptations (no_weight, fluid_restriction_alt, recommend_clinician). Collected under health-data consent.';
-- habits-first: the only course/guide title no longer promises weight loss
update public.courses set title = replace(title, 'מדריך מלא לירידה במשקל', 'מדריך מלא להרגלים בריאים') where title like '%לירידה במשקל%';
update public.courses set description = 'קורס מעשי לשינוי אורח חיים ויצירת הרגלים בריאים שמחזיקים לאורך זמן. 6 שיעורים עם וידאו, אודיו, מסמכים ומשימות יומיות.' where id = '11111111-1111-1111-1111-111111111111';
