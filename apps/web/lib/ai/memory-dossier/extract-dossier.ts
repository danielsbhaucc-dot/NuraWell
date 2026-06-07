import { openrouter } from '../client';
import { MEMORY_DOSSIER_MODEL_OPENROUTER } from '../rag-config';
import {
  MEMORY_FACT_CATEGORIES,
  type DossierExtractionPatch,
  type MemoryFactCategory,
  type UserMemoryDossier,
} from './types';

function stripMarkdownFences(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fence ? fence[1] : text).trim();
}

function extractObjectByOutermostBraces(text: string): string | null {
  const t = text.trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return t.slice(start, end + 1);
}

function parseModelJsonPayload(raw: string): unknown | null {
  const stripped = stripMarkdownFences(raw);
  const attempts = [extractObjectByOutermostBraces(stripped), stripped.length > 0 ? stripped : null];
  for (const candidate of attempts) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      /* next */
    }
  }
  return null;
}

function normalizePatch(parsed: unknown): DossierExtractionPatch {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const row = parsed as Record<string, unknown>;
  const patch: DossierExtractionPatch = {};

  const listKeys = ['tags_add', 'tags_remove'] as const;
  for (const key of listKeys) {
    if (Array.isArray(row[key])) {
      patch[key] = (row[key] as unknown[])
        .filter((x): x is string => typeof x === 'string' && x.trim().length >= 2)
        .map((x) => x.trim())
        .slice(0, 12);
    }
  }

  const objectKeys = [
    'essentials',
    'goals',
    'task_memory',
    'habit_memory',
    'schedule_memory',
    'personal_context',
    'health_context',
    'psychology',
    'coaching_profile',
    'risk_signals',
    'ai_context_patch',
  ] as const;

  for (const key of objectKeys) {
    if (row[key] && typeof row[key] === 'object' && !Array.isArray(row[key])) {
      patch[key] = row[key] as Record<string, unknown>;
    }
  }

  if (Array.isArray(row.inferred_insights)) {
    patch.inferred_insights = (row.inferred_insights as unknown[])
      .filter((x) => x && typeof x === 'object' && !Array.isArray(x))
      .map((x) => {
        const item = x as Record<string, unknown>;
        const text = typeof item.text === 'string' ? item.text.replace(/\s+/g, ' ').trim() : '';
        if (text.length < 4) return null;
        return {
          text: text.slice(0, 400),
          category: typeof item.category === 'string' ? item.category : undefined,
          confidence: typeof item.confidence === 'number' ? item.confidence : undefined,
          source: typeof item.source === 'string' ? item.source : 'chat',
          supersedes: typeof item.supersedes === 'string' ? item.supersedes : null,
        };
      })
      .filter(Boolean)
      .slice(0, 5) as DossierExtractionPatch['inferred_insights'];
  }

  if (Array.isArray(row.vector_facts)) {
    patch.vector_facts = (row.vector_facts as unknown[])
      .filter((x) => x && typeof x === 'object' && !Array.isArray(x))
      .map((x) => {
        const item = x as Record<string, unknown>;
        const category = item.category;
        const text = item.text;
        const levelRaw = item.level;
        if (typeof category !== 'string' || !MEMORY_FACT_CATEGORIES.includes(category as MemoryFactCategory))
          return null;
        if (typeof text !== 'string') return null;
        const clean = text.replace(/\s+/g, ' ').trim();
        if (clean.length < 4) return null;
        const level =
          typeof levelRaw === 'number' && [2, 3, 4].includes(levelRaw)
            ? (levelRaw as 2 | 3 | 4)
            : 2;
        return { category: category as MemoryFactCategory, text: clean.slice(0, 300), level };
      })
      .filter(Boolean)
      .slice(0, 8) as DossierExtractionPatch['vector_facts'];
  }

  return patch;
}

