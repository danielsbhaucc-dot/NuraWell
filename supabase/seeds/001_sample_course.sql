-- =============================================
-- NuraWell - Sample Course Seed Data
-- Run this in Supabase SQL Editor
-- =============================================

-- ── COURSE ──────────────────────────────────
INSERT INTO public.courses (id, title, description, thumbnail_url, is_published, is_premium, sort_order)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'מסע לחיים בריאים – מדריך מלא לירידה במשקל',
  'קורס מקיף ומעשי לשינוי אורח חיים, ירידה במשקל בצורה בריאה ויצירת הרגלים שיחזיקו לאורך זמן. 6 שיעורים עוצמתיים עם וידאו, אודיו, מסמכים ומשימות יומיות.',
  NULL,
  TRUE,
  FALSE,
  1
);

-- ── LESSON 1: ברוכים הבאים (text + habits + tasks) ────
INSERT INTO public.lessons (id, course_id, title, description, lesson_type, text_content, tasks, habits, external_links, sort_order, is_published, duration_minutes)
VALUES (
  'aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'ברוכים הבאים – המסע שלכם מתחיל כאן',
  'הכרת הקורס, הגדרת יעדים אישיים ויצירת שגרת הצלחה.',
  'text',
  '<h2>ברוכים הבאים למסע שלכם!</h2>
<p>אנחנו שמחים שבחרתם להשקיע בעצמכם. הקורס הזה נבנה עם מחשבה, ידע מקצועי ואהבה אמיתית לתהליך — כדי שתוכלו לחיות טוב יותר, לרגיש טוב יותר ולהיות בריאים יותר.</p>
<h3>מה תלמדו בקורס?</h3>
<ul>
<li>עקרונות תזונה נכונה ומאוזנת</li>
<li>בניית שגרת פעילות גופנית מתאימה אישית</li>
<li>ניהול רגשות ואכילה רגשית</li>
<li>יצירת הרגלים שמחזיקים לאורך שנים</li>
<li>מעקב ומדידה של ההתקדמות שלכם</li>
</ul>
<blockquote>כל מסע מתחיל בצעד אחד. הצעד הראשון שלכם כבר נעשה — ביחרתם להתחיל.</blockquote>
<h3>איך להשתמש בקורס?</h3>
<p>כל שיעור בנוי מחלקים: תוכן עיוני, משימות מעשיות להיום, והרגלים לשבוע. השלימו כל שיעור לפני המעבר לשיעור הבא.</p>',
  '[
    {"id": "t1-1", "title": "כתבו 3 סיבות אישיות למה אתם רוצים לרדת במשקל", "description": "שמרו אותן במקום נגיש – הן יהיו המנוע שלכם", "is_required": true},
    {"id": "t1-2", "title": "קבעו יעד משקל ריאליסטי ל-3 חודשים הקרובים", "description": "יעד בריא: 0.5-1 ק''ג בשבוע", "is_required": true},
    {"id": "t1-3", "title": "שתפו מישהו קרוב שתתחילו את המסע", "description": "תמיכה חברתית משפרת הצלחה ב-70%", "is_required": false}
  ]'::jsonb,
  '[
    {"id": "h1-1", "title": "שתיית 8 כוסות מים ביום", "emoji": "💧", "frequency": "daily"},
    {"id": "h1-2", "title": "שקילה בוקרית ורישום", "emoji": "⚖️", "frequency": "daily"}
  ]'::jsonb,
  '[
    {"id": "l1-1", "label": "מחשבון BMI מקצועי", "url": "https://www.nhlbi.nih.gov/health/educational/lose_wt/BMI/bmicalc.htm", "icon": "🔗"}
  ]'::jsonb,
  1,
  TRUE,
  20
);

