# 📋 AI Development Rules - Weight Loss Course System

## 🎯 מטרת המערכת
מערכת קורסים לירידה במשקל מבוססת 100% AI - Mobile First, RTL, עם תמיכה בכל סוגי התוכן (וידאו, אודיו, PDF, טקסט), ובנוסף **מסע משתמש (Journey / המסע שלי)** — שיעורים אינטראקטיביים עם וידאו, חידון, משחק וסיכום.

---

## 📌 תחזוקת `AI_CONTEXT.md` ו־`RULES.md`

- **לעדכן רק כשיש תוכן רלוונטי** — שינוי שמשפיע על הבנת המערכת: מבנה, זרימות, DB, API, ספקי מדיה, קונבנציות, או נתיבים חשובים.
- **לא לעדכן** לצורך תיקוני באג קטנים, ניסוח קוסמטי, או רפקטור פנימי בלי שינוי חוזה/ארכיטקטורה.
- המטרה: מסמכים **קצרים, מדויקים ולא מיושנים**. כשמוסיפים סעיף חדש — מומלץ לקצר או לאחד סעיפים ישנים שכבר לא רלוונטיים.

---

## 🏗️ ארכיטקטורה - חובה לעקוב

### Stack טכנולוגי
- **Frontend**: Next.js 15 (App Router) + React 19 + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui + Framer Motion
- **Database**: Supabase (PostgreSQL)
- **Storage**: Uploadthing (אודיו, PDF, מצגות)
- **Video**: URL מודולרי ב-DB (Bunny/HeyGen/YouTube/Vimeo/custom); במסע — גם **HLS** (`playlist.m3u8`) מדומיין Pull Zone (NuraWell: `video.nurawell.ai`, ראה `bunny-pull.ts` + `hls.js`)
- **Auth**: Supabase Auth (JWT)

### עקרונות AI-Ready
1. **שמות ברורים באנגלית** - כל טבלה ועמודה חייבת להיות עם שם תיאורי
2. **טיפוסים TypeScript מלאים** - אין `any`!
3. **קומפוננטות מודולריות** - props ברורים ותיעוד
4. **Server Actions מופרדות** - לוגיקה ברורה ב-lib/actions
5. **קונפיגורציה מרוכזת** - כל השינויים במקום אחד

---

## 🎨 עיצוב - חוקים מחייבים

### Mobile First - אבסולוטי
- **קודם כל נייד**: כל קומפוננטה חייבת לעבוד מושלם בטלפון
- **רק אחרי זה desktop**: התאמה למחשב נמוכה בpriority
- **רגישות מלאה**: כל דף חייב להיראות כמו אפליקציה מקצועית

### עיצוב פרימיום צבעוני
```
ראשי: טורקיז/Teal #14b8a6 (primary-500) - בריאות, מים, רוגע
משני: ירוק Emerald #10b981 (secondary-500) - צמיחה, אנרגיה, הצלחה
הצלחה: ירוק בהיר #22c55e (success)
רקע: אפור בהיר #fafafa
טקסט: אפור כהה #111827
```

### אלמנטים חובה
- **כרטיסיות**: `rounded-2xl`, `shadow-lg`, גרדיאנטים עדינים
- **כפתורים**: `rounded-full`, גרדיאנטים, אנימציית לחיצה
- **חוצצים**: `divide-y` עם צבעים עדינים
- **עיגול פינות**: בכל מקום אפשר
- **אייקונים**: Lucide React + אימוג'י טקסטואליים 🎯✨🎉

### אנימציות (Framer Motion)
- מעברי דף חלקים
- stagger animation לכרטיסיות
- micro-interactions על כפתורים
- hover effects

---

## 📱 RTL - תמיכה מלאה בעברית

### חובה בכל קובץ
```tsx
<html lang="he" dir="rtl">
```

### טיפוגרפיה עברית
```css
font-family: 'Varela Round', 'Rubik', sans-serif;
```

### כיווניות
- padding/margin: `pr-` (padding-right) לפני `pl-`
- flex: `items-start` עם `text-right`
- icons: אם יש אייקון בצד של טקסט, הוא צריך להיות בצד ימין ב-RTL

---

## 🗄️ בסיס נתונים - חוקים

### Storage Strategy
| סוג קובץ | שירות | הסיבה |
|----------|-------|-------|
| טקסט + לינקים | Supabase DB | Native, מהיר |
| אודיו | Uploadthing | CDN מהיר |
| PDF | Uploadthing | Viewer מובנה |
| מצגות | Uploadthing | PDF conversion |
| וידאו | URL ב-DB | מודולרי - Bunny/HeyGen/YouTube |

