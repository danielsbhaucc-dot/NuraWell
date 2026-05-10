-- Sync step 1 immersive attention stops into text_content so admin UI and learner app
-- both read the same source (NW_IMMERSIVE_STOPS_V1 — see apps/web/lib/journey/immersiveAttentionStops.ts).
-- Only fills when text_content is empty; does not overwrite existing editor content.

UPDATE public.journey_steps
SET text_content = $stops$
NW_IMMERSIVE_STOPS_V1:[{"id":"satiety-brain-checkpoint","time_seconds":85,"question":"רגע, אז מתי בעצם המוח שלנו מבין שאנחנו שבעים?","options":["רק כשהקלוריות נספגות בדם.","ברגע שהקיבה נמתחת פיזית."],"correct_option_index":1,"feedback_correct":"בול. המוח מקבל אותות שובע כבר מהמתיחה של הקיבה ומההורמונים שמופרשים בדרך - לא רק אחרי ספיגת קלוריות בדם.","feedback_incorrect":"כמעט. לרוב המוח מתחיל לקבל סימן שובע כבר כשהקיבה נמתחת פיזית, עוד לפני שכל הקלוריות נספגות בדם.","feedback":"בול. המוח מקבל אותות שובע כבר מהמתיחה של הקיבה ומההורמונים שמופרשים בדרך - לא רק אחרי ספיגת קלוריות בדם.","auto_resume_seconds":10},{"id":"default-water-hamburger-checkpoint","time_seconds":105,"question":"האם לדעתך זה אומר שהגוף שורף המבורגר שלם מעצם שתיית מים לפני האוכל?","feedback":"ממש לא. שתיית מים לפני ארוחה יכולה לתרום לשובע ולהפחית במעט את צריכת הקלוריות, אבל בדרך כלל מדובר בתוספת מתונה של עשרות קלוריות בלבד.","auto_resume_seconds":10},{"id":"self-reflection-sweet-craving-checkpoint","time_seconds":120,"question":"קרה לך פעם שחיפשת משהו מתוק בארון ובעצם... פשוט לא שתית כל היום?","options":["ברור, קורה לי מלא","האמת שפחות"],"correct_option_index":null,"feedback":"ההיפותלמוס במוח לפעמים מבלבל בין צמא לרעב. בפעם הבאה שהדודא למתוק תופסת אותך - קודם כוס מים, חכי שתי דקות, ותני לגוף הזדמנות להירגע.","auto_resume_seconds":10}]
$stops$
WHERE step_number = 1
  AND (text_content IS NULL OR btrim(text_content) = '');
