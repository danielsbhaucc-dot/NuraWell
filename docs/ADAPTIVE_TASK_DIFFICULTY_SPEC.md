# מפרט: מילוי AI חכם עם שאלות חידוד + מודל קושי הדרגתי למשימות

> **מסמך המשכיות.** נכתב כדי שאפשר יהיה לפתוח אותו מחר גם ממחשב חדש, להבין את
> כל הבקשה, ולתכנן/לבנות בלי להסתמך על זיכרון השיחה.
>
> תאריך: 7 ביוני 2026. סטטוס: **טרם הוחל יישום** לתכונה הזו. נעשה רק מיפוי
> ארכיטקטוני, התקבלו החלטות מוצר, ונכתב מסמך זה.

---

## 0. TL;DR

המטרה היא לשדרג את מילוי הצעד האוטומטי עם AI כך שהוא לא רק "ממלא טופס", אלא
מנהל תהליך חכם:

1. המנהל מדביק טקסט חופשי, רשימת מחקרים, תמלול, או חומרים מעורבים.
2. ה-AI מנתח מה חסר ומנהל עם המנהל שיחת שאלות חידוד.
3. התהליך מחולק לשלושה שלבי הבנה:
   - שלב 1: מה המחקר אומר.
   - שלב 2: מה תמלול/תוכן השיעור אומר.
   - שלב 3: מה יעד המשתמש בשיעור הזה: המשימה העיקרית, ההרגל, וההתנהגות הרצויה.
4. לאחר שהמודל מבין מספיק, הוא מזין אוטומטית את הצעד: כותרת, סיכום, שאלות,
   משחק, התחייבות, מחקרים, משימות, הרגלים, ונקודות קשב.
5. לכל משימה נוצרת "סולם רמות קושי" הדרגתי מהקל/מותאם ועד היעד המומלץ.
6. מערכת ההתראות וההתקדמות תדע מתי המשתמש מצליח ברמה הנוכחית, מתי להציע לו
   לעלות רמה, ומתי להתחיל לספור רצף של ההרגל ברמה המומלצת.
7. רצף ההרגל צריך להתחלק לשניים:
   - רצף ההרגל עצמו.
   - רצף ההרגל ברמה המומלצת/היעד.
8. יוצג גרף התקדמות אמיתי לפי שכבות הקושי.

המשתמש בחר: **לבנות הכל בבת אחת**, עם מנגנון העלאת רמה שמשלב גם רצף הצלחות
וגם דיווח עצמי של המשתמש שזה קל לו. לגבי נקודת ההתחלה: **אופציה B** -
מתחילים ברמה מומלצת שה-AI קובע, ואפשר לרדת/לעלות לפי קושי.

---

## 1. ניסוח הבקשה המקורית

המשתמש ביקש לשכלל את AI auto-fill:

- כאשר מדביקים הכל, המודל ינתח הכל.
- אם חסר לו מידע, הוא ישאל שאלות חידוד, כמו שיחה.
- דוגמאות לשאלות:
  - מה תמלול השיעור?
  - מה התלמיד מקבל מהשיעור?
  - מה המחקר אומר?
  - מה היעד של המשתמש בשיעור הזה?
  - מה המשימה העיקרית?
  - מה ההרגל?
- החלוקה הרצויה:
  - שלב 1: המחקר.
  - שלב 2: תמלול השיעור.
  - שלב 3: יעד המשתמש, משימה עיקרית והרגל.
- לאחר החידוד, המודל יזין הכל אוטומטית.

בנוסף, המשתמש ביקש להוסיף שכבות עומק לכל משימה:

דוגמה 1:

- משימה מומלצת: לשתות 2 כוסות מים.
- אם קשה למשתמש: כוס מים אחת.
- אם עדיין קשה: חצי כוס.
- אם קל: להקטין את הטווח/לשפר את התנאי, למשל לשתות סמוך יותר לזמן הרצוי או
  להגדיל את הכמות לפי היעד.

דוגמה 2:

- יעד מומלץ: לא לאכול 3 שעות לפני השינה.
- אם קל: לא לאכול כבר משש בערב.
- אם קשה: שעתיים לפני השינה.
- אם עדיין קשה: שעה.
- אם עדיין קשה: חצי שעה.

הכוונה היא לבנות מודל הדרגתי ואלגוריתם חכם שיודע:

- להתאים את רמת הקושי למשתמש.
- לשלוח התראה בזמן הנכון כדי להציע להגדיל את רמת הקושי.
- להוביל את המשתמש בהדרגה עד הטווח הרצוי באמת.
- להציג גרף התקדמות אמיתי לפי שכבות.
- להתחיל רצף הרגל מלא רק כאשר מגיעים למשימה הרצויה/הרמה המומלצת.

---

## 2. החלטות שהתקבלו בשיחה

