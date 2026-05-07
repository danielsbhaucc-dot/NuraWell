# 🤖 AI Context - NuraWell 🌿
> **עדכון אחרון:** מסע משתמש (Journey) + וידאו Bunny Pull Zone (HLS על `video.nurawell.ai`) — ראה סעיפים למטה.

## תחזוקת קבצי הקשר (AI_CONTEXT + RULES)

עדכן את **`AI_CONTEXT.md`** ואת **`RULES.md`** **רק כשיש שינוי מהותי** שמשפיע על איך מבינים או מפתחים בפרויקט — למשל: מבנה תיקיות חדש, זרימות משתמש, טבלאות DB, קונבנציות, ספקי מדיה, או API חשוב.

**לא לעדכן** בשביל תיקוני באג קטנים, שינויי ניסוח בלי השפעה ארכיטקטונית, או רפקטור פנימי שאינו משנה חוזים ציבוריים. המטרה: למנוע רעש ולשמור על מסמכים אמינים וקצרים.

## System Overview
Mobile-first, AI-ready course system for weight loss with RTL support, built with Next.js 15 + Supabase + Tailwind CSS.

## 📁 Project Structure

```
NuraWell/
├── apps/
│   ├── web/                    # Main Next.js application
│   │   ├── app/
│   │   │   ├── (auth)/        # Auth routes (login, register)
│   │   │   ├── (dashboard)/   # Protected user routes (כולל /journey)
│   │   │   ├── admin/         # פאנל אדמין (צעדי מסע וכו') בתוך apps/web
│   │   │   ├── api/           # API routes for future mobile app
│   │   │   ├── layout.tsx     # Root layout with RTL
│   │   │   ├── page.tsx       # Landing page
│   │   │   └── globals.css    # Global styles
│   │   ├── components/
│   │   │   ├── shared/        # Shared components
│   │   │   │   ├── MobileHeader.tsx
│   │   │   │   ├── BottomNav.tsx
│   │   │   │   └── CourseCard.tsx
│   │   │   ├── course/        # Course-specific components
│   │   │   └── journey/       # המסע שלי: צעדים, שיעור, חידון, וידאו
│   │   ├── lib/
│   │   │   ├── cn.ts          # Tailwind class merger
│   │   │   ├── journey/       # מסע: resolve-step, bunny-pull (HLS Pull Zone)
│   │   │   ├── types/         # TypeScript types
│   │   │   │   └── database.ts
│   │   │   └── supabase/      # Supabase clients
│   │   │       ├── client.ts  # Browser client
│   │   │       ├── server.ts  # Server client
│   │   │       └── admin.ts   # Admin client
│   │   ├── middleware.ts      # Auth middleware
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tailwind.config.ts
│   │   └── next.config.js
│   └── admin/                 # Admin panel (future)
├── packages/                  # Shared packages
│   ├── shared/               # Shared utilities
│   └── ui/                   # Shared UI components
├── supabase/
│   └── migrations/          # 000001…, 000002_ai_ready, 000003_journey, …
├── package.json              # Root workspace config
├── turbo.json               # Turborepo config
├── .env.local               # Environment variables
├── AI_CONTEXT.md            # הקשר ארכיטקטורה ל-AI (עדכון רק כשיש תוכן רלוונטי)
└── RULES.md                 # חוקי פיתוח ועיצוב (אותה מדיניות תחזוקה)
```

## 🗄️ Database Schema

### Core Tables
1. **profiles** - User profiles (extends Supabase Auth)
   - id, full_name, avatar_url, phone, birth_date, role

2. **courses** - Course information
   - id, title, description, thumbnail_url, is_published, is_premium

3. **lessons** - Lesson content
   - id, course_id, title, description, lesson_type, text_content, tasks, habits

4. **media_files** - Media storage (Uploadthing + Video URLs)
   - id, lesson_id, file_type, uploadthing_key/url/name/size, video_provider/external_id

5. **enrollments** - User course enrollments
   - id, user_id, course_id, enrolled_at, completed_at

6. **lesson_progress** - User progress tracking
   - id, user_id, lesson_id, is_completed, task_progress, habit_progress

7. **journey_steps** - צעדי «המסע שלי» (וידאו, חידון, משחק, התחייבות, סיכום)
   - כולל `video_provider`, `video_external_id`, `video_external_url`, JSONB לתוכן מובנה

8. **journey_progress** - התקדמות משתמש בצעד (`quiz_*`, `game_*`, `last_section`, `is_completed`)

### Key Features
- RLS policies for security
- Indexes for performance
- Triggers for updated_at
- Auto-profile creation on signup

## 🔐 Security