const EXTRACTION_SYSTEM = `אתה מנוע חילוץ זיכרון מובנה ל-NuraWell (Llama 4 — רקע, לא צ'אט).
מטרה: ללמוד על המשתמש כדי לעזור לו להתקדם בהרגלים ולהגיע ליעד.

החזר JSON יחיד בלבד — בלי markdown, בלי טקסט מחוץ ל-JSON.

סכימה:
{
  "tags_add": ["snake_case_or_hebrew_tag"],
  "tags_remove": [],
  "essentials": { "primary_goal": "", "current_focus": "", "main_blocker": "" },
  "goals": { "primary": "", "secondary": [], "numeric_target": "", "emotional_target": "" },
  "task_memory": {
    "completed_recent": [],
    "missed_recent": [],
    "miss_reasons": [],
    "partial_recent": []
  },
  "habit_memory": { "triggers": [], "routines": [], "weak_times": [], "strong_times": [] },
  "schedule_memory": { "wake": "", "sleep": "", "work_hours": "", "availability_notes": "" },
  "personal_context": { "work": "", "family": "", "events": [], "stressors": [] },
  "health_context": { "conditions_mentioned": [], "fatigue": "", "pain": "" },
  "psychology": { "motivation": "", "resistance": "", "beliefs": [], "fears": [] },
  "coaching_profile": { "tone_works": "", "tone_fails": "", "push_level": "gentle|normal|direct" },
  "risk_signals": { "dropout_risk": "low|medium|high", "overwhelm": false, "burnout": false },
  "inferred_insights": [{ "text": "תובנה בעברית", "category": "insight", "confidence": 0.8 }],
  "ai_context_patch": {
    "current_goal": "",
    "current_focus": "",
    "pending_focus": [],
    "struggles": [],
    "main_blocker": "",
    "current_mood_signal": "frustrated|motivated|disengaged|neutral|unknown"
  },
  "vector_facts": [{ "category": "success", "text": "משפט קצר", "level": 2 }]
}

קטגוריות vector_facts מותרות:
${MEMORY_FACT_CATEGORIES.join(', ')}

חוקים:
- אם אין מידע משמעותי חדש — החזר {} או שדות ריקים.
- אל תמציא עובדות שלא הופיעו בשיחה או בנתוני המשימות.
- tags_add: עד 5 תגיות קצרות (עברית או snake_case).
- inferred_insights: רק תובנות level 2+ (דפוס/תובנה), לא עובדות חד-פעמיות.
- vector_facts: level 2-4 בלבד; level 1 אסור.
- ai_context_patch: רק שדות שהמשתמש הזכיר במפורש או דפוס ברור.`;

export async function extractMemoryDossierPatch(params: {
  userMessage: string;
  assistantMessage?: string;
  existingDossier?: UserMemoryDossier | null;
  taskContext?: string;
  habitContext?: string;
}): Promise<DossierExtractionPatch> {
  const userMsg = params.userMessage.replace(/\s+/g, ' ').trim();
  if (userMsg.length < 6) return {};

  const dossierSummary = params.existingDossier
    ? JSON.stringify(
        {
          tags: params.existingDossier.tags.slice(0, 8),
          goals: params.existingDossier.goals,
          task_memory: params.existingDossier.task_memory,
          habit_memory: params.existingDossier.habit_memory,
          psychology: params.existingDossier.psychology,
        },
        null,
        0
      ).slice(0, 1200)
    : '{}';

  const userContent = [
    `הודעת משתמש:\n${userMsg.slice(0, 2000)}`,
    params.assistantMessage
      ? `תשובת מנטור:\n${params.assistantMessage.replace(/\s+/g, ' ').trim().slice(0, 1200)}`
      : null,
    params.taskContext ? `הקשר משימות:\n${params.taskContext.slice(0, 800)}` : null,
    params.habitContext ? `הקשר הרגלים:\n${params.habitContext.slice(0, 600)}` : null,
    `תיק קיים (קצר):\n${dossierSummary}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const completion = await openrouter.chat.completions.create({
      model: MEMORY_DOSSIER_MODEL_OPENROUTER,
      temperature: 0.15,
      max_tokens: 1800,
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM },
        { role: 'user', content: userContent },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    if (!raw.trim()) return {};

    const parsed = parseModelJsonPayload(raw);
    if (!parsed) return {};

    return normalizePatch(parsed);
  } catch {
    return {};
  }
}