### טבלאות חובה
1. **profiles** - הרחבה של Supabase Auth
2. **courses** - קורסים
3. **lessons** - שיעורים
4. **media_files** - קבצי Uploadthing + URL וידאו
5. **enrollments** - רישום משתמשים
6. **lesson_progress** - מעקב התקדמות

### אבטחה - RLS Policies
- כל טבלה חייבת RLS policy
- משתמש רואה רק את הנתונים שלו
- admin רואה הכל
- מעדכן רק את הנתונים שלו

---

## 🔐 אבטחה - שכבות הגנה

### 1. Database Level
- RLS Policies על כל טבלה
- Foreign keys עם ON DELETE CASCADE
- Input validation ב-DB

### 2. Middleware Level
- Route protection ב-Next.js middleware
- JWT token validation
- Role checking ל-admin routes

### 3. Application Level
- Zod validation לכל input
- Rate limiting על API
- CSRF protection
- CSP headers

---

## 📡 API - מוכן לאפליקצייה עתידית

### API Routes שחייבים להיות
```
/api/v1/auth/login     # POST
/api/v1/auth/register  # POST
/api/v1/auth/refresh   # POST
/api/v1/auth/logout    # POST

/api/v1/courses              # GET (list)
/api/v1/courses/[id]         # GET (detail)
/api/v1/courses/[id]/lessons # GET

/api/v1/lessons/[id]              # GET
/api/v1/lessons/[id]/progress      # POST
/api/v1/lessons/[id]/complete      # POST

/api/v1/progress             # GET
/api/v1/user                 # GET, PATCH
```

### Authentication
- Bearer token: `Authorization: Bearer <jwt>`
- Refresh token rotation
- Token expiry handling

---

## 🔌 Video Modular System

### שדות (קורסים: `media_files` | מסע: `journey_steps`)
```sql
video_provider: 'bunny' | 'heygen' | 'youtube' | 'vimeo' | 'custom'
video_external_id: string   -- מזהה אצל הספק (למשל Bunny embed: libraryId/videoId)
video_external_url: string -- URL ישיר: custom iframe, או **מסלול HLS** (`.m3u8`) במסע
```

### Bunny — שני מסלולים במסע (`VideoSection` + `HlsVideo`)
1. **Embed:** `video_external_id` בלבד → `https://iframe.mediadelivery.net/embed/{id}?...`
2. **Pull Zone / HLS:** `video_external_url` (או מזהה/נתיב עם `.m3u8`, או UUID בלבד) → נורמל ב־`lib/journey/bunny-pull.ts`, ניגון עם **hls.js**; ברירת מחדל דומיין `https://video.nurawell.ai` (`NEXT_PUBLIC_BUNNY_PULL_ORIGIN`).