### RLS Policies Summary
- **Profiles**: Users see only own profile, admins see all
- **Courses**: Published courses public, only admin can modify
- **Lessons**: Enrolled users + admin only
- **Media**: Enrolled users + admin only
- **Enrollments**: Users see own, admin sees all
- **Progress**: Users manage own progress only
- **Journey**: `journey_steps` פורסמו לצפייה; `journey_progress` — כל משתמש לנתונים שלו

### Middleware Protection
- Route-level auth checks
- Role-based access control
- Automatic redirects for unauthenticated users

## 🎨 Design System

### Colors (Tailwind)
```
primary: pink-purple gradient (500: #d946ef)
secondary: warm orange (500: #f97316)
success: green for achievements
background: light gray (#fafafa)
text: dark gray with secondary/muted variants
```

### Key Components
- `card-premium` - White rounded cards with shadows
- `btn-primary` - Gradient buttons with hover effects
- `input-premium` - Styled form inputs
- `container-mobile` - Mobile-first responsive container

### Mobile First Features
- Bottom navigation (BottomNav)
- Fixed mobile header (MobileHeader)
- Safe area insets support
- Touch-optimized buttons
- Scrollbar hiding

## 🔌 API Structure

### Web Routes (User)
- `/` - Landing page
- `/login` - Login page
- `/register` - Registration page
- `/courses` - My courses list
- `/courses/[id]` - Course detail
- `/lessons/[id]` - Lesson detail
- `/progress` - Progress tracking
- `/journey` - רשימת צעדי המסע (קישורים קצרים: `/journey/{מספר_צעד}`)
- `/journey/[stepId]` - שיעור צעד — **מספר צעד מפורסם** או **UUID**

### API Routes (For Future Mobile App)
- `/api/v1/auth/*` - Authentication
- `/api/v1/courses/*` - Course data
- `/api/v1/lessons/*` - Lesson data
- `/api/v1/progress/*` - Progress updates
- `/api/v1/journey-progress` - שמירת התקדמות מסע (POST)
- `/api/v1/admin/journey-steps` - CRUD צעדים (אדמין)

## 📤 Media Strategy

| Type | Storage | Notes |
|------|---------|-------|
| Text & Links | Supabase DB | Fast queries |
| Audio | Uploadthing | CDN delivery |
| PDF | Uploadthing | Viewer support |
| Presentations | Uploadthing | PDF conversion |
| Video | URL in DB | קורסים: iframe מודולרי; **מסע (Journey):** Bunny גם כ־**HLS** (`playlist.m3u8`) דרך `hls.js` ודומיין Pull Zone (ברירת מחדל `video.nurawell.ai`, ראה `NEXT_PUBLIC_BUNNY_PULL_ORIGIN`) |

## 🚀 Next Steps

### To Complete Setup
1. Install dependencies: `npm install` (in apps/web)
2. Set up Supabase project
3. Run SQL migrations
4. Configure environment variables
5. Set up Uploadthing account
6. Run dev server: `npm run dev`

### Future Enhancements
- Admin panel (apps/admin)
- Video player integration (modular)
- AI recommendation engine
- Mobile app (React Native/Flutter)
- Real-time features (WebSockets)

## 📝 Naming Conventions

### Files
- Components: PascalCase (CourseCard.tsx)
- Utils: camelCase (cn.ts)
- Pages: page.tsx (Next.js convention)
- Layouts: layout.tsx

### Database
- Tables: lowercase, plural (courses, lessons)
- Columns: lowercase, snake_case (created_at, is_published)
- Primary keys: id (UUID)
- Foreign keys: table_id (course_id, lesson_id)

### TypeScript
- Interfaces: PascalCase (CourseProps)
- Types: PascalCase (VideoProvider)
- Enums: PascalCase (LessonType)

## 🤖 For AI Assistants

When extending this codebase:
1. Always use the cn() utility for Tailwind classes
2. Follow mobile-first responsive design
3. Maintain RTL support (dir="rtl")
4. Use Server Components by default, Client Components when needed
5. Follow RLS policies for security
6. Use TypeScript strict types
7. Add animations with Framer Motion
8. Use Lucide icons
9. Follow the established color scheme
10. Update **`AI_CONTEXT.md`** / **`RULES.md`** only when a change is **architecturally relevant** (see section «תחזוקת קבצי הקשר» at the top)

## 🔗 Key Files Reference

