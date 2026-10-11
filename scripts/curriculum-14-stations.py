import json, uuid
NS = uuid.UUID('6f1c1d1e-0000-4000-8000-000000000014')
def sid(k): return str(uuid.uuid5(NS, k))
FOUND = 'ff3df6e3-7fa9-4bc7-8e77-7000ef2fc776'
WATER_STEP = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

S = [
 # key, title, emoji, habit_key, why, lessons[3], task(title, desc, schedule, tpd), ladder[3], phase, caution
 ('s0','פתיחה: מעקב ועוגנים','🌱','foundation',
  'מעקב פשוט ויומי הוא המנוע של שינוי הרגלים: "וי" קטן בשעה קבועה, ועוגן שכבר קיים ביום. בתחנה הזו בונים את התשתית לכל המסע.',
  ['איך הרגלים באמת נוצרים (ולמה 21 יום זה מיתוס)','העוגן שלך: לבנות "אחרי ש... אני..."','המעקב השבועי: נתון, לא שיפוט'],
  ('לסמן וי יומי באפליקציה בשעה קבועה','מתרגלים את פעולת המעקב עצמה — שנייה אחת ביום.','daily',1),
  ['וי יומי בלבד','וי יומי + מילה אחת על איך היה היום','וי יומי + מילה על ההרגשה + בדיקה שבועית (שקילה רק למי שרוצה)'],
  'שלב 0 – יציאה לדרך', None),
 ('s1','מים לפני ארוחות','💧','water',
  'כוס מים לפני ארוחה היא הרגל קטן עם השפעה מורגשת: היא מקדימה תחושת מלאות ועוזרת להתחיל את הארוחה ברוגע.',
  None,  # lesson 1 = existing produced step
  None, None, 'שלב 1 – יסודות קלים',
  'מי שיש לו אי-ספיקת לב או כליות, או הגבלת נוזלים מרופא — לא מגדילים שתייה. אלמוג יציע גרסה חלופית (למשל עצירה של דקה לפני הארוחה).'),
 ('s2','חלבון בארוחת הבוקר','🍳','protein',
  'ארוחת בוקר עם חלבון עוזרת לשובע לאורך היום ומפחיתה נשנושים בערב. מתחילים בפריט אחד פשוט.',
  ['למה הבוקר קובע מה יקרה בערב','10 ארוחות בוקר חלבוניות ב-5 דקות','מכשולים: "אין לי תיאבון בבוקר" / "אין לי זמן"'],
  ('מקור חלבון אחד בארוחה הראשונה של היום','ביצה, יוגורט, קוטג׳, טופו או טונה — מה שזמין.','daily',1),
  ['פריט חלבוני אחד (למשל יוגורט)','ארוחת בוקר עם כ-20 גרם חלבון','כ-25–35 גרם חלבון + ירק'],
  'שלב 1 – יסודות קלים', None),
 ('s3','החלפת משקאות ממותקים','🥤','drinks',
  'משקאות ממותקים מוסיפים סוכר שלא מרגישים. החלפה אחת ביום בתחליף שאוהבים היא צעד קל עם השפעה גדולה.',
  ['הקלוריות שלא מרגישים: כמה סוכר יש בכוס','תחליף שאוהבים: סודה עם לימון, מים בטעמים טבעיים, תה קר','מכשולים: קפה עם סוכר, מיצים "בריאים", אירועים'],
  ('להחליף משקה ממותק אחד בתחליף','סודה עם לימון, מים עם פירות, תה קר בלי סוכר.','daily',1),
  ['החלפה אחת ביום','בלי משקאות ממותקים בבית','אפס משקאות ממותקים (כולל מיצים) 6 מתוך 7 ימים'],
  'שלב 1 – יסודות קלים', None),
 ('s4','חצי צלחת ירקות','🥗','vegetables',
  'שיטת הצלחת: חצי ירקות, רבע חלבון, רבע פחמימה. ירקות מוסיפים נפח, סיבים ושובע.',
  ['שיטת הצלחת: חצי, רבע, רבע','ירקות בלי מאמץ: קפואים, חתוכים מראש, סלט ראשון','מכשולים: רטבים, "אני לא אוהב ירקות", ארוחות בחוץ'],
  ('ארוחה אחת שבה חצי צלחת ירקות','אפשר לצלם לאלמוג — לא חובה.','daily',1),
  ['ירק אחד בארוחה העיקרית','חצי צלחת ירקות בארוחה אחת','חצי צלחת בשתי ארוחות, או סלט ראשון לפני הארוחה'],
  'שלב 2 – הצלחת והתנועה', None),
 ('s5','הליכה יומית','🚶','walking',
  'לא צריך חדר כושר: הליכה קבועה אחרי עוגן יומי היא אחד ההרגלים הכי בני-קיימא.',
  ['לא צריך חדר כושר: כוחה של הליכה','הקו הבסיסי שלך: לספור קודם ולהעלות אחר כך','מכשולים: חום, ישיבה ממושכת, "אין זמן"'],
  ('הליכה קצרה מיד אחרי עוגן קבוע','למשל אחרי ארוחת הערב או בזמן שיחת טלפון.','daily',1),
  ['5 דקות הליכה ביום','15–20 דקות הליכה ביום','30 דקות הליכה ביום (לפי גיל וכושר)'],
  'שלב 2 – הצלחת והתנועה', None),
 ('s6','אכילה איטית','🐢','slow_eating',
  'תחושת השובע מגיעה באיחור. האטה קטנה בארוחה נותנת לגוף זמן להרגיש מתי מספיק.',
  ['המוח מאחר: למה כדאי להאט','3 טריקים: להניח סכו״ם בין ביסים, ללעוס יותר, ארוחה של 20 דקות','מכשולים: ארוחה מול מסך, בעבודה, עם ילדים'],
  ('ארוחה אחת ביום בהאטה מכוונת','אפשר להיעזר בטיימר.','daily',1),
  ['להניח את הסכו״ם 3 פעמים בארוחה','ארוחה אחת של 15 דקות ומעלה','ארוחה עיקרית של 20 דקות ומעלה בלי מסך'],
  'שלב 2 – הצלחת והתנועה', None),
 ('s7','סולם רעב ושובע','🧘','hunger',
  'סולם 1–10 עוזר לזהות רעב אמיתי ושובע נעים, ולהבדיל בין רעב פיזי לרגשי.',
  ['סולם 1–10: איך נשמע רעב אמיתי','עצירה באמצע: הבדיקה של "איפה אני עכשיו?"','רעב פיזי או רגשי? שאלה אחת שמבדילה'],
  ('לדרג רעב לפני ארוחה אחת ואחריה','מספר אחד מ-1 עד 10, בלי שיפוט.','daily',1),
  ['דירוג לפני ארוחה אחת','דירוג לפני ואחרי ארוחה אחת','לעצור ב-7 (שובע נעים) ברוב הארוחות'],
  'שלב 3 – אכילה קשובה וסביבה', None),
 ('s8','סביבת אוכל חכמה','🏠','environment',
  'מה שרואים זה מה שאוכלים. שינויים קטנים בבית עושים את הבחירה הטובה לקלה יותר.',
  ['הבית מחליט בשבילך: מה רואים זה מה שאוכלים','מבצע מטבח: פירות בגובה העיניים, חטיפים בארון גבוה, צלחת קטנה','מכשולים: בני בית, עבודה, חטיפים במשרד'],
  ('פעולת סביבה אחת ביום','להזיז, להסתיר או לחלק למנות.','daily',1),
  ['שינוי אחד (למשל קערת פירות על השיש)','צלחת או קערה קטנה יותר בארוחת הערב','החטיף הבעייתי לא נכנס הביתה, ומנות מחולקות מראש'],
  'שלב 3 – אכילה קשובה וסביבה', None),
 ('s9','תכנון ארוחות שבועי','📋','planning',
  '10 דקות תכנון בשבוע חוסכות הרבה החלטות קשות באמצע היום.',
  ['10 דקות בשבוע שחוסכות 10 החלטות ביום','תבנית: 3 ארוחות ערב קבועות + 2 גמישות + רשימת קניות','מכשולים: שינויים ברגע האחרון, משפחה, תקציב'],
  ('לבדוק בבוקר מה מתוכנן לאכול היום','טאפ אחד. פעם בשבוע — מפגש תכנון קצר.','daily',1),
  ['לתכנן את ארוחת הערב של מחר','לתכנן 3 ארוחות ערב בשבוע + רשימת קניות','תכנון שבועי מלא + הכנה מראש פעם בשבוע'],
  'שלב 3 – אכילה קשובה וסביבה', None),
 ('s10','שגרת שינה','😴','sleep',
  'עייפות מגבירה רעב וחשקים. שגרת שינה קבועה היא חלק מהתוכנית, לא תוספת.',
  ['שינה היא חלק מהתוכנית: מה עייפות עושה לרעב','טקס כיבוי: מסכים, אור ושעה קבועה','מכשולים: ילדים, משמרות, "רק עוד פרק"'],
  ('שעת כיבוי: מסך מחוץ למיטה בשעה שנבחרה','בוחרים שעה אחת וחוזרים עליה.','daily',1),
  ['שעת כיבוי 15 דקות לפני השינה','ללכת לישון 30 דקות מוקדם יותר','שעת שינה והשכמה קבועות (סטייה של עד 30 דקות)'],
  'שלב 4 – הגוף והראש', None),
 ('s11','יותר אוכל אמיתי','🍎','whole_food',
  'בלי פאניקה: החלפה אחת ביום של מוצר אולטרה-מעובד במזון מלא מצטברת לשינוי גדול.',
  ['מה זה בכלל "אולטרה-מעובד"? (בלי פאניקה)','החלפה אחת ביום: חטיף ← פרי ואגוזים, דגני בוקר ← שיבולת שועל','מכשולים: מחיר, נוחות, ילדים'],
  ('החלפה אחת של מוצר אולטרה-מעובד במזון מלא','מה שקל וזמין היום.','daily',1),
  ['החלפה אחת ביום','ארוחה אחת ביום שכולה מזון מלא','רוב הארוחות ממזון מלא; אולטרה-מעובד רק בתכנון'],
  'שלב 4 – הגוף והראש', None),
 ('s12','ניהול סטרס ואכילה רגשית','🌬️','stress',
  'בלחץ מתחשק דווקא מתוק. ארגז כלים של 3 דקות נותן דרך אחרת להירגע.',
  ['למה בלחץ מתחשק דווקא מתוק','ארגז כלים של 3 דקות: נשימה, הליכה קצרה, שיחה, כתיבה','תוכנית אם–אז לרגע הקשה שלי'],
  ('2–3 דקות נשימה או עצירה בעוגן קבוע','או כשמתעורר דחף לאכול בלי רעב.','daily',1),
  ['3 נשימות עמוקות לפני פתיחת המקרר אחרי יום עבודה','תרגול יומי של 3 דקות','זיהוי טריגר ושימוש בכלי חלופי לפני אכילה רגשית, ברוב המקרים'],
  'שלב 4 – הגוף והראש', None),
 ('s13','סיום: ההרגלים שלי','🏁','maintenance',
  'בוחרים את הרגלי העוגן לשימור ואת תדירות הבדיקה — תוכנית אישית להמשך.',
  ['מה למדנו: 12 הרגלים במבט אחד','בוחרים 5 הרגלי עוגן לשימור','תוכנית השימור שלי: מתי בודקים ומה עושים כשמחליקים'],
  ('לבחור 5 הרגלי עוגן לשימור','ולהחליט כל כמה זמן בודקים אותם.','one_time',1),
  ['לבחור הרגל עוגן אחד לשימור','לבחור 3 הרגלי עוגן + תדירות בדיקה','לבחור 5 הרגלי עוגן + תדירות + תוכנית חזרה'],
  'סיום', None),
]

