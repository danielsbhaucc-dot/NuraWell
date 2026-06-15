/**
 * מנוע התערבויות — יצירת אופציות A/B ו-pivot לחסמים.
 * רץ על Groq/Llama (רקע, לא צ'אט אלמוג).
 */

import { groq, AI_MODELS } from '../client';
import type { AssignmentRelation, BlockerOption, BlockerProposal } from './types';
import {
  FRICTION_META,
  STRATEGY_LABELS_HE,
  nextStrategyTypesForPivot,
  normalizeFrictionCategory,
  normalizeStrategyType,
  type FrictionCategory,
  type StrategyType,
} from './friction';

export interface InterventionMemoryRow {
  barrier_type: string;
  strategy: string;
  strategy_type: string;
  outcome: string;
}

/** משימה פעילה שהחסם עשוי לנגוע בה (ref קצר במקום uuid — חוסך טוקנים) */
export interface ActiveTaskRef {
  ref: string;
  title: string;
}

export interface GenerateOptionsParams {
  description: string;
  category: string | null;
  currentStrategy: string | null;
  attemptCount: number;
  memory: InterventionMemoryRow[];
  /** משימות פעילות שאפשר לקשר אליהן (להחלפה/הקלה) */
  activeTasks?: ActiveTaskRef[];
  /** pivot mode — אסטרטגיות שכבר נכשלו */
  failedStrategyTypes?: StrategyType[];
  pivotFromStrategy?: string | null;
}

export interface GeneratedOptionsResult {
  category: FrictionCategory;
  options: BlockerOption[];
  /** ref של המשימה הפעילה שהחסם נוגע בה (או null) */
  relatesToRef: string | null;
}

function normalizeRelation(raw: unknown): AssignmentRelation {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (s === 'replaces' || s === 'eases' || s === 'supports') return s;
  return 'supports';
}

function stripFences(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fence ? fence[1] : text).trim();
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const stripped = stripFences(raw);
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  const candidate = start !== -1 && end > start ? stripped.slice(start, end + 1) : stripped;
  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * קטגוריות של "דחף/דחיינות/חוסר חשק" — שם תזכורת או "לספר למישהו" לא עוזרים,
 * וצריך לדחוף להתחלה זעירה ומיידית של המשימה המקורית.
 */
const URGE_CATEGORIES: readonly FrictionCategory[] = ['emotional', 'motivational'];
/** סוגי צעד שלא רלוונטיים לדחף — לא להציע תזכורות/התראות כשהבעיה היא דחף. */
const REMINDERY_TYPES: readonly StrategyType[] = ['reminder_system'];
/** ברירת מחדל מעודדת לדחף: התחלה זעירה של המשימה עצמה. */
const URGE_PREFERRED_TYPES: StrategyType[] = ['micro_habit', 'emotional_regulation', 'value_linking'];

/** מסנן סוגי צעד שלא מתאימים לדחף (תזכורות) ומבטיח חלופות שמקדמות ביצוע. */
function biasTypesForUrge(category: FrictionCategory, types: StrategyType[]): StrategyType[] {
  if (!URGE_CATEGORIES.includes(category)) return types;
  const filtered = types.filter((t) => !REMINDERY_TYPES.includes(t));
  const merged = [...new Set([...filtered, ...URGE_PREFERRED_TYPES])];
  return merged.length > 0 ? merged : URGE_PREFERRED_TYPES;
}

function formatMemoryForPrompt(memory: InterventionMemoryRow[]): string {
  if (!memory.length) return 'אין היסטוריה קודמת.';
  return memory
    .slice(0, 4)
    .map((m) => {
      const outcome =
        m.outcome === 'helped' || m.outcome === 'resolved'
          ? 'עזר'
          : m.outcome === 'not_helped'
            ? 'לא עזר'
            : 'במעקב';
      return `- [${m.barrier_type}] "${m.strategy}" (${m.strategy_type}) → ${outcome}`;
    })
    .join('\n');
}

