/**
 * almog-greeting.ts
 * -----------------
 * מחולל בועת הברכה של אלמוג בראש מסך הבית. צד-לקוח, מיידי (בלי קריאת AI),
 * אבל חכם ולא גנרי: הניסוח מתחלף יומית לפי seed (תאריך + שם + מצב), מותאם
 * לחלק היום, לשמות משימות ולמגמת התקדמות.
 */

import { normalizeHebrewDashes } from '../text/hebrew-dashes';
import { partOfDayInIsrael, pickDaily, type PartOfDay } from './momentum-psychology';

export type GreetingTaskState = 'loading' | 'fresh' | 'pending' | 'done';

export type AlmogGreetingTaskPreview = {
  title: string;
  emoji?: string;
  slotLabel?: string;
};

export type AlmogGreeting = {
  /** טקסט פתיחה רגיל */
  lead: string;
  /** משימה מודגשת — מוצגת בנפרד עם עיצוב מודרני (בלי « ») */
  featuredTask?: AlmogGreetingTaskPreview;
  /** החלק המודגש (זהב) — ההזמנה/השאלה */
  highlight: string;
  /** כותרת משנה קצרה מתחת ל"✦ אלמוג" — משתנה לפי מצב */
  mentorTag?: string;
  /** טקסט פתיחה לצ'אט — ממולא בשדה הקלט */
  chatPrefill?: string;
  /** תווית לכפתור צ'אט בבועה */
  chatCtaLabel?: string;
  /** האם להציג פס התקדמות */
  showProgress?: boolean;
  progressDone?: number;
  progressTotal?: number;
};

/** מפתח תאריך בלוח ירושלים — seed יומי יציב. */
function israelDateKey(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}


/** פתיחות חמות לפי חלק היום — תחושת נוכחות אנושית. */
const LEAD_FRESH: Record<PartOfDay, readonly string[]> = {
  morning: ['שמח שאתה כאן 🌿', 'בוקר טוב, טוב לראות אותך 🌿', 'יום חדש, ואני כאן 🌿'],
  noon: ['טוב שקפצת 🌿', 'שמח שאתה כאן 🌿', 'אמצע יום, רגע לעצמך 🌿'],
  evening: ['טוב לראות אותך הערב 🌿', 'ערב נעים, שמח שאתה כאן 🌿', 'רגע שקט בערב 🌿'],
  night: ['שמח שקפצת לרגע 🌿', 'טוב לראות אותך 🌿', 'גם בלילה אני כאן 🌿'],
};

/** הזמנות פתוחות (תמיכה באוטונומיה) — בלי לחץ, בחירה אצל המשתמש. */
const HIGHLIGHT_FRESH: readonly string[] = [
  'כשנוח לך, תכתוב לי במשפט מה הכי חשוב היום.',
  'בלי לחץ, רק ספר לי מה על הראש שלך עכשיו.',
  'מה הכי מתאים לך להתחיל ממנו היום?',
  'ספר לי במשפט מה היית רוצה שיקרה היום.',
];

/** סגירות לאחר השלמה — חיזוק זהות ועקביות (Progress Principle). */
const HIGHLIGHT_DONE: readonly string[] = [
  'מה הכי מרגיש לך עכשיו?',
  'בדיוק ככה נבנית עקביות. מה הלאה?',
  'יום שאפשר להיות גאה בו. איך אתה מרגיש?',
  'סגרת יפה. מה מתחשק לך עכשיו?',
];

/** הזמנות כשיש משימות פתוחות — צעד זעיר, בלי הטפה (Tiny Habits). */
const HIGHLIGHT_PENDING: readonly string[] = [
  'ספר לי בצ׳אט כשעשית, בלי לחפש כפתורים.',
  'אפילו אחת מהן מזיזה את המחט. ספר לי כשעשית.',
  'לא חייבים הכל, אחת קטנה מספיקה כדי להרגיש תנועה.',
  'בקצב שלך. ספר לי בצ׳אט כשסימנת אחת.',
];

const MENTOR_TAG_FRESH: readonly string[] = [
  'כאן בשבילך',
  'מקשיב',
  'בקצב שלך',
];

const MENTOR_TAG_PENDING: readonly string[] = [
  'מחכה לעדכון ממך',
  'עוד קצת וסוגרים',
  'אני איתך',
];

const MENTOR_TAG_DONE: readonly string[] = [
  'יום חזק ✦',
  'גאה בך',
  'המשך ככה',
];