WATER_EXTRA = ['העוגן: איפה הבקבוק עומד ומתי שותים','מכשולים: עבודה, מסעדה, "אני לא אוהב מים" (+ תוכנית אם–אז)']

def q(s): return "'" + s.replace("'", "''") + "'" if s is not None else 'null'
def j(o): return q(json.dumps(o, ensure_ascii=False)) + '::jsonb'

def script(st, idx, title):
    why = st[4]
    if idx == 0:
        body = f"{why}\n\nבשיעור הזה: מה המחקר אומר, ולמה מתחילים בגרסה הכי קטנה."
    elif idx == 1:
        body = f"בשיעור הזה בונים את העוגן: אחרי איזו פעולה קבועה ביום עושים את ההרגל, ואיך מכינים את הסביבה כדי שיהיה קל.\n\nבסוף השיעור בוחרים עוגן אחד ומספרים לאלמוג."
    else:
        body = f"בשיעור הזה עוברים על המכשולים הנפוצים ובונים משפט אם–אז אחד: \"אם ___, אז ___\".\n\nפספוס של יום לא מאפס כלום — חוזרים מחר."
    return f"[טיוטת תסריט — לעריכה לפני צילום]\n{title}\n\n{body}"

out = ["-- 000105: 14-station curriculum (NuraWell-notes/curriculum.md). Old stations → track 'legacy' (kept, hidden).",
       "-- Station 0 reuses the foundation row; the produced water lesson (a1b2…) becomes station 1 lesson 1. No hard deletes.",
       "update public.journey_stations set track = 'legacy', is_foundation = false where id <> '%s' and track = 'main';" % FOUND]