-- ── LESSON 2: מה אנחנו אוכלים? (video + text, mixed) ────
INSERT INTO public.lessons (id, course_id, title, description, lesson_type, text_content, tasks, habits, external_links, sort_order, is_published, duration_minutes)
VALUES (
  'aaaaaaaa-0002-0002-0002-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'מה אנחנו אוכלים? – הבנת המאקרו',
  'הסבר מעמיק על חלבונים, שומנים ופחמימות ואיך לאכול נכון בלי דיאטה.',
  'mixed',
  '<h2>המאקרו-נוטריינטים שלכם</h2>
<p>ישנם שלושה רכיבי תזונה עיקריים שהגוף שלנו צריך: <strong>חלבונים, שומנים ופחמימות</strong>. ההבנה שלהם היא המפתח לשינוי אמיתי.</p>
<h3>חלבונים – בוני הגוף</h3>
<p>חלבונים הם אבני הבניין של הגוף. הם שומרים על מסת השריר, מספקים שובע ממושך ומהווים כ-<strong>25-35% מהקלוריות</strong> בתפריט בריא לירידה במשקל.</p>
<ul>
<li>עוף, הודו, דגים – מקורות רזים מעולים</li>
<li>ביצים, קטניות, יוגורט יווני</li>
<li>גבינות רזות, טופו, קינואה</li>
</ul>
<h3>שומנים – החברים הטובים</h3>
<p>שומן בריא חיוני לגוף. הוא תומך בהורמונים, בריאות הלב ובספיגת ויטמינים. אל תפחדו מ:<em>אבוקדו, שמן זית, אגוזים ודגים שמנים</em>.</p>
<h3>פחמימות – הדלק שלנו</h3>
<p>בחרו פחמימות מורכבות: דגנים מלאים, ירקות, קטניות. הן מספקות אנרגיה יציבה ומונעות אכילה בלתי נשלטת.</p>
<blockquote>הסוד הוא לא להוריד קבוצת מזון שלמה — אלא לאזן בין כולן.</blockquote>',
  '[
    {"id": "t2-1", "title": "רשמו מה אכלתם אתמול ונסו לזהות מאקרו לכל ארוחה", "description": "לא צריך מדויק – הערכה גסה מספיקה", "is_required": true},
    {"id": "t2-2", "title": "הוסיפו מנת חלבון לכל ארוחה היום", "description": "ביצה, יוגורט, עוף, קטניות – בחרו מה שאוהבים", "is_required": true}
  ]'::jsonb,
  '[
    {"id": "h2-1", "title": "אכילת חלבון בכל ארוחה", "emoji": "🥗", "frequency": "daily"},
    {"id": "h2-2", "title": "הימנעות ממתוקים מעובדים", "emoji": "🚫", "frequency": "daily"}
  ]'::jsonb,
  '[]'::jsonb,
  2,
  TRUE,
  35
);

-- ── LESSON 2: Video (YouTube embed - nutrition) ────
INSERT INTO public.media_files (id, lesson_id, file_type, video_provider, video_external_id, video_external_url, sort_order)
VALUES (
  'bbbbbbbb-0002-0002-0002-bbbbbbbbbbbb',
  'aaaaaaaa-0002-0002-0002-aaaaaaaaaaaa',
  'video_url',
  'youtube',
  'dBnniua6-oM',
  'https://www.youtube.com/watch?v=dBnniua6-oM',
  1
);

