-- ============================================================
-- Seed: First Journey Step — "2 כוסות מים לפני כל ארוחה"
-- ============================================================

INSERT INTO public.journey_steps (
  id, title, description, step_number, is_published,
  video_provider, video_external_id, video_title,
  summary_text, duration_minutes,
  quiz_questions, game_items, commitment, researches, tasks, habits,
  pdf_url, pdf_name
) VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  '2 כוסות מים לפני כל ארוחה 💧',
  'גלו כיצד הרגל פשוט של שתיית מים לפני ארוחות יכול לשנות את הבריאות שלכם',
  1,
  TRUE,

  -- Video (HeyGen placeholder)
  'heygen',
  'PLACEHOLDER_HEYGEN_VIDEO_ID',
  'למה מים לפני ארוחות משנים את הכל?',

  -- Summary text
  'בשיעור זה למדנו שאחד ההרגלים הפשוטים והמדעיים ביותר לשיפור הבריאות הוא לשתות 2 כוסות מים (כ-500 מ"ל) כ-20-30 דקות לפני כל ארוחה. מנגנון הפעולה כולל מתיחת דפנות הקיבה שמפעילה קולטני מתיחה, שולחים אות שובע למוח דרך עצב הוואגוס. מחקרים מ-2010 מאוניברסיטת וירג''יניה טק הראו ירידה של 44% יותר במשקל על פני 12 שבועות. מחקר Birmingham 2015 הראה ירידה של 1.3 ק"ג תוך 12 שבועות. בנוסף, שתיית מים מעלה את קצב חילוף החומרים ב-24-30% למשך 60 דקות.',
  8,

  -- Quiz questions (3)
  '[
    {
      "id": "q1",
      "question": "כמה מים מומלץ לשתות לפני כל ארוחה?",
      "options": ["כוס אחת (250 מ\"ל)", "2 כוסות (500 מ\"ל)", "3 כוסות (750 מ\"ל)", "חצי כוס (125 מ\"ל)"],
      "correct_index": 1,
      "explanation": "המחקרים הראו שהכמות האופטימלית היא כ-500 מ\"ל (2 כוסות) לפני הארוחה."
    },
    {
      "id": "q2",
      "question": "כמה דקות לפני הארוחה כדאי לשתות?",
      "options": ["5 דקות", "10 דקות", "20-30 דקות", "שעה לפני"],
      "correct_index": 2,
      "explanation": "20-30 דקות לפני הארוחה מאפשר למים להגיע לקיבה ולהפעיל את קולטני המתיחה."
    },
    {
      "id": "q3",
      "question": "מהו מנגנון השובע העיקרי שמים מפעילים?",
      "options": ["העלאת רמת הסוכר בדם", "מתיחת דפנות הקיבה והפעלת קולטנים", "שינוי pH בקיבה", "יצירת אנזימי עיכול"],
      "correct_index": 1,
      "explanation": "מים מותחים את דפנות הקיבה, מה שמפעיל קולטני מתיחה ששולחים אות שובע למוח דרך עצב הוואגוס."
    }
  ]'::jsonb,

  -- Game items (true/false)
  '[
    {
      "id": "g1",
      "statement": "שתיית מים קרים לפני ארוחה שורפת יותר קלוריות מאשר מים בטמפרטורת החדר",
      "is_true": true,
      "explanation": "נכון! הגוף משקיע אנרגיה בחימום המים, מה שמעלה מעט את שריפת הקלוריות (אפקט תרמוגני)."
    },
    {
      "id": "g2",
      "statement": "מים גורמים לנפיחות ועיכול איטי אם שותים לפני ארוחה",
      "is_true": false,
      "explanation": "לא נכון. מים נספגים מהר מהקיבה ולא מאטים את העיכול. להפך, הם עוזרים בתהליכי העיכול."
    },
    {
      "id": "g3",
      "statement": "שתיית 500 מ\"ל מים לפני ארוחה יכולה להפחית את צריכת הקלוריות ב-75-90 קלוריות לארוחה",
      "is_true": true,
      "explanation": "נכון! מחקרים הראו שאנשים שותים פחות ואוכלים פחות כשהם שותים מים לפני הארוחה."
    },
    {
      "id": "g4",
      "statement": "ההרגל הזה עובד רק אם שותים מים מינרליים",
      "is_true": false,
      "explanation": "לא נכון. כל סוג מים עובד — מים רגילים מהברז, מסוננים, או מינרליים."
    },
    {
      "id": "g5",
      "statement": "מחקר מ-2010 הראה שקבוצת המים ירדה 44% יותר במשקל מקבוצת הביקורת",
      "is_true": true,
      "explanation": "נכון! מחקר של Dennis et al. מ-Virginia Tech הראה ירידה ממוצעת של 2 ק\"ג יותר ב-12 שבועות."
    }
  ]'::jsonb,

  -- Commitment
  '{
    "text": "אני מתחייב/ת לשתות 2 כוסות מים לפני כל ארוחה במשך השבוע הקרוב 💧",
    "emoji": "💧",
    "description": "זה הרגל פשוט שלוקח פחות מדקה, אבל יכול לשנות את הבריאות שלך לטווח ארוך. בואו נתחיל היום!"
  }'::jsonb,

  -- Researches
  '[
    {
      "id": "r1",
      "title": "Water consumption increases weight loss during a hypocaloric diet intervention",
      "authors": "Dennis EA, Dengo AL, Comber DL, et al.",
      "year": "2010",
      "journal": "Obesity (Silver Spring)",
      "finding": "קבוצת המים ירדה 44% יותר במשקל (2 ק\"ג נוספים) מקבוצת הביקורת במשך 12 שבועות.",
      "url": "https://pubmed.ncbi.nlm.nih.gov/19661958/"
    },
    {
      "id": "r2",
      "title": "Efficacy of water preloading before main meals as a strategy for weight loss",
      "authors": "Parretti HM, Aveyard P, Blannin A, et al.",
      "year": "2015",
      "journal": "Obesity (Silver Spring)",
      "finding": "שתיית 500 מ\"ל מים 30 דקות לפני ארוחות הובילה לירידה של 1.3 ק\"ג תוך 12 שבועות.",
      "url": "https://pubmed.ncbi.nlm.nih.gov/26237305/"
    },
    {
      "id": "r3",
      "title": "Water-induced thermogenesis",
      "authors": "Boschmann M, Steiniger J, Hille U, et al.",
      "year": "2003",
      "journal": "Journal of Clinical Endocrinology & Metabolism",
      "finding": "שתיית 500 מ\"ל מים העלתה את קצב חילוף החומרים ב-30% למשך 60 דקות.",
      "url": "https://pubmed.ncbi.nlm.nih.gov/14671205/"
    },
    {
      "id": "r4",
      "title": "Water drinking induces thermogenesis through osmosensitive mechanisms",
      "authors": "Brown CM, Dulloo AG, Montani JP",
      "year": "2006",
      "journal": "European Journal of Clinical Nutrition",
      "finding": "אישרו את האפקט התרמוגני של מים וזיהו שקולטנים אוסמוטיים בכבד אחראיים למנגנון.",
      "url": null
    }
  ]'::jsonb,

  -- Tasks
  '[
    {
      "id": "t1",
      "title": "מלא בקבוק מים ושים ליד השולחן",
      "description": "הכן בקבוק מים של 500 מ\"ל ושים אותו במקום נראה ליד המקום שבו אתה אוכל.",
      "emoji": "🍶"
    },
    {
      "id": "t2",
      "title": "הגדר תזכורת בטלפון",
      "description": "הגדר 3 תזכורות — 30 דקות לפני כל ארוחה עיקרית.",
      "emoji": "⏰"
    },
    {
      "id": "t3",
      "title": "שתה 2 כוסות מים לפני ארוחת הבוקר",
      "description": "התחל כבר היום! שתה 500 מ\"ל לפני ארוחת הבוקר ושים לב לתחושה.",
      "emoji": "🌅"
    }
  ]'::jsonb,

  -- Habits
  '[
    {
      "id": "h1",
      "title": "שתיית 2 כוסות מים לפני ארוחת בוקר",
      "description": "כל בוקר, 20-30 דקות לפני שאתה אוכל",
      "emoji": "🌅",
      "frequency": "daily"
    },
    {
      "id": "h2",
      "title": "שתיית 2 כוסות מים לפני ארוחת צהריים",
      "description": "לפני ארוחת הצהריים, שתה 500 מ\"ל",
      "emoji": "☀️",
      "frequency": "daily"
    },
    {
      "id": "h3",
      "title": "שתיית 2 כוסות מים לפני ארוחת ערב",
      "description": "לפני ארוחת הערב, שתה 500 מ\"ל",
      "emoji": "🌙",
      "frequency": "daily"
    }
  ]'::jsonb,

  -- PDF
  NULL,
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  quiz_questions = EXCLUDED.quiz_questions,
  game_items = EXCLUDED.game_items,
  commitment = EXCLUDED.commitment,
  researches = EXCLUDED.researches,
  tasks = EXCLUDED.tasks,
  habits = EXCLUDED.habits,
  summary_text = EXCLUDED.summary_text,
  updated_at = NOW();
