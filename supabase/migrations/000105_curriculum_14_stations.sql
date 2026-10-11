-- 000105: 14-station curriculum (NuraWell-notes/curriculum.md). Old stations → track 'legacy' (kept, hidden).
-- Station 0 reuses the foundation row; the produced water lesson (a1b2…) becomes station 1 lesson 1. No hard deletes.
update public.journey_stations set track = 'legacy', is_foundation = false where id <> 'ff3df6e3-7fa9-4bc7-8e77-7000ef2fc776' and track = 'main';
update public.journey_stations set title='פתיחה: מעקב ועוגנים', description='מעקב פשוט ויומי הוא המנוע של שינוי הרגלים: "וי" קטן בשעה קבועה, ועוגן שכבר קיים ביום. בתחנה הזו בונים את התשתית לכל המסע.', sort_order=0, habit_key='foundation', track='main', is_foundation=true, updated_at=now() where id='ff3df6e3-7fa9-4bc7-8e77-7000ef2fc776';
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('4d17029e-b167-5ad5-a79c-d0edbca30b17', 'ff3df6e3-7fa9-4bc7-8e77-7000ef2fc776', 'איך הרגלים באמת נוצרים (ולמה 21 יום זה מיתוס)', 'שלב 0 – יציאה לדרך', 1, true, '[טיוטת תסריט — לעריכה לפני צילום]
איך הרגלים באמת נוצרים (ולמה 21 יום זה מיתוס)

מעקב פשוט ויומי הוא המנוע של שינוי הרגלים: "וי" קטן בשעה קבועה, ועוגן שכבר קיים ביום. בתחנה הזו בונים את התשתית לכל המסע.

בשיעור הזה: מה המחקר אומר, ולמה מתחילים בגרסה הכי קטנה.', 3, '[{"id": "t1", "emoji": "🌱", "title": "לסמן וי יומי באפליקציה בשעה קבועה", "description": "מתרגלים את פעולת המעקב עצמה — שנייה אחת ביום.", "schedule": "daily", "times_per_day": 1}]'::jsonb, '{"text": "ההתחייבות שלי לשבועיים הקרובים: לסמן וי יומי באפליקציה בשעה קבועה", "emoji": "🌱", "description": "מתחילים ברמה הכי קטנה. פספוס של יום לא מאפס כלום."}'::jsonb) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.task_definitions (stable_key, source, source_ref, step_id, habit_key, title, description, emoji, schedule, times_per_day, ladder, floor_level, max_level) values ('step:4d17029e-b167-5ad5-a79c-d0edbca30b17:t1', 'step', 't1', '4d17029e-b167-5ad5-a79c-d0edbca30b17', 'foundation', 'לסמן וי יומי באפליקציה בשעה קבועה', 'מתרגלים את פעולת המעקב עצמה — שנייה אחת ביום.', '🌱', 'daily', 1, '[{"level": -1, "title": "וי יומי בלבד", "times_per_day": 1}, {"level": 0, "title": "וי יומי + מילה אחת על איך היה היום", "times_per_day": 1}, {"level": 1, "title": "וי יומי + מילה על ההרגשה + בדיקה שבועית (שקילה רק למי שרוצה)", "times_per_day": 1}]'::jsonb, -1, 1) on conflict (stable_key) do update set ladder=excluded.ladder, habit_key=excluded.habit_key, floor_level=-1, max_level=1;
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('cac119e4-0dde-56fe-8fbe-95356c59169c', 'ff3df6e3-7fa9-4bc7-8e77-7000ef2fc776', 'העוגן שלך: לבנות "אחרי ש... אני..."', 'שלב 0 – יציאה לדרך', 2, true, '[טיוטת תסריט — לעריכה לפני צילום]
העוגן שלך: לבנות "אחרי ש... אני..."

בשיעור הזה בונים את העוגן: אחרי איזו פעולה קבועה ביום עושים את ההרגל, ואיך מכינים את הסביבה כדי שיהיה קל.

בסוף השיעור בוחרים עוגן אחד ומספרים לאלמוג.', 3, '[]'::jsonb, null) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('2cf33831-f8be-5ee2-97d1-e0d3e4d8faa9', 'ff3df6e3-7fa9-4bc7-8e77-7000ef2fc776', 'המעקב השבועי: נתון, לא שיפוט', 'שלב 0 – יציאה לדרך', 3, true, '[טיוטת תסריט — לעריכה לפני צילום]
המעקב השבועי: נתון, לא שיפוט

בשיעור הזה עוברים על המכשולים הנפוצים ובונים משפט אם–אז אחד: "אם ___, אז ___".

פספוס של יום לא מאפס כלום — חוזרים מחר.', 3, '[]'::jsonb, null) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.journey_stations (id, title, description, sort_order, habit_key, track, is_foundation) values ('7cf38efe-66a4-5619-baca-39f182180959', 'מים לפני ארוחות', 'כוס מים לפני ארוחה היא הרגל קטן עם השפעה מורגשת: היא מקדימה תחושת מלאות ועוזרת להתחיל את הארוחה ברוגע.

⚠️ מי שיש לו אי-ספיקת לב או כליות, או הגבלת נוזלים מרופא — לא מגדילים שתייה. אלמוג יציע גרסה חלופית (למשל עצירה של דקה לפני הארוחה).', 1, 'water', 'main', false) on conflict (id) do update set title=excluded.title, description=excluded.description, sort_order=excluded.sort_order, habit_key=excluded.habit_key, track='main';
update public.journey_steps set station_id='7cf38efe-66a4-5619-baca-39f182180959', step_number=4, updated_at=now() where id='a1b2c3d4-e5f6-7890-abcd-ef1234567890';
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('01b8ef16-195f-5217-a3c4-4afd21297fb8', '7cf38efe-66a4-5619-baca-39f182180959', 'העוגן: איפה הבקבוק עומד ומתי שותים', 'שלב 1 – יסודות קלים', 5, true, '[טיוטת תסריט — לעריכה לפני צילום]
העוגן: איפה הבקבוק עומד ומתי שותים

בשיעור הזה בונים את העוגן: אחרי איזו פעולה קבועה ביום עושים את ההרגל, ואיך מכינים את הסביבה כדי שיהיה קל.

בסוף השיעור בוחרים עוגן אחד ומספרים לאלמוג.', 3, '[]'::jsonb, null) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('b41997f4-ef44-54eb-a3c6-34dd37ba112d', '7cf38efe-66a4-5619-baca-39f182180959', 'מכשולים: עבודה, מסעדה, "אני לא אוהב מים" (+ תוכנית אם–אז)', 'שלב 1 – יסודות קלים', 6, true, '[טיוטת תסריט — לעריכה לפני צילום]
מכשולים: עבודה, מסעדה, "אני לא אוהב מים" (+ תוכנית אם–אז)

בשיעור הזה עוברים על המכשולים הנפוצים ובונים משפט אם–אז אחד: "אם ___, אז ___".

פספוס של יום לא מאפס כלום — חוזרים מחר.', 3, '[]'::jsonb, null) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.journey_stations (id, title, description, sort_order, habit_key, track, is_foundation) values ('e8909131-31b5-5239-8ac4-27ea0d348b2b', 'חלבון בארוחת הבוקר', 'ארוחת בוקר עם חלבון עוזרת לשובע לאורך היום ומפחיתה נשנושים בערב. מתחילים בפריט אחד פשוט.', 2, 'protein', 'main', false) on conflict (id) do update set title=excluded.title, description=excluded.description, sort_order=excluded.sort_order, habit_key=excluded.habit_key, track='main';
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('231a4508-e081-5945-86ed-67bff13b35a7', 'e8909131-31b5-5239-8ac4-27ea0d348b2b', 'למה הבוקר קובע מה יקרה בערב', 'שלב 1 – יסודות קלים', 7, true, '[טיוטת תסריט — לעריכה לפני צילום]
למה הבוקר קובע מה יקרה בערב

ארוחת בוקר עם חלבון עוזרת לשובע לאורך היום ומפחיתה נשנושים בערב. מתחילים בפריט אחד פשוט.

בשיעור הזה: מה המחקר אומר, ולמה מתחילים בגרסה הכי קטנה.', 3, '[{"id": "t1", "emoji": "🍳", "title": "מקור חלבון אחד בארוחה הראשונה של היום", "description": "ביצה, יוגורט, קוטג׳, טופו או טונה — מה שזמין.", "schedule": "daily", "times_per_day": 1}]'::jsonb, '{"text": "ההתחייבות שלי לשבועיים הקרובים: מקור חלבון אחד בארוחה הראשונה של היום", "emoji": "🍳", "description": "מתחילים ברמה הכי קטנה. פספוס של יום לא מאפס כלום."}'::jsonb) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.task_definitions (stable_key, source, source_ref, step_id, habit_key, title, description, emoji, schedule, times_per_day, ladder, floor_level, max_level) values ('step:231a4508-e081-5945-86ed-67bff13b35a7:t1', 'step', 't1', '231a4508-e081-5945-86ed-67bff13b35a7', 'protein', 'מקור חלבון אחד בארוחה הראשונה של היום', 'ביצה, יוגורט, קוטג׳, טופו או טונה — מה שזמין.', '🍳', 'daily', 1, '[{"level": -1, "title": "פריט חלבוני אחד (למשל יוגורט)", "times_per_day": 1}, {"level": 0, "title": "ארוחת בוקר עם כ-20 גרם חלבון", "times_per_day": 1}, {"level": 1, "title": "כ-25–35 גרם חלבון + ירק", "times_per_day": 1}]'::jsonb, -1, 1) on conflict (stable_key) do update set ladder=excluded.ladder, habit_key=excluded.habit_key, floor_level=-1, max_level=1;
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('c20b16aa-90de-56b1-9943-951509f472e1', 'e8909131-31b5-5239-8ac4-27ea0d348b2b', '10 ארוחות בוקר חלבוניות ב-5 דקות', 'שלב 1 – יסודות קלים', 8, true, '[טיוטת תסריט — לעריכה לפני צילום]
10 ארוחות בוקר חלבוניות ב-5 דקות

בשיעור הזה בונים את העוגן: אחרי איזו פעולה קבועה ביום עושים את ההרגל, ואיך מכינים את הסביבה כדי שיהיה קל.

בסוף השיעור בוחרים עוגן אחד ומספרים לאלמוג.', 3, '[]'::jsonb, null) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('26035b94-cea3-5f13-9059-8912dfb441d3', 'e8909131-31b5-5239-8ac4-27ea0d348b2b', 'מכשולים: "אין לי תיאבון בבוקר" / "אין לי זמן"', 'שלב 1 – יסודות קלים', 9, true, '[טיוטת תסריט — לעריכה לפני צילום]
מכשולים: "אין לי תיאבון בבוקר" / "אין לי זמן"

בשיעור הזה עוברים על המכשולים הנפוצים ובונים משפט אם–אז אחד: "אם ___, אז ___".

פספוס של יום לא מאפס כלום — חוזרים מחר.', 3, '[]'::jsonb, null) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.journey_stations (id, title, description, sort_order, habit_key, track, is_foundation) values ('8d30f02a-b1bd-58c4-9b3a-6c8ef6f88ce0', 'החלפת משקאות ממותקים', 'משקאות ממותקים מוסיפים סוכר שלא מרגישים. החלפה אחת ביום בתחליף שאוהבים היא צעד קל עם השפעה גדולה.', 3, 'drinks', 'main', false) on conflict (id) do update set title=excluded.title, description=excluded.description, sort_order=excluded.sort_order, habit_key=excluded.habit_key, track='main';
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('e71c47ae-17bd-5bc1-9d1e-eec4bf6d784a', '8d30f02a-b1bd-58c4-9b3a-6c8ef6f88ce0', 'הקלוריות שלא מרגישים: כמה סוכר יש בכוס', 'שלב 1 – יסודות קלים', 10, true, '[טיוטת תסריט — לעריכה לפני צילום]
הקלוריות שלא מרגישים: כמה סוכר יש בכוס

משקאות ממותקים מוסיפים סוכר שלא מרגישים. החלפה אחת ביום בתחליף שאוהבים היא צעד קל עם השפעה גדולה.

בשיעור הזה: מה המחקר אומר, ולמה מתחילים בגרסה הכי קטנה.', 3, '[{"id": "t1", "emoji": "🥤", "title": "להחליף משקה ממותק אחד בתחליף", "description": "סודה עם לימון, מים עם פירות, תה קר בלי סוכר.", "schedule": "daily", "times_per_day": 1}]'::jsonb, '{"text": "ההתחייבות שלי לשבועיים הקרובים: להחליף משקה ממותק אחד בתחליף", "emoji": "🥤", "description": "מתחילים ברמה הכי קטנה. פספוס של יום לא מאפס כלום."}'::jsonb) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.task_definitions (stable_key, source, source_ref, step_id, habit_key, title, description, emoji, schedule, times_per_day, ladder, floor_level, max_level) values ('step:e71c47ae-17bd-5bc1-9d1e-eec4bf6d784a:t1', 'step', 't1', 'e71c47ae-17bd-5bc1-9d1e-eec4bf6d784a', 'drinks', 'להחליף משקה ממותק אחד בתחליף', 'סודה עם לימון, מים עם פירות, תה קר בלי סוכר.', '🥤', 'daily', 1, '[{"level": -1, "title": "החלפה אחת ביום", "times_per_day": 1}, {"level": 0, "title": "בלי משקאות ממותקים בבית", "times_per_day": 1}, {"level": 1, "title": "אפס משקאות ממותקים (כולל מיצים) 6 מתוך 7 ימים", "times_per_day": 1}]'::jsonb, -1, 1) on conflict (stable_key) do update set ladder=excluded.ladder, habit_key=excluded.habit_key, floor_level=-1, max_level=1;
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('28dd0b04-2a9d-5128-89fb-b222d962d728', '8d30f02a-b1bd-58c4-9b3a-6c8ef6f88ce0', 'תחליף שאוהבים: סודה עם לימון, מים בטעמים טבעיים, תה קר', 'שלב 1 – יסודות קלים', 11, true, '[טיוטת תסריט — לעריכה לפני צילום]
תחליף שאוהבים: סודה עם לימון, מים בטעמים טבעיים, תה קר

בשיעור הזה בונים את העוגן: אחרי איזו פעולה קבועה ביום עושים את ההרגל, ואיך מכינים את הסביבה כדי שיהיה קל.

בסוף השיעור בוחרים עוגן אחד ומספרים לאלמוג.', 3, '[]'::jsonb, null) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('43a73ce5-52f9-5047-a85c-65ce37cf1663', '8d30f02a-b1bd-58c4-9b3a-6c8ef6f88ce0', 'מכשולים: קפה עם סוכר, מיצים "בריאים", אירועים', 'שלב 1 – יסודות קלים', 12, true, '[טיוטת תסריט — לעריכה לפני צילום]
מכשולים: קפה עם סוכר, מיצים "בריאים", אירועים

בשיעור הזה עוברים על המכשולים הנפוצים ובונים משפט אם–אז אחד: "אם ___, אז ___".

פספוס של יום לא מאפס כלום — חוזרים מחר.', 3, '[]'::jsonb, null) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.journey_stations (id, title, description, sort_order, habit_key, track, is_foundation) values ('7044796b-333c-5540-808a-7aabf28c74c9', 'חצי צלחת ירקות', 'שיטת הצלחת: חצי ירקות, רבע חלבון, רבע פחמימה. ירקות מוסיפים נפח, סיבים ושובע.', 4, 'vegetables', 'main', false) on conflict (id) do update set title=excluded.title, description=excluded.description, sort_order=excluded.sort_order, habit_key=excluded.habit_key, track='main';
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('b8924809-46c6-5f07-a078-7485fda006fa', '7044796b-333c-5540-808a-7aabf28c74c9', 'שיטת הצלחת: חצי, רבע, רבע', 'שלב 2 – הצלחת והתנועה', 13, true, '[טיוטת תסריט — לעריכה לפני צילום]
שיטת הצלחת: חצי, רבע, רבע

שיטת הצלחת: חצי ירקות, רבע חלבון, רבע פחמימה. ירקות מוסיפים נפח, סיבים ושובע.

בשיעור הזה: מה המחקר אומר, ולמה מתחילים בגרסה הכי קטנה.', 3, '[{"id": "t1", "emoji": "🥗", "title": "ארוחה אחת שבה חצי צלחת ירקות", "description": "אפשר לצלם לאלמוג — לא חובה.", "schedule": "daily", "times_per_day": 1}]'::jsonb, '{"text": "ההתחייבות שלי לשבועיים הקרובים: ארוחה אחת שבה חצי צלחת ירקות", "emoji": "🥗", "description": "מתחילים ברמה הכי קטנה. פספוס של יום לא מאפס כלום."}'::jsonb) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.task_definitions (stable_key, source, source_ref, step_id, habit_key, title, description, emoji, schedule, times_per_day, ladder, floor_level, max_level) values ('step:b8924809-46c6-5f07-a078-7485fda006fa:t1', 'step', 't1', 'b8924809-46c6-5f07-a078-7485fda006fa', 'vegetables', 'ארוחה אחת שבה חצי צלחת ירקות', 'אפשר לצלם לאלמוג — לא חובה.', '🥗', 'daily', 1, '[{"level": -1, "title": "ירק אחד בארוחה העיקרית", "times_per_day": 1}, {"level": 0, "title": "חצי צלחת ירקות בארוחה אחת", "times_per_day": 1}, {"level": 1, "title": "חצי צלחת בשתי ארוחות, או סלט ראשון לפני הארוחה", "times_per_day": 1}]'::jsonb, -1, 1) on conflict (stable_key) do update set ladder=excluded.ladder, habit_key=excluded.habit_key, floor_level=-1, max_level=1;
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('abbfb6fe-78bb-5b2d-af50-82b69a854a84', '7044796b-333c-5540-808a-7aabf28c74c9', 'ירקות בלי מאמץ: קפואים, חתוכים מראש, סלט ראשון', 'שלב 2 – הצלחת והתנועה', 14, true, '[טיוטת תסריט — לעריכה לפני צילום]
ירקות בלי מאמץ: קפואים, חתוכים מראש, סלט ראשון

בשיעור הזה בונים את העוגן: אחרי איזו פעולה קבועה ביום עושים את ההרגל, ואיך מכינים את הסביבה כדי שיהיה קל.

בסוף השיעור בוחרים עוגן אחד ומספרים לאלמוג.', 3, '[]'::jsonb, null) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('09f449e3-a2ae-58a4-9998-c76f7516bcc6', '7044796b-333c-5540-808a-7aabf28c74c9', 'מכשולים: רטבים, "אני לא אוהב ירקות", ארוחות בחוץ', 'שלב 2 – הצלחת והתנועה', 15, true, '[טיוטת תסריט — לעריכה לפני צילום]
מכשולים: רטבים, "אני לא אוהב ירקות", ארוחות בחוץ

בשיעור הזה עוברים על המכשולים הנפוצים ובונים משפט אם–אז אחד: "אם ___, אז ___".

פספוס של יום לא מאפס כלום — חוזרים מחר.', 3, '[]'::jsonb, null) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.journey_stations (id, title, description, sort_order, habit_key, track, is_foundation) values ('6a668d51-152c-5ad1-b786-023e3449cd73', 'הליכה יומית', 'לא צריך חדר כושר: הליכה קבועה אחרי עוגן יומי היא אחד ההרגלים הכי בני-קיימא.', 5, 'walking', 'main', false) on conflict (id) do update set title=excluded.title, description=excluded.description, sort_order=excluded.sort_order, habit_key=excluded.habit_key, track='main';
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('8ca212e2-93c1-5b14-b4e9-3a1676e78b2c', '6a668d51-152c-5ad1-b786-023e3449cd73', 'לא צריך חדר כושר: כוחה של הליכה', 'שלב 2 – הצלחת והתנועה', 16, true, '[טיוטת תסריט — לעריכה לפני צילום]
לא צריך חדר כושר: כוחה של הליכה

לא צריך חדר כושר: הליכה קבועה אחרי עוגן יומי היא אחד ההרגלים הכי בני-קיימא.

בשיעור הזה: מה המחקר אומר, ולמה מתחילים בגרסה הכי קטנה.', 3, '[{"id": "t1", "emoji": "🚶", "title": "הליכה קצרה מיד אחרי עוגן קבוע", "description": "למשל אחרי ארוחת הערב או בזמן שיחת טלפון.", "schedule": "daily", "times_per_day": 1}]'::jsonb, '{"text": "ההתחייבות שלי לשבועיים הקרובים: הליכה קצרה מיד אחרי עוגן קבוע", "emoji": "🚶", "description": "מתחילים ברמה הכי קטנה. פספוס של יום לא מאפס כלום."}'::jsonb) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.task_definitions (stable_key, source, source_ref, step_id, habit_key, title, description, emoji, schedule, times_per_day, ladder, floor_level, max_level) values ('step:8ca212e2-93c1-5b14-b4e9-3a1676e78b2c:t1', 'step', 't1', '8ca212e2-93c1-5b14-b4e9-3a1676e78b2c', 'walking', 'הליכה קצרה מיד אחרי עוגן קבוע', 'למשל אחרי ארוחת הערב או בזמן שיחת טלפון.', '🚶', 'daily', 1, '[{"level": -1, "title": "5 דקות הליכה ביום", "times_per_day": 1}, {"level": 0, "title": "15–20 דקות הליכה ביום", "times_per_day": 1}, {"level": 1, "title": "30 דקות הליכה ביום (לפי גיל וכושר)", "times_per_day": 1}]'::jsonb, -1, 1) on conflict (stable_key) do update set ladder=excluded.ladder, habit_key=excluded.habit_key, floor_level=-1, max_level=1;
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('e5a65e3b-548a-5c61-bdbe-2bc5ae329e79', '6a668d51-152c-5ad1-b786-023e3449cd73', 'הקו הבסיסי שלך: לספור קודם ולהעלות אחר כך', 'שלב 2 – הצלחת והתנועה', 17, true, '[טיוטת תסריט — לעריכה לפני צילום]
הקו הבסיסי שלך: לספור קודם ולהעלות אחר כך

בשיעור הזה בונים את העוגן: אחרי איזו פעולה קבועה ביום עושים את ההרגל, ואיך מכינים את הסביבה כדי שיהיה קל.

בסוף השיעור בוחרים עוגן אחד ומספרים לאלמוג.', 3, '[]'::jsonb, null) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('8fd67073-aa9f-51d6-93ab-a32e6b7f1907', '6a668d51-152c-5ad1-b786-023e3449cd73', 'מכשולים: חום, ישיבה ממושכת, "אין זמן"', 'שלב 2 – הצלחת והתנועה', 18, true, '[טיוטת תסריט — לעריכה לפני צילום]
מכשולים: חום, ישיבה ממושכת, "אין זמן"

בשיעור הזה עוברים על המכשולים הנפוצים ובונים משפט אם–אז אחד: "אם ___, אז ___".

פספוס של יום לא מאפס כלום — חוזרים מחר.', 3, '[]'::jsonb, null) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.journey_stations (id, title, description, sort_order, habit_key, track, is_foundation) values ('0a3dfcfb-d893-5936-bd41-58d3d359735a', 'אכילה איטית', 'תחושת השובע מגיעה באיחור. האטה קטנה בארוחה נותנת לגוף זמן להרגיש מתי מספיק.', 6, 'slow_eating', 'main', false) on conflict (id) do update set title=excluded.title, description=excluded.description, sort_order=excluded.sort_order, habit_key=excluded.habit_key, track='main';
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('150c0d77-ba74-5881-9109-e629d0f71c93', '0a3dfcfb-d893-5936-bd41-58d3d359735a', 'המוח מאחר: למה כדאי להאט', 'שלב 2 – הצלחת והתנועה', 19, true, '[טיוטת תסריט — לעריכה לפני צילום]
המוח מאחר: למה כדאי להאט

תחושת השובע מגיעה באיחור. האטה קטנה בארוחה נותנת לגוף זמן להרגיש מתי מספיק.

בשיעור הזה: מה המחקר אומר, ולמה מתחילים בגרסה הכי קטנה.', 3, '[{"id": "t1", "emoji": "🐢", "title": "ארוחה אחת ביום בהאטה מכוונת", "description": "אפשר להיעזר בטיימר.", "schedule": "daily", "times_per_day": 1}]'::jsonb, '{"text": "ההתחייבות שלי לשבועיים הקרובים: ארוחה אחת ביום בהאטה מכוונת", "emoji": "🐢", "description": "מתחילים ברמה הכי קטנה. פספוס של יום לא מאפס כלום."}'::jsonb) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.task_definitions (stable_key, source, source_ref, step_id, habit_key, title, description, emoji, schedule, times_per_day, ladder, floor_level, max_level) values ('step:150c0d77-ba74-5881-9109-e629d0f71c93:t1', 'step', 't1', '150c0d77-ba74-5881-9109-e629d0f71c93', 'slow_eating', 'ארוחה אחת ביום בהאטה מכוונת', 'אפשר להיעזר בטיימר.', '🐢', 'daily', 1, '[{"level": -1, "title": "להניח את הסכו״ם 3 פעמים בארוחה", "times_per_day": 1}, {"level": 0, "title": "ארוחה אחת של 15 דקות ומעלה", "times_per_day": 1}, {"level": 1, "title": "ארוחה עיקרית של 20 דקות ומעלה בלי מסך", "times_per_day": 1}]'::jsonb, -1, 1) on conflict (stable_key) do update set ladder=excluded.ladder, habit_key=excluded.habit_key, floor_level=-1, max_level=1;
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('48ae3cad-cfa5-5d91-9a90-41135aaa6e27', '0a3dfcfb-d893-5936-bd41-58d3d359735a', '3 טריקים: להניח סכו״ם בין ביסים, ללעוס יותר, ארוחה של 20 דקות', 'שלב 2 – הצלחת והתנועה', 20, true, '[טיוטת תסריט — לעריכה לפני צילום]
3 טריקים: להניח סכו״ם בין ביסים, ללעוס יותר, ארוחה של 20 דקות

בשיעור הזה בונים את העוגן: אחרי איזו פעולה קבועה ביום עושים את ההרגל, ואיך מכינים את הסביבה כדי שיהיה קל.

בסוף השיעור בוחרים עוגן אחד ומספרים לאלמוג.', 3, '[]'::jsonb, null) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('5262782b-a989-5241-b350-c72f621230b1', '0a3dfcfb-d893-5936-bd41-58d3d359735a', 'מכשולים: ארוחה מול מסך, בעבודה, עם ילדים', 'שלב 2 – הצלחת והתנועה', 21, true, '[טיוטת תסריט — לעריכה לפני צילום]
מכשולים: ארוחה מול מסך, בעבודה, עם ילדים

בשיעור הזה עוברים על המכשולים הנפוצים ובונים משפט אם–אז אחד: "אם ___, אז ___".

פספוס של יום לא מאפס כלום — חוזרים מחר.', 3, '[]'::jsonb, null) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.journey_stations (id, title, description, sort_order, habit_key, track, is_foundation) values ('d210ea17-572f-5553-819b-ecb473b94771', 'סולם רעב ושובע', 'סולם 1–10 עוזר לזהות רעב אמיתי ושובע נעים, ולהבדיל בין רעב פיזי לרגשי.', 7, 'hunger', 'main', false) on conflict (id) do update set title=excluded.title, description=excluded.description, sort_order=excluded.sort_order, habit_key=excluded.habit_key, track='main';
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('086669a1-ac89-5c90-92a4-1a436f645b0a', 'd210ea17-572f-5553-819b-ecb473b94771', 'סולם 1–10: איך נשמע רעב אמיתי', 'שלב 3 – אכילה קשובה וסביבה', 22, true, '[טיוטת תסריט — לעריכה לפני צילום]
סולם 1–10: איך נשמע רעב אמיתי

סולם 1–10 עוזר לזהות רעב אמיתי ושובע נעים, ולהבדיל בין רעב פיזי לרגשי.

בשיעור הזה: מה המחקר אומר, ולמה מתחילים בגרסה הכי קטנה.', 3, '[{"id": "t1", "emoji": "🧘", "title": "לדרג רעב לפני ארוחה אחת ואחריה", "description": "מספר אחד מ-1 עד 10, בלי שיפוט.", "schedule": "daily", "times_per_day": 1}]'::jsonb, '{"text": "ההתחייבות שלי לשבועיים הקרובים: לדרג רעב לפני ארוחה אחת ואחריה", "emoji": "🧘", "description": "מתחילים ברמה הכי קטנה. פספוס של יום לא מאפס כלום."}'::jsonb) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.task_definitions (stable_key, source, source_ref, step_id, habit_key, title, description, emoji, schedule, times_per_day, ladder, floor_level, max_level) values ('step:086669a1-ac89-5c90-92a4-1a436f645b0a:t1', 'step', 't1', '086669a1-ac89-5c90-92a4-1a436f645b0a', 'hunger', 'לדרג רעב לפני ארוחה אחת ואחריה', 'מספר אחד מ-1 עד 10, בלי שיפוט.', '🧘', 'daily', 1, '[{"level": -1, "title": "דירוג לפני ארוחה אחת", "times_per_day": 1}, {"level": 0, "title": "דירוג לפני ואחרי ארוחה אחת", "times_per_day": 1}, {"level": 1, "title": "לעצור ב-7 (שובע נעים) ברוב הארוחות", "times_per_day": 1}]'::jsonb, -1, 1) on conflict (stable_key) do update set ladder=excluded.ladder, habit_key=excluded.habit_key, floor_level=-1, max_level=1;
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('c4157ba6-4866-5744-8aab-5f1b9c631bb7', 'd210ea17-572f-5553-819b-ecb473b94771', 'עצירה באמצע: הבדיקה של "איפה אני עכשיו?"', 'שלב 3 – אכילה קשובה וסביבה', 23, true, '[טיוטת תסריט — לעריכה לפני צילום]
עצירה באמצע: הבדיקה של "איפה אני עכשיו?"

בשיעור הזה בונים את העוגן: אחרי איזו פעולה קבועה ביום עושים את ההרגל, ואיך מכינים את הסביבה כדי שיהיה קל.

בסוף השיעור בוחרים עוגן אחד ומספרים לאלמוג.', 3, '[]'::jsonb, null) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('f8e7aeab-fa36-5f1c-904f-311351e5985b', 'd210ea17-572f-5553-819b-ecb473b94771', 'רעב פיזי או רגשי? שאלה אחת שמבדילה', 'שלב 3 – אכילה קשובה וסביבה', 24, true, '[טיוטת תסריט — לעריכה לפני צילום]
רעב פיזי או רגשי? שאלה אחת שמבדילה

בשיעור הזה עוברים על המכשולים הנפוצים ובונים משפט אם–אז אחד: "אם ___, אז ___".

פספוס של יום לא מאפס כלום — חוזרים מחר.', 3, '[]'::jsonb, null) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.journey_stations (id, title, description, sort_order, habit_key, track, is_foundation) values ('3b3e74c7-6843-513d-b64e-76307889c01d', 'סביבת אוכל חכמה', 'מה שרואים זה מה שאוכלים. שינויים קטנים בבית עושים את הבחירה הטובה לקלה יותר.', 8, 'environment', 'main', false) on conflict (id) do update set title=excluded.title, description=excluded.description, sort_order=excluded.sort_order, habit_key=excluded.habit_key, track='main';
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('d2799736-d48b-556c-8af4-0698b01d0b13', '3b3e74c7-6843-513d-b64e-76307889c01d', 'הבית מחליט בשבילך: מה רואים זה מה שאוכלים', 'שלב 3 – אכילה קשובה וסביבה', 25, true, '[טיוטת תסריט — לעריכה לפני צילום]
הבית מחליט בשבילך: מה רואים זה מה שאוכלים

מה שרואים זה מה שאוכלים. שינויים קטנים בבית עושים את הבחירה הטובה לקלה יותר.

בשיעור הזה: מה המחקר אומר, ולמה מתחילים בגרסה הכי קטנה.', 3, '[{"id": "t1", "emoji": "🏠", "title": "פעולת סביבה אחת ביום", "description": "להזיז, להסתיר או לחלק למנות.", "schedule": "daily", "times_per_day": 1}]'::jsonb, '{"text": "ההתחייבות שלי לשבועיים הקרובים: פעולת סביבה אחת ביום", "emoji": "🏠", "description": "מתחילים ברמה הכי קטנה. פספוס של יום לא מאפס כלום."}'::jsonb) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.task_definitions (stable_key, source, source_ref, step_id, habit_key, title, description, emoji, schedule, times_per_day, ladder, floor_level, max_level) values ('step:d2799736-d48b-556c-8af4-0698b01d0b13:t1', 'step', 't1', 'd2799736-d48b-556c-8af4-0698b01d0b13', 'environment', 'פעולת סביבה אחת ביום', 'להזיז, להסתיר או לחלק למנות.', '🏠', 'daily', 1, '[{"level": -1, "title": "שינוי אחד (למשל קערת פירות על השיש)", "times_per_day": 1}, {"level": 0, "title": "צלחת או קערה קטנה יותר בארוחת הערב", "times_per_day": 1}, {"level": 1, "title": "החטיף הבעייתי לא נכנס הביתה, ומנות מחולקות מראש", "times_per_day": 1}]'::jsonb, -1, 1) on conflict (stable_key) do update set ladder=excluded.ladder, habit_key=excluded.habit_key, floor_level=-1, max_level=1;
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('c71d1a47-68e6-5188-9f52-50ccf85e224e', '3b3e74c7-6843-513d-b64e-76307889c01d', 'מבצע מטבח: פירות בגובה העיניים, חטיפים בארון גבוה, צלחת קטנה', 'שלב 3 – אכילה קשובה וסביבה', 26, true, '[טיוטת תסריט — לעריכה לפני צילום]
מבצע מטבח: פירות בגובה העיניים, חטיפים בארון גבוה, צלחת קטנה

בשיעור הזה בונים את העוגן: אחרי איזו פעולה קבועה ביום עושים את ההרגל, ואיך מכינים את הסביבה כדי שיהיה קל.

בסוף השיעור בוחרים עוגן אחד ומספרים לאלמוג.', 3, '[]'::jsonb, null) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('29018926-3c5b-5f4a-a895-95d928dc230d', '3b3e74c7-6843-513d-b64e-76307889c01d', 'מכשולים: בני בית, עבודה, חטיפים במשרד', 'שלב 3 – אכילה קשובה וסביבה', 27, true, '[טיוטת תסריט — לעריכה לפני צילום]
מכשולים: בני בית, עבודה, חטיפים במשרד

בשיעור הזה עוברים על המכשולים הנפוצים ובונים משפט אם–אז אחד: "אם ___, אז ___".

פספוס של יום לא מאפס כלום — חוזרים מחר.', 3, '[]'::jsonb, null) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.journey_stations (id, title, description, sort_order, habit_key, track, is_foundation) values ('7258d6af-3fdf-5273-8501-d45bc20918f0', 'תכנון ארוחות שבועי', '10 דקות תכנון בשבוע חוסכות הרבה החלטות קשות באמצע היום.', 9, 'planning', 'main', false) on conflict (id) do update set title=excluded.title, description=excluded.description, sort_order=excluded.sort_order, habit_key=excluded.habit_key, track='main';
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('9c0de1ef-78aa-5a69-a554-14963afda2df', '7258d6af-3fdf-5273-8501-d45bc20918f0', '10 דקות בשבוע שחוסכות 10 החלטות ביום', 'שלב 3 – אכילה קשובה וסביבה', 28, true, '[טיוטת תסריט — לעריכה לפני צילום]
10 דקות בשבוע שחוסכות 10 החלטות ביום

10 דקות תכנון בשבוע חוסכות הרבה החלטות קשות באמצע היום.

בשיעור הזה: מה המחקר אומר, ולמה מתחילים בגרסה הכי קטנה.', 3, '[{"id": "t1", "emoji": "📋", "title": "לבדוק בבוקר מה מתוכנן לאכול היום", "description": "טאפ אחד. פעם בשבוע — מפגש תכנון קצר.", "schedule": "daily", "times_per_day": 1}]'::jsonb, '{"text": "ההתחייבות שלי לשבועיים הקרובים: לבדוק בבוקר מה מתוכנן לאכול היום", "emoji": "📋", "description": "מתחילים ברמה הכי קטנה. פספוס של יום לא מאפס כלום."}'::jsonb) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.task_definitions (stable_key, source, source_ref, step_id, habit_key, title, description, emoji, schedule, times_per_day, ladder, floor_level, max_level) values ('step:9c0de1ef-78aa-5a69-a554-14963afda2df:t1', 'step', 't1', '9c0de1ef-78aa-5a69-a554-14963afda2df', 'planning', 'לבדוק בבוקר מה מתוכנן לאכול היום', 'טאפ אחד. פעם בשבוע — מפגש תכנון קצר.', '📋', 'daily', 1, '[{"level": -1, "title": "לתכנן את ארוחת הערב של מחר", "times_per_day": 1}, {"level": 0, "title": "לתכנן 3 ארוחות ערב בשבוע + רשימת קניות", "times_per_day": 1}, {"level": 1, "title": "תכנון שבועי מלא + הכנה מראש פעם בשבוע", "times_per_day": 1}]'::jsonb, -1, 1) on conflict (stable_key) do update set ladder=excluded.ladder, habit_key=excluded.habit_key, floor_level=-1, max_level=1;
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('c01dcbab-89a3-57de-8917-a05943ead285', '7258d6af-3fdf-5273-8501-d45bc20918f0', 'תבנית: 3 ארוחות ערב קבועות + 2 גמישות + רשימת קניות', 'שלב 3 – אכילה קשובה וסביבה', 29, true, '[טיוטת תסריט — לעריכה לפני צילום]
תבנית: 3 ארוחות ערב קבועות + 2 גמישות + רשימת קניות

בשיעור הזה בונים את העוגן: אחרי איזו פעולה קבועה ביום עושים את ההרגל, ואיך מכינים את הסביבה כדי שיהיה קל.

בסוף השיעור בוחרים עוגן אחד ומספרים לאלמוג.', 3, '[]'::jsonb, null) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('bbc4ee16-c9ae-567c-99a3-086251777383', '7258d6af-3fdf-5273-8501-d45bc20918f0', 'מכשולים: שינויים ברגע האחרון, משפחה, תקציב', 'שלב 3 – אכילה קשובה וסביבה', 30, true, '[טיוטת תסריט — לעריכה לפני צילום]
מכשולים: שינויים ברגע האחרון, משפחה, תקציב

בשיעור הזה עוברים על המכשולים הנפוצים ובונים משפט אם–אז אחד: "אם ___, אז ___".

פספוס של יום לא מאפס כלום — חוזרים מחר.', 3, '[]'::jsonb, null) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.journey_stations (id, title, description, sort_order, habit_key, track, is_foundation) values ('a5eb2b35-369c-53e2-a0f4-0a13a50ec982', 'שגרת שינה', 'עייפות מגבירה רעב וחשקים. שגרת שינה קבועה היא חלק מהתוכנית, לא תוספת.', 10, 'sleep', 'main', false) on conflict (id) do update set title=excluded.title, description=excluded.description, sort_order=excluded.sort_order, habit_key=excluded.habit_key, track='main';
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('e913cc9c-86fb-5cd0-916a-917a52713a98', 'a5eb2b35-369c-53e2-a0f4-0a13a50ec982', 'שינה היא חלק מהתוכנית: מה עייפות עושה לרעב', 'שלב 4 – הגוף והראש', 31, true, '[טיוטת תסריט — לעריכה לפני צילום]
שינה היא חלק מהתוכנית: מה עייפות עושה לרעב

עייפות מגבירה רעב וחשקים. שגרת שינה קבועה היא חלק מהתוכנית, לא תוספת.

בשיעור הזה: מה המחקר אומר, ולמה מתחילים בגרסה הכי קטנה.', 3, '[{"id": "t1", "emoji": "😴", "title": "שעת כיבוי: מסך מחוץ למיטה בשעה שנבחרה", "description": "בוחרים שעה אחת וחוזרים עליה.", "schedule": "daily", "times_per_day": 1}]'::jsonb, '{"text": "ההתחייבות שלי לשבועיים הקרובים: שעת כיבוי: מסך מחוץ למיטה בשעה שנבחרה", "emoji": "😴", "description": "מתחילים ברמה הכי קטנה. פספוס של יום לא מאפס כלום."}'::jsonb) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.task_definitions (stable_key, source, source_ref, step_id, habit_key, title, description, emoji, schedule, times_per_day, ladder, floor_level, max_level) values ('step:e913cc9c-86fb-5cd0-916a-917a52713a98:t1', 'step', 't1', 'e913cc9c-86fb-5cd0-916a-917a52713a98', 'sleep', 'שעת כיבוי: מסך מחוץ למיטה בשעה שנבחרה', 'בוחרים שעה אחת וחוזרים עליה.', '😴', 'daily', 1, '[{"level": -1, "title": "שעת כיבוי 15 דקות לפני השינה", "times_per_day": 1}, {"level": 0, "title": "ללכת לישון 30 דקות מוקדם יותר", "times_per_day": 1}, {"level": 1, "title": "שעת שינה והשכמה קבועות (סטייה של עד 30 דקות)", "times_per_day": 1}]'::jsonb, -1, 1) on conflict (stable_key) do update set ladder=excluded.ladder, habit_key=excluded.habit_key, floor_level=-1, max_level=1;
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('ee88663c-38e3-5dbb-8c43-3f29bd08eebe', 'a5eb2b35-369c-53e2-a0f4-0a13a50ec982', 'טקס כיבוי: מסכים, אור ושעה קבועה', 'שלב 4 – הגוף והראש', 32, true, '[טיוטת תסריט — לעריכה לפני צילום]
טקס כיבוי: מסכים, אור ושעה קבועה

בשיעור הזה בונים את העוגן: אחרי איזו פעולה קבועה ביום עושים את ההרגל, ואיך מכינים את הסביבה כדי שיהיה קל.

בסוף השיעור בוחרים עוגן אחד ומספרים לאלמוג.', 3, '[]'::jsonb, null) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('afcce200-495a-52cf-b25e-ac03dda1aca3', 'a5eb2b35-369c-53e2-a0f4-0a13a50ec982', 'מכשולים: ילדים, משמרות, "רק עוד פרק"', 'שלב 4 – הגוף והראש', 33, true, '[טיוטת תסריט — לעריכה לפני צילום]
מכשולים: ילדים, משמרות, "רק עוד פרק"

בשיעור הזה עוברים על המכשולים הנפוצים ובונים משפט אם–אז אחד: "אם ___, אז ___".

פספוס של יום לא מאפס כלום — חוזרים מחר.', 3, '[]'::jsonb, null) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.journey_stations (id, title, description, sort_order, habit_key, track, is_foundation) values ('0d1cdea5-1f34-502d-bdcf-6611d122e3e6', 'יותר אוכל אמיתי', 'בלי פאניקה: החלפה אחת ביום של מוצר אולטרה-מעובד במזון מלא מצטברת לשינוי גדול.', 11, 'whole_food', 'main', false) on conflict (id) do update set title=excluded.title, description=excluded.description, sort_order=excluded.sort_order, habit_key=excluded.habit_key, track='main';
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('d3896f38-3507-5498-a23b-914a43aba85f', '0d1cdea5-1f34-502d-bdcf-6611d122e3e6', 'מה זה בכלל "אולטרה-מעובד"? (בלי פאניקה)', 'שלב 4 – הגוף והראש', 34, true, '[טיוטת תסריט — לעריכה לפני צילום]
מה זה בכלל "אולטרה-מעובד"? (בלי פאניקה)

בלי פאניקה: החלפה אחת ביום של מוצר אולטרה-מעובד במזון מלא מצטברת לשינוי גדול.

בשיעור הזה: מה המחקר אומר, ולמה מתחילים בגרסה הכי קטנה.', 3, '[{"id": "t1", "emoji": "🍎", "title": "החלפה אחת של מוצר אולטרה-מעובד במזון מלא", "description": "מה שקל וזמין היום.", "schedule": "daily", "times_per_day": 1}]'::jsonb, '{"text": "ההתחייבות שלי לשבועיים הקרובים: החלפה אחת של מוצר אולטרה-מעובד במזון מלא", "emoji": "🍎", "description": "מתחילים ברמה הכי קטנה. פספוס של יום לא מאפס כלום."}'::jsonb) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.task_definitions (stable_key, source, source_ref, step_id, habit_key, title, description, emoji, schedule, times_per_day, ladder, floor_level, max_level) values ('step:d3896f38-3507-5498-a23b-914a43aba85f:t1', 'step', 't1', 'd3896f38-3507-5498-a23b-914a43aba85f', 'whole_food', 'החלפה אחת של מוצר אולטרה-מעובד במזון מלא', 'מה שקל וזמין היום.', '🍎', 'daily', 1, '[{"level": -1, "title": "החלפה אחת ביום", "times_per_day": 1}, {"level": 0, "title": "ארוחה אחת ביום שכולה מזון מלא", "times_per_day": 1}, {"level": 1, "title": "רוב הארוחות ממזון מלא; אולטרה-מעובד רק בתכנון", "times_per_day": 1}]'::jsonb, -1, 1) on conflict (stable_key) do update set ladder=excluded.ladder, habit_key=excluded.habit_key, floor_level=-1, max_level=1;
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('69b790ed-8ad6-5e6a-9d96-aa78ec4fc2ac', '0d1cdea5-1f34-502d-bdcf-6611d122e3e6', 'החלפה אחת ביום: חטיף ← פרי ואגוזים, דגני בוקר ← שיבולת שועל', 'שלב 4 – הגוף והראש', 35, true, '[טיוטת תסריט — לעריכה לפני צילום]
החלפה אחת ביום: חטיף ← פרי ואגוזים, דגני בוקר ← שיבולת שועל

בשיעור הזה בונים את העוגן: אחרי איזו פעולה קבועה ביום עושים את ההרגל, ואיך מכינים את הסביבה כדי שיהיה קל.

בסוף השיעור בוחרים עוגן אחד ומספרים לאלמוג.', 3, '[]'::jsonb, null) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('373f0438-0643-58f9-b429-b30aba940d8a', '0d1cdea5-1f34-502d-bdcf-6611d122e3e6', 'מכשולים: מחיר, נוחות, ילדים', 'שלב 4 – הגוף והראש', 36, true, '[טיוטת תסריט — לעריכה לפני צילום]
מכשולים: מחיר, נוחות, ילדים

בשיעור הזה עוברים על המכשולים הנפוצים ובונים משפט אם–אז אחד: "אם ___, אז ___".

פספוס של יום לא מאפס כלום — חוזרים מחר.', 3, '[]'::jsonb, null) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.journey_stations (id, title, description, sort_order, habit_key, track, is_foundation) values ('4b968892-ab74-5e04-af9f-cc806b66e365', 'ניהול סטרס ואכילה רגשית', 'בלחץ מתחשק דווקא מתוק. ארגז כלים של 3 דקות נותן דרך אחרת להירגע.', 12, 'stress', 'main', false) on conflict (id) do update set title=excluded.title, description=excluded.description, sort_order=excluded.sort_order, habit_key=excluded.habit_key, track='main';
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('19db9eed-0a43-5cc9-a71a-4ae572c0b074', '4b968892-ab74-5e04-af9f-cc806b66e365', 'למה בלחץ מתחשק דווקא מתוק', 'שלב 4 – הגוף והראש', 37, true, '[טיוטת תסריט — לעריכה לפני צילום]
למה בלחץ מתחשק דווקא מתוק

בלחץ מתחשק דווקא מתוק. ארגז כלים של 3 דקות נותן דרך אחרת להירגע.

בשיעור הזה: מה המחקר אומר, ולמה מתחילים בגרסה הכי קטנה.', 3, '[{"id": "t1", "emoji": "🌬️", "title": "2–3 דקות נשימה או עצירה בעוגן קבוע", "description": "או כשמתעורר דחף לאכול בלי רעב.", "schedule": "daily", "times_per_day": 1}]'::jsonb, '{"text": "ההתחייבות שלי לשבועיים הקרובים: 2–3 דקות נשימה או עצירה בעוגן קבוע", "emoji": "🌬️", "description": "מתחילים ברמה הכי קטנה. פספוס של יום לא מאפס כלום."}'::jsonb) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.task_definitions (stable_key, source, source_ref, step_id, habit_key, title, description, emoji, schedule, times_per_day, ladder, floor_level, max_level) values ('step:19db9eed-0a43-5cc9-a71a-4ae572c0b074:t1', 'step', 't1', '19db9eed-0a43-5cc9-a71a-4ae572c0b074', 'stress', '2–3 דקות נשימה או עצירה בעוגן קבוע', 'או כשמתעורר דחף לאכול בלי רעב.', '🌬️', 'daily', 1, '[{"level": -1, "title": "3 נשימות עמוקות לפני פתיחת המקרר אחרי יום עבודה", "times_per_day": 1}, {"level": 0, "title": "תרגול יומי של 3 דקות", "times_per_day": 1}, {"level": 1, "title": "זיהוי טריגר ושימוש בכלי חלופי לפני אכילה רגשית, ברוב המקרים", "times_per_day": 1}]'::jsonb, -1, 1) on conflict (stable_key) do update set ladder=excluded.ladder, habit_key=excluded.habit_key, floor_level=-1, max_level=1;
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('ebcb765f-fc51-5d75-92d2-9c50bb82cc4f', '4b968892-ab74-5e04-af9f-cc806b66e365', 'ארגז כלים של 3 דקות: נשימה, הליכה קצרה, שיחה, כתיבה', 'שלב 4 – הגוף והראש', 38, true, '[טיוטת תסריט — לעריכה לפני צילום]
ארגז כלים של 3 דקות: נשימה, הליכה קצרה, שיחה, כתיבה

בשיעור הזה בונים את העוגן: אחרי איזו פעולה קבועה ביום עושים את ההרגל, ואיך מכינים את הסביבה כדי שיהיה קל.

בסוף השיעור בוחרים עוגן אחד ומספרים לאלמוג.', 3, '[]'::jsonb, null) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('0ff1c252-e85a-59e7-b485-16d3fd85949d', '4b968892-ab74-5e04-af9f-cc806b66e365', 'תוכנית אם–אז לרגע הקשה שלי', 'שלב 4 – הגוף והראש', 39, true, '[טיוטת תסריט — לעריכה לפני צילום]
תוכנית אם–אז לרגע הקשה שלי

בשיעור הזה עוברים על המכשולים הנפוצים ובונים משפט אם–אז אחד: "אם ___, אז ___".

פספוס של יום לא מאפס כלום — חוזרים מחר.', 3, '[]'::jsonb, null) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.journey_stations (id, title, description, sort_order, habit_key, track, is_foundation) values ('72e86406-ce41-5378-bfe2-dcc3009781cd', 'סיום: ההרגלים שלי', 'בוחרים את הרגלי העוגן לשימור ואת תדירות הבדיקה — תוכנית אישית להמשך.', 13, 'maintenance', 'main', false) on conflict (id) do update set title=excluded.title, description=excluded.description, sort_order=excluded.sort_order, habit_key=excluded.habit_key, track='main';
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('f8ab9914-2d87-5a9d-80ae-40f933a7a503', '72e86406-ce41-5378-bfe2-dcc3009781cd', 'מה למדנו: 12 הרגלים במבט אחד', 'סיום', 40, true, '[טיוטת תסריט — לעריכה לפני צילום]
מה למדנו: 12 הרגלים במבט אחד

בוחרים את הרגלי העוגן לשימור ואת תדירות הבדיקה — תוכנית אישית להמשך.

בשיעור הזה: מה המחקר אומר, ולמה מתחילים בגרסה הכי קטנה.', 3, '[{"id": "t1", "emoji": "🏁", "title": "לבחור 5 הרגלי עוגן לשימור", "description": "ולהחליט כל כמה זמן בודקים אותם.", "schedule": "one_time", "times_per_day": 1}]'::jsonb, '{"text": "ההתחייבות שלי לשבועיים הקרובים: לבחור 5 הרגלי עוגן לשימור", "emoji": "🏁", "description": "מתחילים ברמה הכי קטנה. פספוס של יום לא מאפס כלום."}'::jsonb) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.task_definitions (stable_key, source, source_ref, step_id, habit_key, title, description, emoji, schedule, times_per_day, ladder, floor_level, max_level) values ('step:f8ab9914-2d87-5a9d-80ae-40f933a7a503:t1', 'step', 't1', 'f8ab9914-2d87-5a9d-80ae-40f933a7a503', 'maintenance', 'לבחור 5 הרגלי עוגן לשימור', 'ולהחליט כל כמה זמן בודקים אותם.', '🏁', 'one_time', 1, '[{"level": -1, "title": "לבחור הרגל עוגן אחד לשימור", "times_per_day": 1}, {"level": 0, "title": "לבחור 3 הרגלי עוגן + תדירות בדיקה", "times_per_day": 1}, {"level": 1, "title": "לבחור 5 הרגלי עוגן + תדירות + תוכנית חזרה", "times_per_day": 1}]'::jsonb, -1, 1) on conflict (stable_key) do update set ladder=excluded.ladder, habit_key=excluded.habit_key, floor_level=-1, max_level=1;
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('f32dce09-caee-5946-adb6-88940c2977ed', '72e86406-ce41-5378-bfe2-dcc3009781cd', 'בוחרים 5 הרגלי עוגן לשימור', 'סיום', 41, true, '[טיוטת תסריט — לעריכה לפני צילום]
בוחרים 5 הרגלי עוגן לשימור

בשיעור הזה בונים את העוגן: אחרי איזו פעולה קבועה ביום עושים את ההרגל, ואיך מכינים את הסביבה כדי שיהיה קל.

בסוף השיעור בוחרים עוגן אחד ומספרים לאלמוג.', 3, '[]'::jsonb, null) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values ('ead0b457-f6ab-57c8-8d9b-f352a2cca3fa', '72e86406-ce41-5378-bfe2-dcc3009781cd', 'תוכנית השימור שלי: מתי בודקים ומה עושים כשמחליקים', 'סיום', 42, true, '[טיוטת תסריט — לעריכה לפני צילום]
תוכנית השימור שלי: מתי בודקים ומה עושים כשמחליקים

בשיעור הזה עוברים על המכשולים הנפוצים ובונים משפט אם–אז אחד: "אם ___, אז ___".

פספוס של יום לא מאפס כלום — חוזרים מחר.', 3, '[]'::jsonb, null) on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;
update public.journey_steps set step_number = 900 where id = '012af416-d33d-4e11-ae6c-0badd0c3e66d';
update public.journey_steps set station_id = (select id from public.journey_stations where track='legacy' order by sort_order limit 1) where id = '012af416-d33d-4e11-ae6c-0badd0c3e66d';
-- water lesson: neutral commitment wording (no slash forms) + habit key
update public.journey_steps set commitment = jsonb_set(commitment, '{text}', to_jsonb('ההתחייבות שלי לשבוע הקרוב: לשתות מים לפני ארוחות 💧'::text)) || jsonb_build_object('description','זה הרגל פשוט שלוקח פחות מדקה. מתחילים היום!') where id='a1b2c3d4-e5f6-7890-abcd-ef1234567890';
update public.task_definitions set habit_key='water' where stable_key like 'step:a1b2c3d4-e5f6-7890-abcd-ef1234567890:%';