/**
 * ניסוחים טבעיים ומלאים בקולו של אלמוג לכל סוג אסטרטגיה — בלי לשרבב את תיאור
 * החסם הקטוע, ובלי לחשוף ז'רגון פסיכולוגי. משמשים גם ל-A/B (legacy) וגם
 * להצעת ה-Pivot היחידה ("המאמן הבלתי-נראה").
 */
const STRATEGY_TEMPLATES: Record<StrategyType, { label: string; step: string }> = {
  environment_design: {
    label: 'נסדר את הסביבה',
    step: 'בוא נשים תזכורת גלויה במקום שאי-אפשר לפספס — ככה זה יקפוץ לך לעיניים בדיוק בזמן.',
  },
  physiological_adjustment: {
    label: 'נתחיל בקטן',
    step: 'בוא נתחיל מחצי מהכמות, או בגרסה שיותר נעימה לך — לא חייבים הכל בבת אחת.',
  },
  micro_habit: {
    label: 'צעד של דקה',
    step: 'בוא נעשה רק 2 דקות מזה היום. ממש קטן, רק כדי להתחיל לזוז.',
  },
  habit_stacking: {
    label: 'נצמיד להרגל קיים',
    step: 'בוא נחבר את זה למשהו שאתה כבר עושה — למשל מיד אחרי שאתה מצחצח שיניים.',
  },
  emotional_regulation: {
    label: 'רגע של אוויר',
    step: 'בוא ניקח 3 נשימות עמוקות לפני, ואז ננסה. בלי לחץ, רק להתרכך קצת.',
  },
  social_accountability: {
    label: 'נשתף מישהו',
    step: 'בוא תספר למישהו קרוב שאתה מנסה את זה — קצת תמיכה עושה הבדל גדול.',
  },
  how_to: {
    label: 'נבין יחד איך',
    step: 'בוא נפרק את זה לצעד-אחר-צעד פשוט, ככה שיהיה ברור בדיוק מה לעשות.',
  },
  value_linking: {
    label: 'נזכור למה',
    step: 'בוא נזכיר לעצמנו במשפט אחד למה זה חשוב לך — זה מה שמחזיק כשקשה.',
  },
  reminder_system: {
    label: 'תזכורת חכמה',
    step: 'בוא נקבע תזכורת בשעה קבועה שמתאימה לך — ואני אזכיר לך בעדינות.',
  },
  reward_system: {
    label: 'פרס קטן',
    step: 'בוא נחליט על פרס קטן שתיתן לעצמך אחרי — משהו שאתה אוהב.',
  },
};

/** הודעות אמפתיה כלליות (fallback ללא LLM) — מנרמלות בלי לשפוט ובלי ז'רגון. */
const EMPATHY_FALLBACKS: Record<FrictionCategory, string> = {
  logistical: 'לגמרי מובן — כשהחיים עמוסים, דברים נופלים בין הכיסאות. זה לא אתה, זו פשוט הסביבה.',
  physiological: 'זה באמת לא פשוט כשהגוף לא משתף פעולה. הקושי הזה אמיתי, ואנחנו לא נילחם בו — נעקוף אותו בעדינות.',
  cognitive: 'הגיוני לגמרי שזה מרגיש גדול. כשאין כוח לראש, הדבר הכי נכון הוא להקטין — וזה בדיוק מה שנעשה.',
  emotional: 'אני שומע אותך. יש ימים שהרגש לוקח את ההגה, וזה אנושי לגמרי. בוא נהיה עדינים עם זה.',
  social: 'זה מאתגר כשהסביבה סביבך לא תמיד מיישרת קו. אתה לא לבד בזה.',
  knowledge: 'ברור שזה תקוע כשלא לגמרי ברור איך לגשת. זה לא חוסר רצון — רק חסר חלק קטן בפאזל.',
  motivational: 'טבעי שלפעמים קשה לראות את הטעם. גם אני מרגיש ככה לפעמים — ובדיוק אז עוזר צעד ממש קטן.',
};