### 2.1 היקף היישום

נשאלה שאלה איך להתקדם:

- לפי הסדר: יסוד נתונים ואז שאר השלבים.
- קודם שאלות חידוד ואז שכבות.
- לבנות הכל בבת אחת.

החלטת המשתמש: **לבנות הכל בבת אחת**.

### 2.2 מתי להציע העלאת רמה

נשאלה שאלה מתי המערכת תציע למשתמש להעלות רמת קושי:

- אחרי X ימים רצופים של הצלחה.
- רק כשהמשתמש מדווח שזה קל לו.
- שילוב של שניהם.

החלטת המשתמש: **שילוב**.

המשמעות:

- רצף הצלחות ברמה הנוכחית במשך X ימים יכול לגרום להצעת העלאת רמה.
- אם המשתמש מדווח "קל לי", זה יכול לזרז העלאה.
- אם המשתמש מדווח "קשה לי", המערכת יכולה להציע לרדת רמה או להישאר.

ברירת מחדל מוצעת: `level_up_after_success_days = 7`, אך ניתן להגדיר לכל משימה.

### 2.3 מאיזו רמה מתחילים

נשאלה שאלה:

- להתחיל בקל ביותר ולטפס אוטומטית.
- להתחיל ברמה מומלצת שה-AI קובע, ואפשר לרדת/לעלות לפי קושי.

החלטת המשתמש: **אופציה B**.

המשמעות:

- ה-AI יציע `start_level_id`.
- ה-AI יציע `recommended_level_id` או `target_level_id`.
- אם למשתמש קשה, אפשר לרדת לרמה קלה יותר.
- אם קל או שיש הצלחה עקבית, אפשר לעלות לרמה מאתגרת יותר/מומלצת יותר.

---

## 3. מצב קיים בקוד

### 3.1 AI auto-fill

קבצים מרכזיים:

- `apps/web/app/api/v1/admin/journey-steps/ai-fill/route.ts`
- `apps/web/components/admin/StepEditor.tsx`
- `apps/web/lib/admin/research-scan.ts`
- `apps/web/app/api/v1/admin/research/scan/route.ts`

מה כבר קיים:

- ה-AI מקבל `sourceText` ומחזיר צעד מלא.
- יש חילוץ דטרמיניסטי של URL-ים מתוך הטקסט.
- כל מחקר עם URL נסרק בפועל בעזרת `scanResearchSource`.
- יש progress streaming ב-NDJSON:
  - `analyze`
  - `generated`
  - `research`
  - `done`
  - `error`
- הקליינט קורא את ה-stream ומעדכן progress bar לפי אירועים אמיתיים.
- תוקן מצב שבו שגיאה הוצגה כ-`[object Object]`.

### 3.2 סוגי Journey

קובץ מרכזי:

- `apps/web/lib/types/journey.ts`

מבנים קיימים:

- `JourneyStep`
- `Research`
- `JourneyTask`
- `JourneyHabit`
- `JourneyStepProgress`
- `JourneyTaskExecution`

משימה כיום:

```ts
export interface JourneyTask {
  id: string;
  title: string;
  description: string | null;
  emoji: string;
  schedule?: JourneyTaskSchedule;
  times_per_day?: number | null;
  weekly_day?: number | null;
  meal_timing?: MealTiming | null;
  meal_target?: MealTarget | null;
}
```

הרגל כיום:

```ts
export interface JourneyHabit {
  id: string;
  title: string;
  description: string | null;
  emoji: string;
  frequency: 'daily' | 'weekly' | 'per_meal';
  weekly_day?: number | null;
  meal_timing?: MealTiming | null;
  meal_target?: MealTarget | null;
  target_days?: number | null;
}
```

אין כיום מודל קיים של `difficulty`, `level`, `tier`, או סולם קושי למשימה.

### 3.3 Validation

קובץ:

- `apps/web/lib/validation/admin-journey-step.ts`

צריך להרחיב:

- `journeyTaskSchema`
- אולי `journeyHabitSchema`

כדי לשמור שכבות קושי ב-JSONB של `journey_steps.tasks`.

### 3.4 מקור אמת לביצוע משימות

טבלה:

- `journey_task_executions`

מיגרציות:

- `supabase/migrations/000023_journey_task_executions.sql`
- `supabase/migrations/000030_journey_task_execution_outcome.sql`
- `supabase/migrations/000031_response_outcomes_expansion.sql`

עמודות מרכזיות:

- `id`
- `user_id`
- `step_id`
- `task_id`
- `date_key`
- `slot`
- `completed_at`
- `source`
- `note`
- `outcome`

ייחודיות:

- `UNIQUE(user_id, step_id, task_id, date_key, slot)`

`date_key` הוא לפי ירושלים, בפורמט `YYYY-MM-DD`.

סלוטים מגיעים מ:

- `apps/web/lib/journey/task-schedule.ts`

### 3.5 מעקב הרגלים

קובץ מרכזי:

- `apps/web/lib/journey/habit-progress.ts`

רעיון קיים:

- הרגל = מטרה.
- משימה = פעולה.
- התקדמות הרגל נגזרת מ-`journey_task_executions`.

פונקציות חשובות:

- `computeHabitProgressSnapshot`
- `recommendHabitTargetAdjustment`

כבר קיים מנגנון מסוים להתאמת `target_days`, אבל לא לרמות קושי של משימות.

### 3.6 State פר משתמש

טבלה:

- `journey_progress`

שדות קיימים:

- `tasks_completed`
- `task_statuses`
- `habits_progress`
- `habit_meta`

מיגרציה:

- `supabase/migrations/000024_habit_meta_and_notify_dedupe.sql`

`habit_meta` משמש כיום ל:

- `target_days`
- `streak_current`
- `streak_best`
- `achieved_at`
- `extended_by`

אין כיום state פר משתמש לרמת קושי נוכחית של task.

### 3.7 התראות / Cron / Workflow

קבצים מרכזיים:

- `apps/web/app/api/v1/ai/cron/habit-checkpoints/route.ts`
- `apps/web/lib/workflows/habit-checkpoint-batch.ts`
- `apps/web/lib/workflows/send-almog-habit-checkpoint.ts`
- `apps/web/lib/workflows/send-almog-task-followup.ts`
- `apps/web/app/api/workflows/almog-habit-checkpoint/route.ts`
- `apps/web/lib/workflows/habit-checkpoint-gates.ts`
- `apps/web/lib/push/send-web-push.ts`
- `apps/web/lib/push/deliver-after-notification.ts`

המקום המרכזי להחלטה למי לשלוח:

- `apps/web/lib/workflows/habit-checkpoint-batch.ts`

המקום המרכזי שבו נבנית הודעה:

- `apps/web/lib/workflows/send-almog-habit-checkpoint.ts`

קיים cron דומה להתאמת יעד:

- `apps/web/app/api/v1/ai/cron/habit-target-tune/route.ts`

זה יכול להיות עוגן טוב להוספת tuning של difficulty level.

### 3.8 UI התקדמות

קבצים:

- `apps/web/components/journey/HabitProgressCard.tsx`
- `apps/web/components/progress-report/ProgressReportProvider.tsx`
- `apps/web/app/(dashboard)/progress/page.tsx`
- `apps/web/components/progress/TaskHistoryClient.tsx`
- `apps/web/components/journey/JourneyPage.tsx`

אין שימוש ב-Recharts שנמצא במיפוי. רוב הגרפים הם CSS/SVG/פסים/heatmap.

---

## 4. מודל נתונים מוצע

### 4.1 הרחבת JourneyTask

להוסיף לכל משימה שדות אופציונליים:

```ts
export type TaskDifficultyFeedback = 'too_easy' | 'ok' | 'too_hard';

export interface JourneyTaskDifficultyLevel {
  id: string;
  label: string;
  description: string;
  emoji?: string;
  order: number;
  is_recommended?: boolean;
  is_minimum_viable?: boolean;
  metric?: {
    kind:
      | 'quantity'
      | 'time_before_event'
      | 'time_after_event'
      | 'time_of_day'
      | 'frequency'
      | 'duration'
      | 'custom';
    value?: number | string | null;
    unit?: 'cups' | 'minutes' | 'hours' | 'times' | 'days' | 'custom';
    direction?: 'higher_is_harder' | 'lower_is_harder' | 'custom';
  };
}

export interface JourneyTaskLevelingConfig {
  levels: JourneyTaskDifficultyLevel[];
  start_level_id: string | null;
  recommended_level_id: string | null;
  level_up_after_success_days: number;
  allow_user_downgrade: boolean;
  allow_user_upgrade: boolean;
  ai_rationale?: string | null;
}
```

ולהרחיב:

```ts
export interface JourneyTask {
  // existing fields...
  leveling?: JourneyTaskLevelingConfig | null;
}
```

### 4.2 דוגמה: מים