-- ── LESSON 3: פעילות גופנית (audio + tasks) ────
INSERT INTO public.lessons (id, course_id, title, description, lesson_type, text_content, tasks, habits, external_links, sort_order, is_published, duration_minutes)
VALUES (
  'aaaaaaaa-0003-0003-0003-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'פעילות גופנית – בנו שגרה שמחזיקה',
  'איך לבחור פעילות גופנית שאוהבים ולדאוג שתמשיך לאורך זמן. עם הדרכת אודיו לאימון הליכה.',
  'audio',
  '<h2>פעילות גופנית – מדריך מעשי למתחילים</h2>
<p>הטעות הנפוצה ביותר: להתחיל בעצימות גבוהה מדי ולפרוש אחרי שבועיים. <strong>המטרה היא עקביות, לא שיאים.</strong></p>
<h3>כמה לפעול?</h3>
<p>המלצת ה-WHO: <strong>150 דקות פעילות מתונה בשבוע</strong> (30 דקות × 5 ימים). זה פחות ממה שאתם חושבים!</p>
<ul>
<li>הליכה מהירה – הכי קל להתחיל</li>
<li>שחייה – ידידותית למפרקים</li>
<li>אופניים (כולל קבועים)</li>
<li>ריקוד – כיף + קלוריות!</li>
</ul>
<h3>כוח נגד אירובי</h3>
<p>שילוב אימוני כוח 2-3 פעמים בשבוע מגביר מסת שריר, מאיץ חילוף חומרים ועוזר לשמור על ירידה במשקל לאורך זמן.</p>',
  '[
    {"id": "t3-1", "title": "בצעו 20 דקות הליכה מהירה היום", "description": "הקשיבו להנחיות האודיו בזמן ההליכה", "is_required": true},
    {"id": "t3-2", "title": "בחרו 2 ימים קבועים לאימון הקרוב בשבוע", "description": "רשמו ביומן – כמו פגישה עסקית", "is_required": true},
    {"id": "t3-3", "title": "מצאו שותף לאימון או קבוצת הליכה", "description": "אנשים שמתאמנים עם אחרים עקביים ב-65% יותר", "is_required": false}
  ]'::jsonb,
  '[
    {"id": "h3-1", "title": "10,000 צעדים ביום", "emoji": "🚶", "frequency": "daily"},
    {"id": "h3-2", "title": "מתיחות 5 דקות בבוקר", "emoji": "🧘", "frequency": "daily"},
    {"id": "h3-3", "title": "אימון כוח פעמיים בשבוע", "emoji": "💪", "frequency": "weekly"}
  ]'::jsonb,
  '[
    {"id": "l3-1", "label": "תוכנית הליכה למתחילים – 8 שבועות", "url": "https://www.nhs.uk/live-well/exercise/walking-for-health/", "icon": "🚶"}
  ]'::jsonb,
  3,
  TRUE,
  45
);

-- ── LESSON 3: Audio file (walking guidance) ────
INSERT INTO public.media_files (id, lesson_id, file_type, uploadthing_url, uploadthing_name, duration_seconds, sort_order)
VALUES (
  'bbbbbbbb-0003-0003-0003-bbbbbbbbbbbb',
  'aaaaaaaa-0003-0003-0003-aaaaaaaaaaaa',
  'audio',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  'הנחיית_הליכה_20_דקות.mp3',
  1200,
  1
);

-- ── LESSON 4: ניהול קלוריות (pdf) ────
INSERT INTO public.lessons (id, course_id, title, description, lesson_type, text_content, tasks, habits, external_links, sort_order, is_published, duration_minutes)
VALUES (
  'aaaaaaaa-0004-0004-0004-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'ספירת קלוריות ותכנון תפריט',
  'למדו לקרוא תוויות, לתכנן ארוחות ולספור קלוריות בלי להישגע.',
  'text',
  '<h2>ספירת קלוריות – כלי, לא כלא</h2>
<p>ספירת קלוריות היא <strong>כלי למודעות</strong>, לא עונש. המטרה היא להבין מה נכנס לגוף, לא להיות אובססיביים.</p>
<h3>כמה קלוריות אני צריך?</h3>
<p>גבר ממוצע צורך 2000-2500 קל, אישה ממוצעת 1600-2000 קל. לירידה במשקל, גירעון של <strong>300-500 קל ביום</strong> = ירידה של כ-0.5 ק"ג בשבוע.</p>
<h3>טיפים מעשיים</h3>
<ul>
<li>השתמשו באפליקציות כמו MyFitnessPal או Calorie Counter</li>
<li>שקלו אוכל בתחילת הדרך כדי לכייל את העין</li>
<li>הכינו ארוחות מראש (Meal Prep) – חוסך זמן וקלוריות</li>
<li>אכלו לאט – לוקח 20 דקות לגוף להרגיש שבע</li>
</ul>
<h3>המלכודות הנפוצות</h3>
<p>שתייה קלורית (מיצים, אלכוהול), ממרחים, שמן בבישול — אלה הנסתרים שצוברים. שימו לב!</p>
<blockquote>מה שנמדד – משתפר. מה שנמדד ונתגמל – משתפר מהר יותר.</blockquote>',
  '[
    {"id": "t4-1", "title": "הורידו אפליקציית מעקב קלוריות (MyFitnessPal / לייף)", "description": "מדעי המחקר: רישום תזונה = פי 2 הצלחה", "is_required": true},
    {"id": "t4-2", "title": "תעדו כל מה שאכלתם היום באפליקציה", "description": "כולל שתייה, נשנושים קטנים ורטבים", "is_required": true},
    {"id": "t4-3", "title": "הכינו 3 ארוחות לשבוע הקרוב (Meal Prep)", "description": "בחרו יום ראשון או שני — הכינו מראש", "is_required": false}
  ]'::jsonb,
  '[]'::jsonb,
  '[
    {"id": "l4-1", "label": "MyFitnessPal – אפליקציית מעקב מומלצת", "url": "https://www.myfitnesspal.com", "icon": "📱"},
    {"id": "l4-2", "label": "מחשבון צרכי קלוריות יומיים", "url": "https://www.calculator.net/calorie-calculator.html", "icon": "🔢"}
  ]'::jsonb,
  4,
  TRUE,
  30
);