const HIGHLIGHT_ALMOST_DONE: readonly string[] = [
  'עוד אחת קטנה וסוגרים את היום. ספר לי בצ׳אט.',
  'כמעט שם. ספר לי כשסגרת את האחרונה.',
  'הסוף קרוב, בוא נסגור יחד בצ׳אט.',
];

const HIGHLIGHT_MANY_PENDING: readonly string[] = [
  'לא חייבים הכל, בחר/י אחת קטנה וספר/י לי.',
  'גם משימה אחת היום שווה. ספר לי מה עשית.',
  'בקצב שלך. התחל/י מאחת וספר/י לי בצ׳אט.',
];

/** טקסט פתיחה לצ'אט כשמדווחים על משימה ספציפית. */
export function buildTaskDoneChatPrefill(title: string, slotLabel?: string | null): string {
  const t = title.trim();
  if (!t) return 'סיימתי משימה';
  if (slotLabel && slotLabel !== 'once') {
    return `סיימתי את «${t}» (${slotLabel})`;
  }
  return `סיימתי את «${t}»`;
}

function buildSmartHighlight(params: {
  taskState: GreetingTaskState;
  pendingCount: number;
  doneCount: number;
  dueToday: number;
  part: PartOfDay;
  seed: string;
}): string {
  const { taskState, pendingCount, doneCount, dueToday, part, seed } = params;

  if (taskState === 'pending') {
    if (pendingCount === 1 && doneCount > 0) {
      return normalizeHebrewDashes(pickDaily(HIGHLIGHT_ALMOST_DONE, `${seed}:almost`));
    }
    if (pendingCount >= 3) {
      return normalizeHebrewDashes(pickDaily(HIGHLIGHT_MANY_PENDING, `${seed}:many`));
    }
    if (part === 'evening' || part === 'night') {
      const evening = [
        'לפני שהערב נגמר, ספר לי מה הספקת.',
        'ערב שקט, גם משימה אחת מספיקה. ספר לי בצ׳אט.',
      ];
      return normalizeHebrewDashes(pickDaily(evening, `${seed}:eve`));
    }
    if (part === 'morning' && doneCount === 0) {
      const morning = [
        'בוקר טוב לצעד ראשון. ספר לי בצ׳אט כשעשית.',
        'יום חדש, משימה אחת קטנה מספיקה. ספר לי כשסימנת.',
      ];
      return normalizeHebrewDashes(pickDaily(morning, `${seed}:am`));
    }
    return normalizeHebrewDashes(pickDaily(HIGHLIGHT_PENDING, seed));
  }

  if (taskState === 'done') {
    return normalizeHebrewDashes(pickDaily(HIGHLIGHT_DONE, seed));
  }

  return normalizeHebrewDashes(pickDaily(HIGHLIGHT_FRESH, seed));
}

function buildChatPrefill(params: {
  taskState: GreetingTaskState;
  pendingTasks: readonly AlmogGreetingTaskPreview[];
  pendingCount: number;
}): { prefill: string; label: string } {
  const { taskState, pendingTasks, pendingCount } = params;
  const first = pendingTasks[0];

  if (taskState === 'pending' && first?.title) {
    const prefill = buildTaskDoneChatPrefill(first.title);
    if (pendingCount === 1) {
      return { prefill, label: 'ספר שסיימת בצ׳אט' };
    }
    return { prefill, label: 'דווח על משימה בצ׳אט' };
  }

  if (taskState === 'done') {
    return { prefill: 'סגרתי את כל המשימות להיום ✦', label: 'ספר לאלמוג איך מרגיש' };
  }

  return { prefill: 'מה הכי חשוב לי היום?', label: 'פתח צ׳אט' };
}