step_no = 1
for order, st in enumerate(S):
    key, title, emoji, habit, why, lessons, task, ladder, phase, caution = st
    station_id = FOUND if key == 's0' else sid('station:' + key)
    desc = why + (f"\n\n⚠️ {caution}" if caution else '')
    if key == 's0':
        out.append(f"update public.journey_stations set title={q(title)}, description={q(desc)}, sort_order=0, habit_key={q(habit)}, track='main', is_foundation=true, updated_at=now() where id='{FOUND}';")
    else:
        out.append(f"insert into public.journey_stations (id, title, description, sort_order, habit_key, track, is_foundation) values ('{station_id}', {q(title)}, {q(desc)}, {order}, {q(habit)}, 'main', false) on conflict (id) do update set title=excluded.title, description=excluded.description, sort_order=excluded.sort_order, habit_key=excluded.habit_key, track='main';")
    if key == 's1':
        out.append(f"update public.journey_steps set station_id='{station_id}', step_number={step_no}, updated_at=now() where id='{WATER_STEP}';")
        step_no += 1
        titles = WATER_EXTRA
        first_task = False
    else:
        titles = lessons
        first_task = True
    for i, lt in enumerate(titles):
        step_id = sid(f'step:{key}:{i}')
        tasks = []
        commitment = None
        if first_task and i == 0:
            tasks = [{'id': 't1', 'emoji': emoji, 'title': task[0], 'description': task[1], 'schedule': task[2], 'times_per_day': task[3]}]
            commitment = {'text': f'ההתחייבות שלי לשבועיים הקרובים: {task[0]}', 'emoji': emoji, 'description': 'מתחילים ברמה הכי קטנה. פספוס של יום לא מאפס כלום.'}
        idx = i + (1 if key == 's1' else 0)
        out.append(
            "insert into public.journey_steps (id, station_id, title, description, step_number, is_published, summary_text, duration_minutes, tasks, commitment) values "
            f"('{step_id}', '{station_id}', {q(lt)}, {q(phase)}, {step_no}, true, {q(script(st, idx, lt))}, 3, {j(tasks)}, {j(commitment) if commitment else 'null'}) "
            "on conflict (id) do update set title=excluded.title, station_id=excluded.station_id, step_number=excluded.step_number, summary_text=excluded.summary_text, tasks=excluded.tasks, commitment=excluded.commitment;")
        if tasks:
            lad = [{'level': -1, 'title': ladder[0], 'times_per_day': 1}, {'level': 0, 'title': ladder[1], 'times_per_day': 1}, {'level': 1, 'title': ladder[2], 'times_per_day': 1}]
            out.append(
                "insert into public.task_definitions (stable_key, source, source_ref, step_id, habit_key, title, description, emoji, schedule, times_per_day, ladder, floor_level, max_level) values "
                f"('step:{step_id}:t1', 'step', 't1', '{step_id}', {q(habit)}, {q(task[0])}, {q(task[1])}, {q(emoji)}, {q(task[2])}, {task[3]}, {j(lad)}, -1, 1) "
                "on conflict (stable_key) do update set ladder=excluded.ladder, habit_key=excluded.habit_key, floor_level=-1, max_level=1;")
        step_no += 1
# legacy step (old curriculum) keeps its content but leaves the main numbering
out.append("update public.journey_steps set step_number = 900 where id = '012af416-d33d-4e11-ae6c-0badd0c3e66d';")
out.append("update public.journey_steps set station_id = (select id from public.journey_stations where track='legacy' order by sort_order limit 1) where id = '012af416-d33d-4e11-ae6c-0badd0c3e66d';")
open('/workspace/NuraWell/supabase/migrations/000105_curriculum_14_stations.sql','w').write('\n'.join(out)+'\n')
print(step_no-1, 'steps')