```json
{
  "title": "לשתות מים בבוקר",
  "emoji": "💧",
  "schedule": "daily",
  "leveling": {
    "start_level_id": "water-1-cup",
    "recommended_level_id": "water-2-cups",
    "level_up_after_success_days": 7,
    "allow_user_downgrade": true,
    "allow_user_upgrade": true,
    "ai_rationale": "היעד המומלץ הוא 2 כוסות, אך התחלה בכוס אחת מפחיתה חיכוך.",
    "levels": [
      {
        "id": "water-half-cup",
        "label": "חצי כוס מים",
        "description": "אם קשה להתחיל, רק חצי כוס כדי לבנות רצף.",
        "order": 0,
        "is_minimum_viable": true,
        "metric": { "kind": "quantity", "value": 0.5, "unit": "cups", "direction": "higher_is_harder" }
      },
      {
        "id": "water-1-cup",
        "label": "כוס מים אחת",
        "description": "רמת התחלה מומלצת לרוב המשתמשים.",
        "order": 1,
        "metric": { "kind": "quantity", "value": 1, "unit": "cups", "direction": "higher_is_harder" }
      },
      {
        "id": "water-2-cups",
        "label": "2 כוסות מים",
        "description": "היעד הרצוי לשיעור הזה.",
        "order": 2,
        "is_recommended": true,
        "metric": { "kind": "quantity", "value": 2, "unit": "cups", "direction": "higher_is_harder" }
      }
    ]
  }
}
```

### 4.3 דוגמה: לא לאכול לפני השינה

```json
{
  "title": "לא לאכול לפני השינה",
  "emoji": "🌙",
  "schedule": "daily",
  "leveling": {
    "start_level_id": "sleep-food-2h",
    "recommended_level_id": "sleep-food-3h",
    "level_up_after_success_days": 7,
    "allow_user_downgrade": true,
    "allow_user_upgrade": true,
    "levels": [
      {
        "id": "sleep-food-30m",
        "label": "לא לאכול חצי שעה לפני השינה",
        "description": "רמת כניסה מינימלית למי שקשה לו מאוד.",
        "order": 0,
        "is_minimum_viable": true,
        "metric": { "kind": "time_before_event", "value": 30, "unit": "minutes", "direction": "higher_is_harder" }
      },
      {
        "id": "sleep-food-1h",
        "label": "לא לאכול שעה לפני השינה",
        "description": "שלב ביניים קל.",
        "order": 1,
        "metric": { "kind": "time_before_event", "value": 60, "unit": "minutes", "direction": "higher_is_harder" }
      },
      {
        "id": "sleep-food-2h",
        "label": "לא לאכול שעתיים לפני השינה",
        "description": "רמת התחלה מומלצת אם המשתמש כבר בשל לשינוי.",
        "order": 2,
        "metric": { "kind": "time_before_event", "value": 120, "unit": "minutes", "direction": "higher_is_harder" }
      },
      {
        "id": "sleep-food-3h",
        "label": "לא לאכול 3 שעות לפני השינה",
        "description": "היעד הרצוי.",
        "order": 3,
        "is_recommended": true,
        "metric": { "kind": "time_before_event", "value": 180, "unit": "minutes", "direction": "higher_is_harder" }
      },
      {
        "id": "sleep-food-18",
        "label": "לא לאכול אחרי 18:00",
        "description": "רמת אתגר גבוהה למי שקל לו מאוד.",
        "order": 4,
        "metric": { "kind": "time_of_day", "value": "18:00", "unit": "custom", "direction": "custom" }
      }
    ]
  }
}
```

### 4.4 State פר משתמש מוצע

האפשרות הפשוטה ביותר: להוסיף `task_level_meta JSONB` ל-`journey_progress`.

מבנה מוצע:

```json
{
  "taskId": {
    "current_level_id": "sleep-food-2h",
    "recommended_level_id": "sleep-food-3h",
    "started_level_id": "sleep-food-2h",
    "current_level_started_at": "2026-06-07T00:00:00.000Z",
    "last_feedback": "ok",
    "last_feedback_at": "2026-06-07T00:00:00.000Z",
    "success_streak_current_level": 4,
    "success_days_current_level": 5,
    "best_level_id": "sleep-food-2h",
    "reached_recommended_at": null,
    "recommended_streak_current": 0,
    "recommended_streak_best": 0,
    "level_up_suggested_at": null,
    "level_up_declined_at": null
  }
}
```

חלופה יציבה יותר לטווח ארוך: טבלה ייעודית.

```sql
create table journey_task_level_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  step_id uuid not null references journey_steps(id) on delete cascade,
  task_id text not null,
  current_level_id text not null,
  recommended_level_id text,
  started_level_id text,
  current_level_started_at timestamptz not null default now(),
  last_feedback text,
  last_feedback_at timestamptz,
  success_streak_current_level int not null default 0,
  success_days_current_level int not null default 0,
  best_level_id text,
  reached_recommended_at timestamptz,
  recommended_streak_current int not null default 0,
  recommended_streak_best int not null default 0,
  level_up_suggested_at timestamptz,
  level_up_declined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, step_id, task_id)
);
```

המלצה: להתחיל עם `task_level_meta JSONB` בתוך `journey_progress` כדי להשתלב מהר
עם המערכת הקיימת, אבל אם צפויות שאילתות/גרפים כבדים, עדיף טבלה ייעודית.

---

## 5. זרימת AI fill החדשה

### 5.1 התנהגות רצויה

כיום: המנהל מדביק טקסט -> מקבל צעד מלא.