function buildPendingLead(params: {
  firstName: string;
  pendingCount: number;
  doneCount: number;
  dueToday: number;
  pendingTasks: readonly AlmogGreetingTaskPreview[];
  seed: string;
}): { lead: string; featuredTask?: AlmogGreetingTaskPreview } {
  const { firstName, pendingCount, doneCount, dueToday, pendingTasks, seed } = params;
  const name = firstName?.trim() ? `${firstName.trim()}, ` : '';
  const first = pendingTasks[0];
  const firstTitle = first?.title.trim() || null;

  if (pendingCount === 1 && firstTitle) {
    const variants = [
      `${name}נשארה לך רק משימה אחת להיום`,
      `${name}עוד משימה אחת וסוגרים את היום`,
      `${name}משימה אחרונה ואז סיימנו`,
    ];
    return {
      lead: normalizeHebrewDashes(pickDaily(variants, `${seed}:one`)),
      featuredTask: first,
    };
  }

  if (doneCount > 0 && dueToday > 0) {
    const variants = [
      `${name}כבר סגרת ${doneCount} מתוך ${dueToday}, נשארו ${pendingCount}.`,
      `${name}${doneCount} בוצעו, עוד ${pendingCount} מחכות.`,
      `${name}התקדמת יפה, ${doneCount}/${dueToday} כבר בסל.`,
    ];
    return { lead: normalizeHebrewDashes(pickDaily(variants, `${seed}:progress`)) };
  }

  if (firstTitle && pendingCount > 1) {
    const others = pendingCount - 1;
    const variants = [
      `${name}עוד ${others} מחכות, אבל קודם זו`,
      `${name}${pendingCount} על היום — נתחיל מזו`,
      `${name}יש ${pendingCount} פתוחות, הראשונה ברשימה`,
    ];
    return {
      lead: normalizeHebrewDashes(pickDaily(variants, `${seed}:multi`)),
      featuredTask: first,
    };
  }

  const count =
    pendingCount === 1 ? 'משימה אחת שקיבלת' : `${pendingCount} משימות שקיבלת`;
  return { lead: normalizeHebrewDashes(`${name}יש לך ${count} ועדיין לא סגרת.`) };
}

/**
 * בונה את הברכה היומית. דטרמיניסטי לאורך היום (לא מרצד) אך מגוון בין הימים.
 */
export function buildAlmogGreeting(params: {
  firstName: string;
  taskState: GreetingTaskState;
  pendingCount?: number;
  doneCount?: number;
  dueToday?: number;
  pendingTasks?: readonly AlmogGreetingTaskPreview[];
  now?: Date;
}): AlmogGreeting {
  const {
    firstName,
    taskState,
    pendingCount = 0,
    doneCount = 0,
    dueToday = 0,
    pendingTasks = [],
  } = params;
  const now = params.now ?? new Date();
  const part = partOfDayInIsrael(now);
  const name = firstName?.trim() ? `${firstName.trim()}, ` : '';
  const seed = `${israelDateKey(now)}:${firstName || 'x'}:${taskState}`;

  if (taskState === 'loading') {
    return {
      lead: 'רגע, אני מסתכל על המסע שלך…',
      highlight: '',
      mentorTag: 'טוען…',
    };
  }

  const chat = buildChatPrefill({ taskState, pendingTasks, pendingCount });

  if (taskState === 'pending') {
    const pendingLead = buildPendingLead({
      firstName,
      pendingCount,
      doneCount,
      dueToday,
      pendingTasks,
      seed,
    });
    return {
      lead: pendingLead.lead,
      featuredTask: pendingLead.featuredTask,
      highlight: buildSmartHighlight({
        taskState,
        pendingCount,
        doneCount,
        dueToday,
        part,
        seed,
      }),
      mentorTag: normalizeHebrewDashes(
        pickDaily(
          pendingCount === 1 && doneCount > 0
            ? (['עוד אחת וסוגרים', 'כמעט שם ✦', 'הסוף קרוב'] as const)
            : MENTOR_TAG_PENDING,
          seed
        )
      ),
      chatPrefill: chat.prefill,
      chatCtaLabel: chat.label,
      showProgress: dueToday > 0,
      progressDone: doneCount,
      progressTotal: dueToday,
    };
  }

  if (taskState === 'done') {
    const doneVariants = [
      `${name}סגרת את מה שהתחייבת אליו היום ✦`,
      `${name}היום נסגר יפה, ${doneCount} משימות בוצעו ✦`,
      `${name}עשית את שלך להיום, וזה מרגיש ✦`,
    ];
    return {
      lead: normalizeHebrewDashes(pickDaily(doneVariants, seed)),
      highlight: buildSmartHighlight({
        taskState,
        pendingCount,
        doneCount,
        dueToday,
        part,
        seed,
      }),
      mentorTag: normalizeHebrewDashes(pickDaily(MENTOR_TAG_DONE, seed)),
      chatPrefill: chat.prefill,
      chatCtaLabel: chat.label,
      showProgress: dueToday > 0,
      progressDone: doneCount,
      progressTotal: dueToday || doneCount,
    };
  }

  // fresh — משתמש בלי משימות פעילות היום
  return {
    lead: normalizeHebrewDashes(`${name}${pickDaily(LEAD_FRESH[part], seed)}`),
    highlight: buildSmartHighlight({
      taskState,
      pendingCount,
      doneCount,
      dueToday,
      part,
      seed,
    }),
    mentorTag: normalizeHebrewDashes(pickDaily(MENTOR_TAG_FRESH, seed)),
    chatPrefill: chat.prefill,
    chatCtaLabel: chat.label,
  };
}