### קורסים — `VideoPlayer`
עדיין מבוסס iframe לפי ספק (Bunny embed וכו'); אינטגרציית HLS מלאה במסע.

---

## 🎓 מערכת קורסים - דרישות

### דף קורס (Course Detail)
- תמונת רקע/Thumbnail
- רשימת שיעורים (TikTok-style vertical scroll או Grid)
- התקדמות כוללת
- כפתור "התחל/המשך"

### דף שיעור (Lesson Detail)
- **כל סוגי התוכן**:
  - וידאו: Player עם controls
  - אודיו: Waveform + controls
  - PDF: Viewer מובנה
  - טקסט: Typography נקי
  - תמונות: Gallery
- **משימות**: Checklist אינטראקטיבי
- **הרגלים**: Tracker יומי
- **ניווט**: קודם/הבא

### מעקב התקדמות
- Progress bar לכל קורס
- סטטיסטיקות אישיות
- סטריק יומי 🔥
- הישגים 🏅

---

## 🛡️ Admin

### מבנה (נוכחי)
- פאנל אדמין בתוך **`apps/web/app/admin`** (לא אפליקציה נפרדת ב-repo זה).
- API: למשל `/api/v1/admin/journey-steps` לצעדי מסע.

### יכולות (לפי מה שקיים)
- ניהול צעדי מסע (`StepEditor`, ראה `AI_CONTEXT.md`)
- הרחבות עתידיות: קורסים/שיעורים לפי אותו דפוס

---

## 🔍 SEO - חובה

### Metadata בכל עמוד
```tsx
export const metadata: Metadata = {
  title: 'כותרת בעברית | WeightLossAI',
  description: 'תיאור בעברית',
  keywords: ['מילה1', 'מילה2'],
  openGraph: {
    title: '...',
    description: '...',
    locale: 'he_IL',
  },
};
```

### Open Graph
- תמונה (1200x630)
- כותרת בעברית
- תיאור בעברית

### Technical SEO
- Sitemap.xml
- Robots.txt
- Canonical URLs
- Structured data (JSON-LD)

---

## ⚡ ביצועים

### חובה
- Lighthouse 90+ בכל הקטגוריות
- Images: next/image עם optimization
- Fonts: next/font או preload
- Code splitting אוטומטי (Next.js)

### מומלץ
- Lazy loading לתמונות
- Virtual scrolling לרשימות ארוכות
- Caching ב-Supabase

---

## 🧪 בדיקות

### לפני push
- [ ] TypeScript strict - אין errors
- [ ] ESLint - אין warnings
- [ ] Build עובר בהצלחה
- [ ] Responsive בטלפון
- [ ] RTL תקין
- [ ] אנימציות חלקות (60fps)

---

## 📝 Naming Conventions

### קבצים
- Components: `PascalCase.tsx` (CourseCard.tsx)
- Utils: `camelCase.ts` (cn.ts, formatters.ts)
- Pages: `page.tsx`, `layout.tsx` (Next.js convention)
- API: `route.ts`

### Database
- Tables: snake_case, רבים (courses, lessons)
- Columns: snake_case (created_at, is_published)
- Primary key: `id` (UUID)
- Foreign keys: `{table}_id` (course_id)

### TypeScript
- Interfaces: PascalCase (CourseProps)
- Types: PascalCase (VideoProvider, LessonType)
- Enums: PascalCase
- Generics: T, K, V

### CSS/Tailwind
- Custom classes: `kebab-case` (btn-primary, card-premium)
- משתני צבע ב-tailwind.config: camelCase

---

## 🤝 איך לעבוד עם הקוד הזה

### כשמוסיפים feature חדש
1. בדוק את `AI_CONTEXT.md` - מבנה הפרויקט
2. בדוק את `RULES.md` - החוקים
3. השתמש בקומפוננטות הקיימות
4. עקוב אחרי ה-conventions
5. בדוק RTL
6. בדוק Mobile
7. אם השינוי **מהותי** לארכיטקטורה או לזרימות — עדכן `AI_CONTEXT.md` / `RULES.md` לפי סעיף **תחזוקת קבצי הקשר** למעלה (אחרת לא)

### כשעורכים קוד קיים
- שמור על סגנון קיים
- אל תשנה naming conventions
- אל תוריד אנימציות
- אל תוריד RTL
- עדכן מסמכי הקשר **רק** כשיש תוכן רלוונטי (ראה סעיף תחזוקה בראש הקובץ)

---

## 🚨 דברים שאסור לעשות

❌ **אסור**:
- להשתמש ב-`any` ב-TypeScript
- לוותר על RLS policies
- לוותר על RTL
- לעצב קודם למחשב ואז לנייד
- להשתמש בצבעים לא מהפלטה
- להוריד אנימציות למיטוב ביצועים
- ליצור קומפוננטות בלי props types

✅ **חובה**:
- Mobile First תמיד
- RTL תמיד
- אנימציות חלקות
- צבעים צבעוניים ושמחים
- שפה קלילה וחברית
- אימוג'ים בהתאם

---

## 🎨 רשימת צבעים מדויקת

```typescript
// tailwind.config.ts
primary: {
  50: '#f0fdfa',   // רקע בהיר מאוד
  100: '#ccfbf1',  // hover states
  200: '#99f6e4',  // borders
  300: '#5eead4',  // accents
  400: '#2dd4bf',  // light buttons
  500: '#14b8a6',  // MAIN - Teal
  600: '#0d9488',  // hover
  700: '#0f766e',  // dark
  800: '#115e59',
  900: '#134e4a',
},
secondary: {
  50: '#ecfdf5',
  100: '#d1fae5',
  200: '#a7f3d0',
  300: '#6ee7b7',
  400: '#34d399',
  500: '#10b981',  // MAIN - Emerald
  600: '#059669',
  700: '#047857',
  800: '#065f46',
  900: '#064e3b',
},
success: {
  light: '#86efac',
  DEFAULT: '#22c55e',
  dark: '#15803d',
}
```

---

**נכתב עבור**: מערכת קורסים לירידה במשקל - AI Powered (כולל Journey + Bunny HLS)
**תאריך**: מאי 2026
**גרסה**: 1.1