רצוי: המנהל מדביק טקסט -> המודל מנתח -> אם חסר מידע, הוא שואל שאלות -> המנהל
עונה -> המודל ממלא צעד מלא.

### 5.2 שלבי החידוד

שלב 1: מחקר

- אילו מחקרים יש?
- מה כל מחקר אומר?
- האם המחקר קשור ישירות למשימה/הרגל?
- האם יש מגבלות או סייגים?
- מה לא להגיד למשתמש כדי לא להפריז?

שלב 2: תמלול שיעור

- מה תמלול השיעור?
- מה התלמיד מקבל?
- מה המסר המרכזי?
- מה הידע המעשי שהתלמיד אמור לקחת?
- אילו שאלות/משחק/נקודות קשב מתאימות?

שלב 3: יעד המשתמש

- מה היעד ההתנהגותי של השיעור?
- מה המשימה העיקרית?
- מה ההרגל?
- מה הרמה המומלצת?
- מה רמות הקושי הקלות/בינוניות/מתקדמות?
- מתי נכון להציע העלאת רמה?

### 5.3 API מוצע

אפשרות מומלצת: להוסיף endpoint חדש.

- `POST /api/v1/admin/journey-steps/ai-fill/session`

פעולות:

```ts
type AiFillSessionAction =
  | 'start'
  | 'answer'
  | 'generate';
```

בקשה:

```ts
type AiFillSessionRequest = {
  action: AiFillSessionAction;
  sourceText?: string;
  sessionId?: string;
  answers?: Record<string, string>;
  stepNumber?: number;
};
```

תשובה אפשרית אחרי `start` או `answer`:

```ts
type AiFillClarificationResponse = {
  ok: true;
  status: 'needs_clarification';
  sessionId: string;
  phase: 'research' | 'lesson_transcript' | 'user_goal';
  summary_so_far: string;
  questions: Array<{
    id: string;
    label: string;
    help_text?: string;
    input_type: 'textarea' | 'text' | 'select';
    required: boolean;
  }>;
};
```

תשובה סופית:

```ts
type AiFillDoneResponse = {
  ok: true;
  status: 'done';
  step: AiFilledStep;
  research_scan: {
    detected_links: number;
    researches: number;
    scanned: number;
    errors: string[];
  };
};
```

### 5.4 שמירת session

אפשר להתחיל בלי DB, עם state בצד הקליינט בלבד:

- `sourceText`
- `analysisSummary`
- `answers`
- `phase`

אבל אם רוצים שלא יאבד ברענון:

טבלה מוצעת:

