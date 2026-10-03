-- H8: תיקון שגיאת כתיב בתוכן שיעור — "ביחרתם" → "בחרתם"
UPDATE public.lessons
SET text_content = replace(text_content, 'ביחרתם', 'בחרתם')
WHERE text_content LIKE '%ביחרתם%';
