# בדיקות: "רגע… קשה לי" (SOS) + Guardian

> **אין צורך במשתני סביבה חדשים.** SOS, pivot, זיכרון, follow-up וצ'אט — עובדים out-of-the-box.
> AI להצעות: **OpenRouter** (`OPENROUTER_API_KEY`, מודל `meta-llama/llama-4-scout` — כמו שאר הרקע). אין Groq.

מדריך בדיקה ידני לאחר שדרוג מערכת SOS — כולל CRON, זיכרון, pivot, וצ'אט.

---

## 0. שני כפתורים — לא לבלבל

| מיקום | שם | מתי |
|--------|-----|-----|
| **בית** | "רגע… קשה לי 🌿" | רגע קשה **עכשיו** (לפני ש"בורח") |
| **מסע → כרטיס רמה** | "הרמה קשה לי" | המשימה **קשה מדי לאורך זמן** → הורדת רמה + תוכנית |

---

## 1. בדיקות UI — SOS (בית)

### 1.1 כפתור
- [ ] הכפתור **לא לבן** — גradient ענבר/זהב, סגנון iOS
- [ ] טקסט: "רגע… קשה לי 🌿"
- [ ] אם יש משימות פתוחות — מופיע "יש X משימות פתוחות"

### 1.2 פופאפ — מיקום ועיצוב
- [ ] בנייד: הפופאפ **ממורכז** (לא דחוף למטה)
- [ ] הדר **ירוק** עם כותרת לבנה (כמו 404)
- [ ] גוף **זכוכית** (שקוף + blur)

### 1.3 הקשר — על מה מדובר
- [ ] שלב 1: בחירת משימה מהיום (או "לא קשור למשימה")
- [ ] שלב 2: טריגר (לחוץ / משעמם / מתחשק)
- [ ] אופציונלי: טקסט חופשי
- [ ] בתוצאה: "ההצעה מותאמת ל: 🥗 [שם משימה]"

### 1.4 זיכרון בפופאפ
- [ ] בלוק "מה אלמוג זוכר" — מה עזר / מה לא (אחרי שיש היסטוריה)
- [ ] מתחת לכפתור SOS: כרטיס **"מה עזר לך לאחרונה"** (אחרי שימוש ראשון)

### 1.5 משוב + pivot
- [ ] "עבר — תודה 🌱" → סגירה + "שמרתי"
- [ ] "עדיין קשה — ננסה אחרת" → **לא נסגר** — מוצגת הצעה **חדשה** (עד 2 pivots)
- [ ] אחרי pivot: הודעה "בוא ננסה גישה אחרת"