```sql
create table admin_ai_fill_sessions (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  source_text text not null,
  phase text not null,
  status text not null default 'needs_clarification',
  summary_so_far text,
  questions jsonb not null default '[]'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  generated_step jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

המלצה: לשלב ראשון אפשר לשמור state ב-React בלבד. אם התהליך נהיה ארוך/יקר, לעבור
לטבלה.

---

## 6. אלגוריתם התאמת רמות

### 6.1 חישוב הצלחה ברמה נוכחית

מקור אמת: `journey_task_executions`.

הצלחה ביום מסוים:

- לכל הסלוטים הנדרשים לפי `task.schedule` יש execution.
- `outcome` הוא `completed`.
- אם יש `partial`, אפשר להחשיב כחצי הצלחה או לא להחשיב, לפי החלטה עתידית.

לצורך גרסה ראשונה:

- `completed` = הצלחה.
- `partial`, `attempt_failed`, `skipped` = לא הצלחה מלאה.

### 6.2 העלאת רמה

להציע העלאת רמה אם אחד מתקיים:

1. `success_streak_current_level >= level_up_after_success_days`.
2. המשתמש סימן feedback `too_easy`.

לא להציע אם:

- כבר ברמה המומלצת או מעליה, אלא אם יש רמת אתגר מעל היעד והמוצר רוצה להציע אותה.
- המשתמש דחה העלאת רמה לאחרונה (`level_up_declined_at`) ועדיין לא עבר cooldown.
- יש fatigue/push gate שמונע התראה.

### 6.3 הורדת רמה

להציע הורדת רמה אם:

- המשתמש סימן `too_hard`.
- יש רצף כישלונות ברמה הנוכחית, למשל 3 ימים ללא השלמה.

ברירת מחדל:

- לא להוריד אוטומטית בלי אישור משתמש.
- כן להציע ניסוח תומך: "רוצה שנוריד לרמה קלה יותר ליומיים ונבנה מומנטום?"

### 6.4 מתי מתחיל רצף ההרגל המומלץ

יש שני רצפים:

1. `habit_streak_any_level`
   - כל יום שבו המשתמש ביצע את המשימה/הרגל ברמה הנוכחית, גם אם זו רמה קלה.
2. `habit_streak_recommended_level`
   - רק ימים שבהם המשתמש ביצע ברמת היעד המומלצת או מעליה.

כאשר `current_level_id === recommended_level_id` והמשתמש משלים יום:

- מגדילים גם את הרצף הכללי.
- מגדילים גם את רצף הרמה המומלצת.

כאשר המשתמש מתחת לרמה המומלצת:

- מגדילים רק את הרצף הכללי.
- רצף הרמה המומלצת לא מתחיל/לא מתקדם.

---

## 7. נקודות חיבור בקוד

### 7.1 Types

קובץ:

- `apps/web/lib/types/journey.ts`

להוסיף:

- `JourneyTaskDifficultyLevel`
- `JourneyTaskLevelingConfig`
- `TaskDifficultyFeedback`
- שדה `leveling?: JourneyTaskLevelingConfig | null` בתוך `JourneyTask`
- אולי טיפוס `JourneyTaskLevelMeta`

### 7.2 Validation

קובץ:

- `apps/web/lib/validation/admin-journey-step.ts`

להוסיף:

- `taskDifficultyLevelSchema`
- `taskLevelingSchema`
- `leveling` בתוך `journeyTaskSchema`

### 7.3 AI fill route

קובץ:

- `apps/web/app/api/v1/admin/journey-steps/ai-fill/route.ts`

להרחיב:

- `AiFilledStep.tasks[]` עם `leveling`.
- `normalizeFilledStep` ינרמל `leveling`.
- prompt של `runFillLLM` ידרוש יצירת סולם רמות לכל משימה.
- אם חסר מידע, לא תמיד לייצר מיד צעד; להחזיר שאלות חידוד.

### 7.4 StepEditor

קובץ:

- `apps/web/components/admin/StepEditor.tsx`

להוסיף:

- UI לשאלות חידוד בתוך פאנל AI.
- מצב `aiFillMode`: `initial | clarifying | generating | done`.
- רשימת שאלות, תשובות, כפתור "שלח תשובות והמשך".
- עריכת שכבות קושי לכל משימה:
  - הוספת רמה.
  - מחיקת רמה.
  - סימון רמת התחלה.
  - סימון רמה מומלצת.
  - מספר ימים להעלאת רמה.

### 7.5 Progress calculation

קובץ אפשרי חדש:

- `apps/web/lib/journey/task-level-progress.ts`

פונקציות מוצעות:

```ts
computeTaskLevelProgressSnapshot(...)
recommendTaskLevelAdjustment(...)
isTaskLevelAtOrAboveRecommended(...)
```

להישען על:

- `apps/web/lib/journey/task-schedule.ts`
- `journey_task_executions`
- `journey_progress.task_level_meta` או טבלה חדשה.

### 7.6 Notifications

קבצים:

- `apps/web/lib/workflows/habit-checkpoint-batch.ts`
- `apps/web/lib/workflows/send-almog-habit-checkpoint.ts`
- `apps/web/app/api/v1/ai/cron/habit-target-tune/route.ts`

להוסיף:

- חישוב `taskLevelTune` לכל משתמש.
- אם יש הצעת העלאת רמה, להכניס ל-payload.
- ב-LLM prompt להוסיף בלוק ברור:
  - הרמה הנוכחית.
  - הרמה הבאה.
  - למה מציעים העלאה.
  - ניסוח תומך ולא שיפוטי.

### 7.7 User feedback endpoint

צריך endpoint שבו המשתמש יכול להגיד:

- קל לי.
- מתאים לי.
- קשה לי.
- העלה רמה.
- הורד רמה.
- השאר רמה.

אפשרות:

- `POST /api/v1/task-level-feedback`

בקשה:

```ts
type TaskLevelFeedbackRequest = {
  step_id: string;
  task_id: string;
  feedback: 'too_easy' | 'ok' | 'too_hard' | 'accept_level_up' | 'decline_level_up' | 'downgrade';
};
```

### 7.8 UI למשתמש

איפה להציג:

- במסך דיווח משימה/הרגל.
- ב-`ProgressReportProvider` / drawer.
- ב-`HabitProgressCard`.
- אולי ב-`TaskHistoryClient`.

להציג:

- הרמה הנוכחית.
- הרמה המומלצת.
- כמה ימים רצופים ברמה הנוכחית.
- כמה ימים עד הצעת העלאה.
- רצף כללי.
- רצף ברמה המומלצת.
- גרף/סולם רמות.

---

## 8. Prompt מוצע ל-AI fill

להוסיף ל-system prompt:

```text
אתה בונה צעד במסע בריאות. אל תמלא אוטומטית אם חסר מידע קריטי.
אם חסר מידע, החזר JSON מסוג clarification:
{
  "status": "needs_clarification",
  "phase": "research|lesson_transcript|user_goal",
  "summary_so_far": "...",
  "questions": [...]
}