| Purpose | File |
|---------|------|
| Database Types | `apps/web/lib/types/database.ts` |
| Course Types | `apps/web/lib/types/course.ts` |
| Supabase Client | `apps/web/lib/supabase/client.ts` |
| Supabase Server | `apps/web/lib/supabase/server.ts` |
| Tailwind Config | `apps/web/tailwind.config.ts` |
| Global Styles | `apps/web/app/globals.css` |
| Auth Middleware | `apps/web/middleware.ts` |
| DB Schema v1 | `supabase/migrations/000001_initial_schema.sql` |
| DB Schema v2 AI | `supabase/migrations/000002_ai_ready_tables.sql` |
| מסע — טבלאות | `supabase/migrations/000003_journey_tables.sql` |
| מסע — טיפוסים | `apps/web/lib/types/journey.ts` |
| מסע — פתרון URL צעד | `apps/web/lib/journey/resolve-step.ts` |
| Bunny Pull Zone / HLS | `apps/web/lib/journey/bunny-pull.ts` |
| שיעור צעד (לקוח) | `apps/web/components/journey/StepLesson.tsx` |
| וידאו במסע | `apps/web/components/journey/VideoSection.tsx`, `HlsVideo.tsx` |
| עריכת צעד (אדמין) | `apps/web/components/admin/StepEditor.tsx` |

---

## 🧭 מסע משתמש (Journey / «המסע שלי»)

- **רשימה:** `app/(dashboard)/journey/page.tsx` + `JourneyPage.tsx`
- **שיעור:** `app/(dashboard)/journey/[stepId]/page.tsx` — `stepId` יכול להיות **מספר צעד מפורסם** (קישור קצר) או **UUID**
- **וידאו Bunny במסע:**
  - **Embed קלאסי:** `video_external_id` = `libraryId/videoId` → iframe `iframe.mediadelivery.net`
  - **זרם Pull Zone:** `video_external_url` או מזהה/נתיב עם `.m3u8` — ניגון ב־`<video>` + **hls.js**; דומיין ברירת מחדל `https://video.nurawell.ai` (מנורמל ב־`bunny-pull.ts`)
- **קונפיג:** `apps/web/next.config.js` — `NEXT_PUBLIC_BUNNY_PULL_ORIGIN`, `images.remotePatterns` ל־`video.nurawell.ai`

---

## 📚 Course System (Section 4) - Completed

### Pages
| Route | File | Description |
|-------|------|-------------|
| `/courses` | `app/(dashboard)/courses/page.tsx` | Courses list with stats |
| `/courses/[id]` | `app/(dashboard)/courses/[id]/page.tsx` | Course detail + lessons list |
| `/lessons/[id]` | `app/(dashboard)/lessons/[id]/page.tsx` | Full lesson with all content types |
| `/progress` | `app/(dashboard)/progress/page.tsx` | User progress & analytics |

### Components (`components/course/`)
| Component | Purpose |
|-----------|---------|
| `CoursesClientWrapper` | Animated courses list with stats cards |
| `CourseDetailClient` | Course hero, progress bar, lessons list |
| `LessonPageClient` | Lesson orchestrator (all content types) |
| `VideoPlayer` | Multi-provider: Bunny, HeyGen, YouTube, Vimeo, custom |
| `AudioPlayer` | Full audio player with seek, mute, restart |
| `PDFViewer` | PDF/presentation embed with download |
| `ImageGallery` | Image grid with lightbox |
| `TaskChecklist` | Interactive task list with progress bar |
| `HabitTracker` | 7-day habit grid with streak counter |
| `LessonNav` | Prev/next navigation + mark complete |
| `ProgressPageClient` | Stats, course progress, activity feed |

### API Routes (`app/api/v1/`)
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/v1/progress` | `POST` | Save lesson progress (upsert) |
| `/api/v1/progress` | `GET` | Fetch progress by lesson_id or course_id |

### AI-Ready DB Tables (migration 000002)
- `ai_interactions` - All AI chat history with context
- `user_plans` - AI-generated personalized plans (weekly/nutrition/exercise)
- `notifications` - Push-ready notifications (AI-triggered + system)
- `user_measurements` - Body measurements over time
- `achievements` - Gamification badges
- `profiles` extended with: `goal_weight_kg`, `activity_level`, `dietary_preferences`, `ai_context`, `streak_days`

### Design System
- **Colors:** primary teal `#14b8a6`, secondary emerald `#10b981`, accent purple `#d946ef`, energy orange `#f97316`
- **Glass classes:** `.glass-card`, `.glass-card-strong`, `.glass-card-dark`, `.card-premium`
- **Buttons:** `.btn-primary`, `.btn-secondary`, `.btn-success`, `.btn-ghost`, `.btn-icon`
- **Badges:** `.badge-primary`, `.badge-success`, `.badge-warning`, `.badge-energy`, `.badge-accent`
- **Progress:** `.progress-bar` + `.progress-bar-fill` (animated, RTL-aware)
- **Background:** `.bg-mesh`, `.bg-mesh-subtle` (multi-radial gradient)
- **Typography:** Rubik (headings) + Heebo (body), full RTL

---

**NuraWell - Built with ❤️ for AI-powered health journeys** 🌿