function fallbackOptions(
  category: FrictionCategory,
  _description: string,
  strategyTypes: StrategyType[],
  hasOriginal = false
): BlockerOption[] {
  const types = strategyTypes.length >= 2 ? strategyTypes.slice(0, 2) : nextStrategyTypesForPivot(category, []);

  // ברירת מחדל בטוחה ללא LLM: "eases" אם יש משימה מקורית (הקלה), אחרת "supports".
  const relation: AssignmentRelation = hasOriginal ? 'eases' : 'supports';
  const tA = types[0] ?? 'micro_habit';
  const tB = types[1] ?? 'habit_stacking';

  return [
    { id: 'A', label: STRATEGY_TEMPLATES[tA].label, strategy_type: tA, micro_step: STRATEGY_TEMPLATES[tA].step, relation },
    { id: 'B', label: STRATEGY_TEMPLATES[tB].label, strategy_type: tB, micro_step: STRATEGY_TEMPLATES[tB].step, relation },
  ];
}

/** Pivot יחיד ללא LLM — אמפתיה לפי קטגוריה + צעד יחיד מסוג שעוד לא נוסה. */
function fallbackPivot(
  category: FrictionCategory,
  strategyTypes: StrategyType[],
  hasOriginal: boolean
): { empathy: string; proposal: BlockerProposal } {
  const type = strategyTypes[0] ?? nextStrategyTypesForPivot(category, [])[0] ?? 'micro_habit';
  const relation: AssignmentRelation = hasOriginal ? 'eases' : 'supports';
  return {
    empathy: EMPATHY_FALLBACKS[category],
    proposal: {
      label: STRATEGY_TEMPLATES[type].label,
      strategy_type: type,
      micro_step: STRATEGY_TEMPLATES[type].step,
      relation,
    },
  };
}

const SYSTEM = `אתה מנוע "התערבות התנהגותית" ל-NuraWell (רקע, לא צ'אט).
צור בדיוק 2 אופציות A/B קטנות לחסם, לפי מדע שינוי התנהגות.

כללים:
- כל אופציה = strategy_type מתוך הרשימה + micro_step ספציפי (פעולה אחת קטנה, לא עצה כללית).
- אל תחזור על אסטרטגיות שסומנו "לא עזר" בהיסטוריה.
- ב-pivot: בחר סוג אסטרטגיה שונה מהקודם.
- micro_step בר-ביצוע היום (עד 15 דקות / פעולה אחת).
- שפה: כתוב כאילו אלמוג מדבר אל המשתמש בגוף ראשון, חם ואישי. למשל "בוא נתחיל מ...", "אולי ננסה...". בלי ז'רגון, בלי מילים כמו "אסטרטגיה" או "micro_step" בטקסט עצמו.
- label = 2-4 מילים בעברית, רך וברור (כמו כותרת קטנה לרעיון). לא שם טכני.
- micro_step = משפט אחד וחצי לכל היותר, טבעי וזורם, שלא נחתך באמצע.

קשר למשימה מקורית (אם סופקה רשימת "משימות פעילות"):
- relates_to = ה-ref של המשימה שהחסם נוגע בה, או null אם לא קשור לאף אחת.
- relation לכל אופציה:
  • "replaces" — הצעד דומה מאוד למשימה המקורית ויכול להחליף אותה (אותה כוונה, ניסוח קליל יותר).
  • "eases" — גרסה קטנה/קלה יותר של המשימה המקורית (למשל חצי מהכמות), זמנית עד שחוזרים למקורית.
  • "supports" — צעד עזר נפרד שלא מחליף ולא מקל, אלא מסייע מהצד.
- אם אין משימה מקורית קשורה — relation="supports".

החזר JSON בלבד:
{
  "category": "logistical|physiological|cognitive|emotional|social|knowledge|motivational",
  "relates_to": "ref של משימה פעילה או null",
  "options": [
    { "id": "A", "label": "שם קצר ל-A", "strategy_type": "...", "micro_step": "...", "relation": "replaces|eases|supports" },
    { "id": "B", "label": "שם קצר ל-B", "strategy_type": "...", "micro_step": "...", "relation": "replaces|eases|supports" }
  ]
}`;