עליך להבין בשלושה שלבים:
1. מחקר: מה המחקרים אומרים, מה הממצא, מה מגבלות המחקר, ומה אסור להפריז.
2. שיעור: מה תמלול השיעור, מה התלמיד מקבל, מה המסר המרכזי.
3. יעד משתמש: מה ההתנהגות הרצויה, מה המשימה העיקרית, מה ההרגל, ומה סולם הקושי.

לכל משימה שאתה יוצר, בנה leveling:
- levels מהקל לקשה.
- start_level_id: רמת התחלה מומלצת לפי החיכוך הצפוי.
- recommended_level_id: היעד הרצוי באמת לפי המחקר/השיעור.
- level_up_after_success_days: ברירת מחדל 7 אם אין סיבה אחרת.
- levels חייבים להיות קונקרטיים, מדידים, ולא כלליים.

אם המשתמש נתן רק מחקרים בלי תמלול/יעד, שאל שאלות.
אם המשתמש נתן תמלול בלי יעד התנהגותי, שאל שאלות.
אם ברור מספיק, החזר status done עם step מלא.
```

---

## 9. גרף התקדמות לפי שכבות

### 9.1 מה הגרף צריך להראות

לכל משימה עם `leveling`:

- ציר רמות: מהקל לקשה.
- הרמה הנוכחית מודגשת.
- הרמה המומלצת מסומנת כיעד.
- ימים רצופים ברמה הנוכחית.
- הצלחות/כישלונות אחרונים.
- התקדמות אל הרמה הבאה.

### 9.2 רכיב מוצע

קובץ חדש:

- `apps/web/components/journey/TaskLevelProgressCard.tsx`

Props:

```ts
type TaskLevelProgressCardProps = {
  task: JourneyTask;
  snapshot: TaskLevelProgressSnapshot;
  onFeedback?: (feedback: TaskDifficultyFeedback) => void;
};
```

אפשר להתחיל ב-CSS/SVG פשוט, בדומה ל-`HabitProgressCard`, ולא להכניס ספריית גרפים.

---

## 10. תוכנית יישום מומלצת

למרות שהמשתמש ביקש "הכל בבת אחת", עדיין כדאי לבצע ב-commits קטנים בתוך אותו
מהלך כדי לא לשבור את המערכת.

### שלב A: טיפוסים וולידציה

- להוסיף טיפוסים ב-`journey.ts`.
- להוסיף schema ב-`admin-journey-step.ts`.
- לוודא שמירה/טעינה קיימת לא שוברת צעדים שאין להם `leveling`.

### שלב B: AI fill מייצר leveling

- להרחיב `AiFilledStep.tasks`.
- להרחיב `normalizeFilledStep`.
- לעדכן prompt.
- לוודא שכל משימה מקבלת לפחות 2 רמות אם אפשר.
- fallback: אם AI לא יצר רמות, להשאיר `leveling: null`.

### שלב C: UI עריכת שכבות ב-StepEditor

- להוסיף UI בתוך אזור משימות.
- לאפשר עריכה ידנית מלאה.
- לאפשר סימון התחלה/מומלץ.
- לשמור JSON תקין.

### שלב D: זרימת שאלות חידוד

- להוסיף session state ב-`StepEditor`.
- להוסיף endpoint או להרחיב endpoint קיים.
- לתמוך בסטטוסים:
  - `needs_clarification`
  - `done`
  - `error`
- להציג שאלות ותשובות בצורת שיחה.

### שלב E: state פר משתמש לרמות

- להחליט JSONB או טבלה.
- אם JSONB:
  - מיגרציה להוספת `task_level_meta JSONB` ל-`journey_progress`.
- אם טבלה:
  - מיגרציה `journey_task_level_state`.
- להוסיף helpers לקריאה/כתיבה.

### שלב F: חישוב התקדמות ורצפים

- ליצור `task-level-progress.ts`.
- לחשב:
  - `currentLevel`
  - `recommendedLevel`
  - `successStreakCurrentLevel`
  - `habitStreakAnyLevel`
  - `habitStreakRecommendedLevel`
  - `shouldSuggestLevelUp`
  - `shouldSuggestDowngrade`

### שלב G: feedback endpoint

- `POST /api/v1/task-level-feedback`.
- עדכון state לפי feedback.
- החזרת snapshot עדכני.

### שלב H: שילוב בהתראות

- להוסיף לתכנון ב-`habit-checkpoint-batch.ts`.
- להוסיף payload לשולח.
- לעדכן prompt ב-`send-almog-habit-checkpoint.ts`.
- לשלב gates/cooldown כדי לא להציק.

### שלב I: UI למשתמש וגרף

- `TaskLevelProgressCard`.
- שילוב בדוח התקדמות/הרגלים.
- הצגת שני streaks.
- כפתורי "קל לי", "קשה לי", "מתאים לי".

### שלב J: בדיקות

- unit tests לחישוב רמות.
- tests ל-normalization.
- tests ל-validation.
- tests ל-feedback endpoint.
- tests ל-cron/tune logic.

---

## 11. בדיקות שחשוב להריץ אחרי יישום

פקודות רלוונטיות:

```bash
cd apps/web
npx tsc --noEmit -p tsconfig.json
```

הערה מהמצב הנוכחי לפני המסמך:

- typecheck מלא כבר נכשל בקבצים לא קשורים:
  - `components/admin/AdminAudioPlaylistsClient.tsx`
  - `lib/media-manager/upload-client.ts`
- לכן אחרי שינוי עתידי צריך להבחין בין שגיאות קיימות לבין שגיאות שהוכנסו.

אם יש test scripts רלוונטיים ב-`package.json`, להריץ אותם לפי אזור השינוי.

---

## 12. סיכונים והחלטות פתוחות

### 12.1 JSONB מול טבלה לרמות פר משתמש

JSONB בתוך `journey_progress`:

- מהיר ליישום.
- מתאים למערכת הנוכחית.
- פחות נוח לשאילתות/גרפים מורכבים.

טבלה ייעודית:

- יותר נכון לניתוח והיסטוריה.
- יותר עבודה.
- מאפשר היסטוריית שינויים וגרפים טובים יותר.

המלצה ראשונית: אם רוצים לבנות מהר, להתחיל JSONB. אם כבר עושים "הכל בבת אחת"
ויכול להיות הרבה שימוש בגרפים והתראות, לשקול טבלה.

### 12.2 מה נחשב הצלחה ברמה

צריך להחליט:

- האם `partial` נחשב הצלחה חלקית?
- האם כישלון אחד מאפס streak?
- האם weekly/per_meal שונים מ-daily?

הצעה לגרסה ראשונה:

- רק `completed` נחשב הצלחה.
- כישלון מאפס streak של הרמה הנוכחית.
- per_meal מצליח רק אם כל סלוטי הארוחה הנדרשים הושלמו.

### 12.3 האם AI יכול ליצור סולמות מדויקים תמיד

לא תמיד. לכן:

- חייב להיות UI עריכה ידנית.
- prompt צריך לדרוש סולמות מדידים.
- validation צריכה לאפשר `leveling: null` במקרה שאין סולם אמין.

### 12.4 התראות לא מציקות

המערכת כבר כוללת gates/cooldown. צריך לוודא:

- הצעת level-up לא נשלחת כל יום.
- אחרי דחייה יש cooldown.
- אחרי `too_hard` לא מציעים level-up מהר מדי.

---

## 13. Definition of Done

התכונה תיחשב מוכנה כאשר:

- המנהל יכול להדביק חומר ראשוני.
- ה-AI יודע להחזיר שאלות חידוד במקום למלא אם חסר מידע.
- המנהל יכול לענות בתוך ה-UI.
- ה-AI מייצר צעד מלא כולל שכבות קושי למשימות.
- העורך מאפשר לערוך שכבות קושי.
- שכבות נשמרות ונטענות ללא אובדן מידע.
- לכל משתמש נשמרת/מחושבת רמה נוכחית של משימה.
- המערכת יודעת להציע העלאת רמה לפי רצף הצלחות ו/או feedback "קל לי".
- המערכת יודעת להציע ירידת רמה לפי feedback "קשה לי".
- יש שני רצפים:
  - רצף הרגל כללי.
  - רצף ברמה המומלצת.
- יש UI/גרף שמראה התקדמות בין שכבות.
- ההתראות משתמשות במידע הזה בצורה תומכת ולא מציקה.
- יש בדיקות לחישוב ההתקדמות ולוולידציה.

---

## 14. הערת המשכיות למחר

כשרוצים להתחיל יישום, לקרוא קודם:

1. `apps/web/lib/types/journey.ts`
2. `apps/web/lib/validation/admin-journey-step.ts`
3. `apps/web/app/api/v1/admin/journey-steps/ai-fill/route.ts`
4. `apps/web/components/admin/StepEditor.tsx`
5. `apps/web/lib/journey/habit-progress.ts`
6. `apps/web/lib/journey/task-schedule.ts`
7. `apps/web/lib/workflows/habit-checkpoint-batch.ts`
8. `apps/web/lib/workflows/send-almog-habit-checkpoint.ts`
9. `apps/web/app/api/v1/task-executions/route.ts`

ההתחלה הכי בטוחה:

1. להוסיף טיפוסים ו-validation ל-`leveling`.
2. להרחיב AI fill כך שייצר `leveling`.
3. להוסיף UI עריכה ב-`StepEditor`.
4. רק אחרי זה להיכנס ל-state פר משתמש, התראות וגרפים.