-- ── LESSON 5: שינה ומנוחה (text only) ────
INSERT INTO public.lessons (id, course_id, title, description, lesson_type, text_content, tasks, habits, external_links, sort_order, is_published, duration_minutes)
VALUES (
  'aaaaaaaa-0005-0005-0005-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'שינה טובה = ירידה במשקל',
  'הקשר המפתיע בין שינה, הורמונים וירידה במשקל — ולמה שינה היא כלי הדיאטה הנחבא.',
  'text',
  '<h2>שינה – הנשק הסודי שלכם</h2>
<p>מחקרים מראים שאנשים שישנים פחות מ-7 שעות בלילה נוטים ב-<strong>55% יותר</strong> לעלות במשקל. לא בגלל חוסר רצון — בגלל הורמונים.</p>
<h3>ההורמונים שמשבשים הכל</h3>
<p>חוסר שינה מעלה את הגרלין (הורמון הרעב) ומוריד את הלפטין (הורמון השובע). התוצאה: אתם רעבים יותר, ופחות מסוגלים לסרב לאוכל.</p>
<h3>שיפור השינה – מדריך מהיר</h3>
<ul>
<li><strong>קבעו שעת שינה קבועה</strong> – גם בסופי שבוע</li>
<li><strong>כבו מסכים שעה לפני השינה</strong> – האור הכחול מונע ייצור מלטונין</li>
<li><strong>חדר קריר ואפל</strong> – הסביבה האידאלית לשינה</li>
<li><strong>הימנעו מקפאין אחרי 14:00</strong></li>
<li><strong>שגרת הרגעה</strong> – מקלחת חמה, קריאה, מדיטציה</li>
</ul>
<h3>מדיטציית שינה קצרה</h3>
<p>נסו את שיטת 4-7-8: שאפו 4 שניות, עצרו 7, נשפו 8. שלוש חזרות — ותרדמו הרבה יותר מהר.</p>
<blockquote>לא ניתן לפצות על שינה בתזונה או אימון. הם שלושה עמודי תווך שחייבים לעמוד יחד.</blockquote>',
  '[
    {"id": "t5-1", "title": "הגדירו שעת שינה קבועה לשבוע הקרוב", "description": "כוונו התראה ב-22:30 שתזכיר לסיים מסכים", "is_required": true}
  ]'::jsonb,
  '[
    {"id": "h5-1", "title": "שינה של 7+ שעות", "emoji": "😴", "frequency": "daily"},
    {"id": "h5-2", "title": "כיבוי מסכים שעה לפני שינה", "emoji": "📵", "frequency": "daily"}
  ]'::jsonb,
  '[]'::jsonb,
  5,
  TRUE,
  25
);

