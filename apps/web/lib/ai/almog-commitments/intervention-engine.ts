/**
 * מנוע התערבויות — יצירת אופציות A/B ו-pivot לחסמים.
 * רץ על Groq/Llama (רקע, לא צ'אט אלמוג).
 */

import { groq, AI_MODELS } from '../client';
import type { AssignmentRelation, BlockerOption } from './types';
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

function fallbackOptions(
  category: FrictionCategory,
  description: string,
  strategyTypes: StrategyType[],
  hasOriginal = false
): BlockerOption[] {
  const types = strategyTypes.length >= 2 ? strategyTypes.slice(0, 2) : nextStrategyTypesForPivot(category, []);

  const templates: Record<StrategyType, string> = {
    environment_design: `לשים תזכיר גלוי ליד ${description.slice(0, 30)}`,
    physiological_adjustment: `להתחיל בגרסה קטנה יותר — חצי מהכמות הרגילה`,
    micro_habit: `צעד של 2 דקות בלבד: ${description.slice(0, 40)}`,
    habit_stacking: `מיד אחרי הרגל קיים (למשל אחרי צחצוח שיניים) — ${description.slice(0, 30)}`,
    emotional_regulation: `לעצור 3 נשימות לפני — ואז לנסות שוב`,
    social_accountability: `לספר לחבר/בן זוג שאני מנסה — בקשת תמיכה קטנה`,
    how_to: `ללמוד צעד-אחר-צעד איך לעשות את זה נכון`,
    value_linking: `לזכור למה זה חשוב לי — משפט אחד לפני שמתחילים`,
    reminder_system: `תזכורת בטלפון בשעה קבועה`,
    reward_system: `פרס קטן אחרי שעשיתי — משהו שאני אוהב`,
  };

  // ברירת מחדל בטוחה ללא LLM: "eases" אם יש משימה מקורית (הקלה), אחרת "supports".
  const relation: AssignmentRelation = hasOriginal ? 'eases' : 'supports';

  return [
    {
      id: 'A',
      label: STRATEGY_LABELS_HE[types[0] ?? 'micro_habit'],
      strategy_type: types[0] ?? 'micro_habit',
      micro_step: templates[types[0] ?? 'micro_habit'],
      relation,
    },
    {
      id: 'B',
      label: STRATEGY_LABELS_HE[types[1] ?? 'habit_stacking'],
      strategy_type: types[1] ?? 'habit_stacking',
      micro_step: templates[types[1] ?? 'habit_stacking'],
      relation,
    },
  ];
}

const SYSTEM = `אתה מנוע "התערבות התנהגותית" ל-NuraWell (רקע, לא צ'אט).
צור בדיוק 2 אופציות A/B קטנות לחסם, לפי מדע שינוי התנהגות.

כללים:
- כל אופציה = strategy_type מתוך הרשימה + micro_step ספציפי (פעולה אחת קטנה, לא עצה כללית).
- אל תחזור על אסטרטגיות שסומנו "לא עזר" בהיסטוריה.
- ב-pivot: בחר סוג אסטרטגיה שונה מהקודם.
- טון: אמפתי, מעשי, לא טיפולי. עברית טבעית.
- micro_step בר-ביצוע היום (עד 15 דקות / פעולה אחת).

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
  const allowedTypes =
    triedTypes.length > 0
      ? nextStrategyTypesForPivot(category, triedTypes)
      : meta.preferredStrategies;

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
