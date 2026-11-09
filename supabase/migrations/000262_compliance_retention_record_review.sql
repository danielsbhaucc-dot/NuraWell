-- Deletion lifecycle (owner decision t1252s5335): lawyer review of the single legal retention record kept after deletion.
-- Owner: Daniel. Not urgent (recommended, due in the first quarter of 2027). Idempotent.
insert into public.compliance_tasks (slug, sort_order, title, explanation, legal_why, requirement, cost_estimate, recurrence, next_due, owner, evidence) values
('retention-record-lawyer-review', 25, 'בדיקה של עורך דין לרשומת השמירה המשפטית',
 'אחרי מחיקת חשבון נשמרת רשומה אחת, מינימלית ומוצפנת, ל־7 שנים: פרטי זיהוי וקשר בסיסיים, קבלות ותשלומים, גרסאות תנאים ומדיניות שאושרו ומועדיהן, יומן הסכמות, מועדי בקשת המחיקה וביצועה, תמציתים מוצפנים של אימייל (ובעתיד טלפון וטביעת כרטיס מספק התשלום) לזיהוי לקוח עבר, וסימון עובדתי קצר על שימוש לרעה. אין בה כתובת IP, והתאמה רק מתריעה לבעלים בלי לחסום. צריך לבקש מעורך דין לאשר את רשימת השדות, את תקופת 7 השנים ואת הטיפול בזיהוי לקוח עבר ובסימון שימוש לרעה, כולל הנוסח במדיניות הפרטיות.',
 'חוק הגנת הפרטיות (כולל תיקון 13) מחייב לשמור מידע רק במידה הנדרשת ולתקופה מוצדקת. חובת שמירת מסמכים חשבונאיים והגנה מפני תביעות מצדיקות שמירה מסוימת, אבל רשימת השדות, משך השמירה וזיהוי לקוח עבר דורשים אישור מקצועי.',
 'recommended', 'חלק מחוות הדעת של עורך דין הפרטיות, או פגישה נפרדת קצרה', 'one_time', '2027-03-31', 'daniel', null)
on conflict (slug) do nothing;