### 1.6 המשך
- [ ] "לדבר עם אלמוג" → נפתח צ'אט עם טקסט ממולא על הרגע
- [ ] "סימנתי — עשיתי 🎯" (אם נבחרה משימה עם step_id) → **POST** ל-`/api/v1/task-executions` עם `source: "sos"` (לא רק צ'אט)
- [ ] אחרי סימון: הודעה "סימנתי את המשימה ✓" + רענון הבית (המשימה מסומנת במסע)
- [ ] אם אין step_id — fallback לצ'אט
- [ ] הודעה: "אשלח לך בעוד ~שעה הודעה קטנה" (follow-up)
- [ ] אחרי SOS ראשון (אם לא opt-in): הצעה "כן, תזכיר לי בעדינות" → `PATCH /api/v1/profile/guardian-settings`

### 1.7 כרטיס היסטוריה + מסך מלא
- [ ] כרטיס "מה עזר לך לאחרונה" — קישור **"ראה הכל"**
- [ ] `/settings/sos-moments` — רשימת רגעים לפי תאריך + בלוק "מה אלמוג למד"

---

## 2. בדיקות API (DevTools → Network)

### GET `/api/v1/ai/sos`
```json
{ "ok": true, "memory": [...], "recent_events": [...] }
```

**פרמeters (אופציונלי):**
- `memory_limit` — ברירת מחדל 8, מקסימום 30
- `events_limit` — ברירת מחדל 5, מקסימום 50

דוגמה למסך היסטוריה:
```
GET /api/v1/ai/sos?memory_limit=24&events_limit=40
```

### POST `/api/v1/ai/sos`
Body:
```json
{
  "trigger": "emotional",
  "note": "יום עמוס",
  "focus_task": { "id": "...", "title": "...", "step_id": "..." }
}
```
בדוק בתגובה:
- [ ] `event_id` — לא null
- [ ] `intervention_id` — לא null
- [ ] `blocker_id` — לא null
- [ ] `follow_up_scheduled: true`

### PATCH `/api/v1/ai/sos`
```json
{
  "event_id": "...",
  "intervention_id": "...",
  "guardian_outcome": "passed",
  "helped": true
}
```

### POST pivot
```json
{
  "action": "pivot",
  "trigger": "emotional",
  "intervention_id": "...",
  "pivot_from_label": "דקת נשימה",
  "failed_strategy_types": ["emotional_regulation"],
  "pivot_attempt": 0
}
```

### POST `/api/v1/task-executions` (סימון מ-SOS)
```json
{
  "step_id": "<uuid>",
  "task_id": "...",
  "slot": "morning",
  "date_key": "2026-06-20",
  "source": "sos",
  "outcome": "completed",
  "note": "סומן מ\"SOS — רגע… קשה לי\""
}
```
בדוק:
- [ ] `success: true` + שורה ב-`journey_task_executions` עם `source = sos`
- [ ] המשימה מסומנת ב-UI (בית / מסע) אחרי refresh

### GET/PATCH `/api/v1/profile/guardian-settings`
```json
{ "ok": true, "opted_in": false, "opted_in_at": null, "muted_until": null }
```
```json
{ "opted_in": true }
```

---

## 3. בדיקות DB (Supabase)

אחרי SOS מוצלח:

| טבלה | מה לבדוק |
|------|-----------|
| `guardian_sos_events` | שורה חדשה, `outcome` = unknown → passed/fell אחרי משוב |
| `almog_interventions` | `outcome` = pending → helped/not_helped |
| `almog_blockers` | `dedupe_key` = `sos\|<task_id>` |
| `scheduled_reminders` | `metadata.source` = `sos_followup`, `fire_at` ~+60 דק |
| `journey_task_executions` | אחרי "סימנתי — עשיתי": `source = sos`, `outcome = completed` |
| `profiles.ai_context.guardian` | אחרי opt-in: `opted_in: true`, `opted_in_at` |

אחרי "הרמה קשה לי" במסע:
- [ ] אותו `almog_blockers.dedupe_key` מקבל `journey_too_hard: true` ב-metadata
- [ ] `bridge-journey-recovery` יוצר assignment ב"התוכנית שלי"

---

## 4. בדיקות צ'אט

1. בצע SOS על משימה
2. לחץ "לדבר עם אלמוג"
3. [ ] אלמוג **לא שואל מחדש** "על מה קשה" — יש לו בלוק `[רגעים קשים אחרונים — SOS]` בפרומפט
4. [ ] תגובה ספציפית למשימה שהוזכרה

---

## 5. CRON — follow-up SOS (~60 דק)

**לא צריך Schedule חדש.** Follow-up נשלח דרך:

```
POST /api/v1/ai/cron/onboarding-check-ins  (כל 30 דק — QStash)
  └─ drain-reminders → scheduled_reminders (source: sos_followup)
```

### בדיקה מהירה
1. בצע SOS
2. ב-Supabase: `scheduled_reminders` WHERE `metadata->>'source' = 'sos_followup'`
3. [ ] `fire_at` בעוד ~60 דקות
4. (אופציונלי) עדכן `fire_at` ל-`now()` ובדוק שהתזכורת נשלחת ב-cron הבא

---

## 6. Guardian יזום — "רגע לפני"

> **לא נדרש ל-SOS.** SOS תמיד פעיל. "רגע לפני" = מגע **יזום** לפני חלון סיכון — דורש **opt-in** של המשתמש.

### ברירת מחדל בקוד
- `GUARDIAN_FINGERPRINT_ENABLED` / `GUARDIAN_PROACTIVE_ENABLED` — **פעיל** (כיבוי רק עם `=0`)
- `GUARDIAN_KILL_SWITCH=1` — עוצר **רק** מגע יזום, לא SOS

### איך להפעיל opt-in (משתמש)
1. **הגדרות** → `/settings/almog` → מתג "לאפשר מגע רגע לפני"
2. **או** אחרי SOS ראשון → "כן, תזכיר לי בעדינות" בפופאפ

### בדיקות opt-in
- [ ] `GET /api/v1/profile/guardian-settings` → `opted_in: false` לפני
- [ ] הפעלת מתג → `PATCH` → `opted_in: true` + `opted_in_at` ב-DB
- [ ] `profiles.ai_context.guardian_opted_in` = true

### בדיקת cron (dry-run)
```bash
curl -i -X POST "https://nurawell.vercel.app/api/v1/ai/cron/habit-checkpoints?slot=morning&dryRun=1" \
  -H "Authorization: Bearer <CRON_SECRET>" \
  -H "Content-Length: 0"
```

**ללא opt-in** — בתגובה:
```json
{ "guardian_schedules_planned": 0 }
```
(או skip בגלל `not_opted_in`)

**עם opt-in + מספיק היסטוריית SOS** — חפש:
```json
{
  "guardian_fingerprints_computed": 12,
  "guardian_schedules_planned": 3
}
```

### QStash Schedules (כבר פעילים אצלכם)
| Schedule | תפקיד |
|----------|--------|
| `master` 05:00 | memory consolidation |
| `onboarding-check-ins` כל 30 דק | תזכורות + **SOS follow-up** |
| `habit-checkpoints` בוקר/צהריים/ערב | habit + **Guardian fingerprint/trigger** |

---

## 7. מסך היסטוריה מלא

**נתיב:** `/settings/sos-moments`

### בדיקות UI
1. בצע לפחות SOS אחד עם משוב
2. בבית — כרטיס "מה עזר לך לאחרונה" → **"ראה הכל"**
3. [ ] נפתח מסך עם:
   - בלוק "מה אלמוג למד" (עזר / פחות התאים)
   - "רגעים לפי תאריך" — תג outcome, טריגר, משימה
4. [ ] מצב ריק — הודעה "עדיין אין רגעים" + קישור לבית

### בדיקת API
```
GET /api/v1/ai/sos?memory_limit=24&events_limit=40
```
- [ ] `recent_events.length` עד 40
- [ ] `memory.length` עד 24

---

## 8. סימון משימה אוטומטי מ-SOS

### תרחיש
1. בית → SOS → בחר **משימה פתוחה מהיום** (חייב `step_id`)
2. קבל הצעה → **"סימנתי — עשיתי 🎯"**
3. [ ] Network: `POST /api/v1/task-executions` עם `source: "sos"`
4. [ ] הודעה: "סימנתי את המשימה ✓"
5. [ ] סגור → בבית/מסע המשימה **מסומנת** (לא רק בצ'אט)

### DB
```sql
SELECT * FROM journey_task_executions
WHERE user_id = '<uid>' AND source = 'sos'
ORDER BY completed_at DESC LIMIT 5;
```

### edge cases
- [ ] משימה **בלי** step_id → fallback לצ'אט (לא POST)
- [ ] לחיצה כפולה — idempotent (אותו slot ביום)

---

## 9. תרחיש end-to-end מומלץ

1. **בית** → SOS על משימה פתוחה → "לחוץ" → קרא הצעה
2. **"סימנתי — עשיתי"** → וודא סימון במסע + `source=sos` ב-DB
3. **"עדיין קשה"** → וודא pivot עם הצעה שונה
4. **"עבר — תודה"** → כרטיס "מה עזר" מתעדכן → **"ראה הכל"** → מסך היסטוריה
5. **opt-in** → הגדרות מאלמוג או מהפופאפ אחרי SOS
6. **צ'אט** → אלמוג מזכיר את הרגע
7. **מסע** → "הרמה קשה לי" על אותה משימה → תוכנית מותאמת + קישור ב-blocker
8. **~60 דק** (או שינוי fire_at) → התראת follow-up

---

## 10. תקלות שכיחות

| תסמין | סיבה | פתרון |
|--------|------|--------|
| SOS 503 | שגיאת שרת / auth | בדוק Network tab + logs |
| `event_id` null | insert נכשל / RLS | בדוק logs `[sos] insert failed` |
| אין follow-up | cron לא רץ | וודא QStash onboarding-check-ins פעיל |
| Guardian לא שולח | opt-in / flags | opt-in ב-`/settings/almog` + לא `GUARDIAN_*=0` |
| סימון SOS לא עובד | חסר step_id | בחר משימה מהיום (לא "לא קשור") |
| היסטוריה ריקה | אין SOS | בצע SOS + משוב קודם |
| pivot זהה | LLM timeout | fallback — עדיין שונה strategy_type בDB |

---

## 11. קבצים רלוונטיים

| קובץ | תפקיד |
|------|--------|
| `components/ai/SosButton.tsx` | כפתור בית |
| `components/ai/SosDialog.tsx` | פופאפ + סימון משימה + opt-in |
| `components/ai/SosMemoryCard.tsx` | היסטוריה בבית + "ראה הכל" |
| `components/settings/SosMomentsClient.tsx` | מסך היסטוריה מלא |
| `app/(dashboard)/settings/sos-moments/page.tsx` | route היסטוריה |
| `components/settings/AlmogNudgeSettingsClient.tsx` | מתג "רגע לפני" |
| `lib/ai/guardian/guardian-feature-flags.ts` | דגלי env (ברירת מחדל ON) |
| `lib/ai/guardian/guardian-user-settings.ts` | opt-in ב-ai_context |
| `app/api/v1/profile/guardian-settings/route.ts` | API opt-in |
| `lib/ai/guardian/sos-memory.ts` | זיכרון, pivot, follow-up |
| `app/api/v1/ai/sos/route.ts` | API SOS + limits |
| `app/api/v1/task-executions/route.ts` | סימון משימה (`source: sos`) |
| `lib/ai/almog-commitments/chat-context.ts` | SOS → צ'אט |
| `docs/CRON_SCHEDULES_SETUP.md` | תזמונים QStash |