-- ── LESSON 6: סיכום ומעבר לעתיד (mixed – text + video + habits) ────
INSERT INTO public.lessons (id, course_id, title, description, lesson_type, text_content, tasks, habits, external_links, sort_order, is_published, duration_minutes)
VALUES (
  'aaaaaaaa-0006-0006-0006-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'סיכום – עכשיו הכל מתחיל',
  'סיום הקורס, הצבת יעדים לעתיד ובניית תוכנית אישית לשלושת החודשים הבאים.',
  'mixed',
  '<h2>הגעתם לסיום – ועכשיו הכל מתחיל</h2>
<p>סיימתם 6 שיעורים של ידע, כלים ותובנות. עכשיו הגיע הזמן להפוך את מה שלמדתם למציאות יומיומית.</p>
<h3>5 עקרונות שתמיד תזכרו</h3>
<ul>
<li><strong>עקביות > שלמות</strong> – 80% תמיד עדיף על 0%</li>
<li><strong>התקדמות, לא שלמות</strong> – כל יום טוב יותר מאתמול</li>
<li><strong>גמישות</strong> – יום רע לא מחייב שבוע רע</li>
<li><strong>מדידה</strong> – עקבו אחרי התקדמותכם</li>
<li><strong>תמיכה</strong> – אל תעשו את זה לבד</li>
</ul>
<h3>מה עכשיו?</h3>
<p>בנו תוכנית אישית לשלושת החודשים הקרובים. הגדירו: יעד משקל, פעילות שבועית, שינוי תזונתי אחד שתשמרו עליו.</p>
<blockquote>הסוד הגדול ביותר לירידה במשקל הוא שאין סוד. רק עקביות, סבלנות ואהבה עצמית.</blockquote>',
  '[
    {"id": "t6-1", "title": "כתבו תוכנית 3 חודשים: יעד משקל + 3 הרגלים לשמר", "description": "ספציפי ומציאותי – יעד שאתם מאמינים שתגיעו אליו", "is_required": true},
    {"id": "t6-2", "title": "שתפו את ההישג הגדול ביותר שלכם מהקורס", "description": "גאוות עצמי = מניע עצום", "is_required": true},
    {"id": "t6-3", "title": "הגדירו תגמול לעצמכם בהגעה ליעד", "description": "לא אוכל — חוויה, בגד, טיול", "is_required": false}
  ]'::jsonb,
  '[
    {"id": "h6-1", "title": "שקילה שבועית ורישום", "emoji": "📊", "frequency": "weekly"},
    {"id": "h6-2", "title": "3 ארוחות מסודרות ביום", "emoji": "🍽️", "frequency": "daily"},
    {"id": "h6-3", "title": "30 דקות פעילות גופנית", "emoji": "🏃", "frequency": "daily"},
    {"id": "h6-4", "title": "שתיית 8 כוסות מים", "emoji": "💧", "frequency": "daily"}
  ]'::jsonb,
  '[
    {"id": "l6-1", "label": "אפליקציית Habits – מעקב הרגלים", "url": "https://productiveapp.io", "icon": "✅"}
  ]'::jsonb,
  6,
  TRUE,
  40
);

-- ── LESSON 6: Video (YouTube – summary/motivation) ────
INSERT INTO public.media_files (id, lesson_id, file_type, video_provider, video_external_id, video_external_url, sort_order)
VALUES (
  'bbbbbbbb-0006-0006-0006-bbbbbbbbbbbb',
  'aaaaaaaa-0006-0006-0006-aaaaaaaaaaaa',
  'video_url',
  'youtube',
  'UItWltVZZmE',
  'https://www.youtube.com/watch?v=UItWltVZZmE',
  1
);

-- =============================================
-- HOW TO ENROLL A USER (run separately):
-- =============================================
-- Replace <USER_UUID> with the actual user UUID from auth.users
--
-- INSERT INTO public.enrollments (user_id, course_id, is_active)
-- VALUES ('<USER_UUID>', '11111111-1111-1111-1111-111111111111', TRUE)
-- ON CONFLICT (user_id, course_id) DO UPDATE SET is_active = TRUE;
--
-- To find user UUIDs: SELECT id, email FROM auth.users;
-- =============================================