export async function generateBlockerOptions(
  params: GenerateOptionsParams
): Promise<GeneratedOptionsResult> {
  const category = normalizeFrictionCategory(params.category);
  const meta = FRICTION_META[category];
  const triedTypes = (params.failedStrategyTypes ?? []).map(normalizeStrategyType);
  const allowedTypes = biasTypesForUrge(
    category,
    triedTypes.length > 0
      ? nextStrategyTypesForPivot(category, triedTypes)
      : meta.preferredStrategies
  );

  const activeTasks = (params.activeTasks ?? []).slice(0, 6);
  const hasOriginal = activeTasks.length > 0;

  const maxAiAttempts = Math.max(0, Number(process.env.ALMOG_INTERVENTION_MAX_AI_ATTEMPTS) || 3);
  const aiDisabled =
    process.env.ALMOG_INTERVENTION_AI_ENABLED === '0' ||
    !process.env.GROQ_API_KEY?.trim() ||
    params.attemptCount >= maxAiAttempts;

  if (aiDisabled) {
    return {
      category,
      options: fallbackOptions(category, params.description, allowedTypes, hasOriginal),
      relatesToRef: null,
    };
  }

  const pivotNote = params.pivotFromStrategy
    ? `\nPIVOT: האסטרטגיה "${params.pivotFromStrategy}" לא עזרה. הצע 2 חלופות מסוג שונה.`
    : '';

  const tasksLine = hasOriginal
    ? `משימות פעילות (לקישור relates_to/relation):\n${activeTasks
        .map((t) => `${t.ref}: ${t.title.slice(0, 80)}`)
        .join('\n')}`
    : null;

  const userContent = [
    `חסם: ${params.description.slice(0, 220)}`,
    `קטגוריה (הערכה): ${category} — ${meta.labelHe}`,
    params.currentStrategy ? `אסטרטגיה נוכחית: ${params.currentStrategy.slice(0, 180)}` : null,
    `ניסיון מספר: ${params.attemptCount + 1}`,
    `סוגי אסטרטגיה מומלצים: ${allowedTypes.join(', ')}`,
    tasksLine,
    `היסטוריית התערבויות:\n${formatMemoryForPrompt(params.memory)}`,
    pivotNote,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const completion = await groq.chat.completions.create({
      model: AI_MODELS.background_groq,
      temperature: 0.35,
      max_tokens: 420,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userContent },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    const parsed = parseJsonObject(raw);
    if (!parsed || !Array.isArray(parsed.options)) {
      return {
        category,
        options: fallbackOptions(category, params.description, allowedTypes, hasOriginal),
        relatesToRef: null,
      };
    }

    const outCategory = normalizeFrictionCategory(
      typeof parsed.category === 'string' ? parsed.category : category
    );

    const validRefs = new Set(activeTasks.map((t) => t.ref));
    const rawRef = typeof parsed.relates_to === 'string' ? parsed.relates_to.trim() : '';
    const relatesToRef = validRefs.has(rawRef) ? rawRef : null;

    const options = (parsed.options as unknown[])
      .slice(0, 2)
      .map((x, i): BlockerOption | null => {
        const o = (x ?? {}) as Record<string, unknown>;
        const micro = typeof o.micro_step === 'string' ? o.micro_step.trim().slice(0, 200) : '';
        if (!micro) return null;
        const id = i === 0 ? 'A' : 'B';
        // relation תקף רק אם יש משימה מקורית; אחרת תמיד supports.
        const relation = relatesToRef ? normalizeRelation(o.relation) : 'supports';
        return {
          id,
          label:
            typeof o.label === 'string' && o.label.trim()
              ? o.label.trim().slice(0, 60)
              : STRATEGY_LABELS_HE[normalizeStrategyType(String(o.strategy_type))],
          strategy_type: normalizeStrategyType(String(o.strategy_type)),
          micro_step: micro,
          relation,
        };
      })
      .filter((x): x is BlockerOption => x !== null);

    if (options.length < 2) {
      return {
        category: outCategory,
        options: fallbackOptions(outCategory, params.description, allowedTypes, hasOriginal),
        relatesToRef,
      };
    }

    return { category: outCategory, options, relatesToRef };
  } catch {
    return {
      category,
      options: fallbackOptions(category, params.description, allowedTypes, hasOriginal),
      relatesToRef: null,
    };
  }
}

/** ברירת מחדל ל-fire_at של תזכורת מעקב: מחר 09:00 ישראל */
export function defaultInterventionReminderIso(now: Date): string {
  const target = new Date(now.getTime() + 86_400_000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(target);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const y = get('year');
  const m = get('month');
  const d = get('day');
  const guessUtc = new Date(Date.UTC(y, m - 1, d, 9, 0, 0));
  const israelShown = new Date(guessUtc.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const utcShown = new Date(guessUtc.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMs = israelShown.getTime() - utcShown.getTime();
  return new Date(guessUtc.getTime() - offsetMs).toISOString();
}

/** ברירת מחדל ל-check_progress על חסם: בעוד 2 ימים 18:00 ישראל */
export function defaultBlockerCheckIso(now: Date): string {
  const target = new Date(now.getTime() + 2 * 86_400_000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(target);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const y = get('year');
  const m = get('month');
  const d = get('day');
  const guessUtc = new Date(Date.UTC(y, m - 1, d, 18, 0, 0));
  const israelShown = new Date(guessUtc.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const utcShown = new Date(guessUtc.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMs = israelShown.getTime() - utcShown.getTime();
  return new Date(guessUtc.getTime() - offsetMs).toISOString();
}

export async function fetchInterventionMemory(
  admin: import('@supabase/supabase-js').SupabaseClient,
  userId: string,
  limit = 6
): Promise<InterventionMemoryRow[]> {
  const { data } = await admin
    .from('almog_interventions')
    .select('barrier_type, strategy, strategy_type, outcome')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data ?? []) as InterventionMemoryRow[];
}

/* ═══════════════════════════════════════════════════════════════════════════
 * "המאמן הבלתי-נראה" — Pivot יחיד (אמפתיה + הצעה אחת)
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface GeneratePivotParams {
  description: string;
  category: string | null;
  currentStrategy: string | null;
  attemptCount: number;
  memory: InterventionMemoryRow[];
  activeTasks?: ActiveTaskRef[];
  failedStrategyTypes?: StrategyType[];
  pivotFromStrategy?: string | null;
  /** כותרת המשימה המקורית שהמשתמש נכשל בה (אם יש) */
  originalTaskTitle?: string | null;
}

export interface GeneratedPivotResult {
  category: FrictionCategory;
  empathy: string;
  proposal: BlockerProposal;
  /** ref של המשימה הפעילה שהחסם נוגע בה (או null) */
  relatesToRef: string | null;
}

const COACH_SYSTEM = `אתה "אלמוג" — מאמן הרגלים אמפתי ב-NuraWell. המשתמש נתקל בקושי עם משימה/הרגל.
אתה מדבר בגוף ראשון, חם, קצר, בלי ז'רגון פסיכולוגי ובלי להסביר תיאוריות.

המטרה העליונה: לעזור למשתמש *לבצע את המשימה המקורית* — לא להחליף אותה במשהו צדדי, ולא לתת לו לברוח ממנה.

החזר JSON בלבד עם שני חלקים:
1. empathy — משפט אחד קצר, אישי וספציפי לקושי שהמשתמש תיאר. השתמש במילים שלו ובמשימה המקורית; אל תיתן נחמה גנרית. מנרמל בלי לשפוט.
2. proposal — צעד אחד בלבד (B=MAP, Fogg) שמקרב אותו לביצוע המשימה המקורית *עכשיו*:
   • micro_step = פעולה זעירה אחת, בר-ביצוע מיד (2-5 דקות) — התחלה קטנה של המשימה עצמה, לא משימה אחרת.
   • label = 2-4 מילים בעברית, רך (כמו כותרת קטנה).
   • strategy_type = סוג פנימי (לא מוצג למשתמש).
   • relation = יחס למשימה מקורית: "replaces" (אותה כוונה בניסוח קליל) | "eases" (גרסה קטנה יותר של המשימה המקורית) | "supports" (רק אם אין שום משימה מקורית).

כללים נוקשים:
- אם הקושי הוא דחף / חשק / דחיינות / "אין כוח" / "אין חשק" — אסור להציע תזכורת, "להזכיר לך", "לספר למישהו" או לקבוע התראה. אלה לא עוזרים לדחף. במקום זה הצע התחלה זעירה ומיידית של המשימה המקורית + עידוד קצר ("רק 2 דקות ונראה איך זה מרגיש").
- כשיש משימה מקורית — העדף "eases" או "replaces" על פני "supports". אל תמציא משימה צדדית חדשה במקום המקורית.
- ב-pivot: בחר סוג צעד שונה מזה שכבר נכשל, אבל תמיד שמור על קשר ישיר למשימה המקורית.
- אל תחזור על אסטרטגיות שסומנו "לא עזר". אל תציע יותר מצעד אחד. אל תסביר למה בחרת.
- שפה: "בוא נתחיל מ...", "רק 2 דקות...", "ננסה ביחד..." — בלי המילים "אסטרטגיה"/"micro_step".

החזר JSON בלבד:
{
  "category": "logistical|physiological|cognitive|emotional|social|knowledge|motivational",
  "relates_to": "ref של משימה פעילה או null",
  "empathy": "משפט אמפתי קצר וספציפי",
  "proposal": {
    "label": "שם קצר",
    "strategy_type": "...",
    "micro_step": "התחלה זעירה של המשימה המקורית",
    "relation": "replaces|eases|supports"
  }
}`;

/**
 * מנוע ה-Pivot החדש: אמפתיה + הצעה אחת (במקום A/B).
 * Pre-LLM: הקשר נארז בצד השרת (memory, failed types, active tasks).
 * Post-LLM: category + strategy_type נשמרים נסתר ב-DB.
 */
export async function generateBlockerPivot(
  params: GeneratePivotParams
): Promise<GeneratedPivotResult> {
  const category = normalizeFrictionCategory(params.category);
  const meta = FRICTION_META[category];
  const triedTypes = (params.failedStrategyTypes ?? []).map(normalizeStrategyType);
  const allowedTypes = biasTypesForUrge(
    category,
    triedTypes.length > 0
      ? nextStrategyTypesForPivot(category, triedTypes)
      : meta.preferredStrategies
  );

  const activeTasks = (params.activeTasks ?? []).slice(0, 6);
  const hasOriginal = activeTasks.length > 0;

  const maxAiAttempts = Math.max(0, Number(process.env.ALMOG_INTERVENTION_MAX_AI_ATTEMPTS) || 3);
  const aiDisabled =
    process.env.ALMOG_INTERVENTION_AI_ENABLED === '0' ||
    !process.env.GROQ_API_KEY?.trim() ||
    params.attemptCount >= maxAiAttempts;

  if (aiDisabled) {
    const fb = fallbackPivot(category, allowedTypes, hasOriginal);
    return { category, ...fb, relatesToRef: null };
  }

  const pivotNote = params.pivotFromStrategy
    ? `\nPIVOT: האסטרטגיה "${params.pivotFromStrategy}" לא עזרה. הצע חלופה מסוג שונה.`
    : '';

  const tasksLine = hasOriginal
    ? `משימות פעילות (לקישור relates_to/relation):\n${activeTasks
        .map((t) => `${t.ref}: ${t.title.slice(0, 80)}`)
        .join('\n')}`
    : null;

  const userContent = [
    `קושי: ${params.description.slice(0, 220)}`,
    params.originalTaskTitle ? `המשימה המקורית: ${params.originalTaskTitle.slice(0, 100)}` : null,
    `קטגוריה (הערכה פנימית): ${category}`,
    params.currentStrategy ? `אסטרטגיה נוכחית: ${params.currentStrategy.slice(0, 180)}` : null,
    `ניסיון מספר: ${params.attemptCount + 1}`,
    `סוגי אסטרטגיה מומלצים: ${allowedTypes.join(', ')}`,
    tasksLine,
    `היסטוריית התערבויות:\n${formatMemoryForPrompt(params.memory)}`,
    pivotNote,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const completion = await groq.chat.completions.create({
      model: AI_MODELS.background_groq,
      temperature: 0.4,
      max_tokens: 380,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: COACH_SYSTEM },
        { role: 'user', content: userContent },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    const parsed = parseJsonObject(raw);
    if (!parsed || typeof parsed.empathy !== 'string' || !parsed.proposal) {
      const fb = fallbackPivot(category, allowedTypes, hasOriginal);
      return { category, ...fb, relatesToRef: null };
    }

    const outCategory = normalizeFrictionCategory(
      typeof parsed.category === 'string' ? parsed.category : category
    );

    const validRefs = new Set(activeTasks.map((t) => t.ref));
    const rawRef = typeof parsed.relates_to === 'string' ? parsed.relates_to.trim() : '';
    const relatesToRef = validRefs.has(rawRef) ? rawRef : null;

    const p = (parsed.proposal ?? {}) as Record<string, unknown>;
    const micro = typeof p.micro_step === 'string' ? p.micro_step.trim().slice(0, 200) : '';
    if (!micro) {
      const fb = fallbackPivot(outCategory, allowedTypes, hasOriginal);
      return { category: outCategory, ...fb, relatesToRef };
    }

    const relation = relatesToRef ? normalizeRelation(p.relation) : 'supports';
    const proposedType = normalizeStrategyType(String(p.strategy_type));

    // הגנה אחרונה: בדחף/דחיינות אסור להציע תזכורת — מחליפים להתחלה זעירה מיידית.
    if (URGE_CATEGORIES.includes(outCategory) && REMINDERY_TYPES.includes(proposedType)) {
      return {
        category: outCategory,
        empathy: (parsed.empathy as string).trim().slice(0, 300),
        proposal: {
          label: STRATEGY_TEMPLATES.micro_habit.label,
          strategy_type: 'micro_habit',
          micro_step: STRATEGY_TEMPLATES.micro_habit.step,
          relation: hasOriginal ? 'eases' : 'supports',
        },
        relatesToRef,
      };
    }

    return {
      category: outCategory,
      empathy: (parsed.empathy as string).trim().slice(0, 300),
      proposal: {
        label:
          typeof p.label === 'string' && p.label.trim()
            ? p.label.trim().slice(0, 60)
            : STRATEGY_LABELS_HE[proposedType],
        strategy_type: proposedType,
        micro_step: micro,
        relation,
      },
      relatesToRef,
    };
  } catch {
    const fb = fallbackPivot(category, allowedTypes, hasOriginal);
    return { category, ...fb, relatesToRef: null };
  }
}
