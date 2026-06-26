import { groq, openrouter, AI_MODELS } from '../ai/client';
import type { GuideProgressSummary } from './progress';

export interface GuideCatalogEntry {
  id: string;
  title: string;
  description: string | null;
  lessonCount: number;
  totalMinutes: number;
  contentTypes: string[];
  seasonTag: string;
  seasonallyActive: boolean;
}

export interface GuideCompanionLlmInput {
  firstName: string;
  gender: 'male' | 'female' | null;
  struggles: string[];
  activeGuides: GuideProgressSummary[];
  catalog: GuideCatalogEntry[];
  todayIso: string;
}

export interface GuideCompanionLlmResult {
  almog_note: string;
  next_pick: { course_id: string; reason: string } | null;
  open_guides: Array<{ course_id: string; reason: string }>;
  close_guides: Array<{ course_id: string; reason: string }>;
  refuse_new: boolean;
  refuse_reason: string | null;
}

const SYSTEM = `אתה אלמוג — מנטור אישי ב-NuraWell. אתה מנתח מצב משתמש ומדריכים זמינים.
החזר JSON בלבד:
{
  "almog_note": "משפט אישי קצר בעברית בגוף ראשון (אני...) למשתמש",
  "next_pick": { "course_id": "uuid", "reason": "למה הפרק/מדריך הזה עכשיו" } | null,
  "open_guides": [{ "course_id": "uuid", "reason": "למה לפתוח" }],
  "close_guides": [{ "course_id": "uuid", "reason": "למה לסגור" }],
  "refuse_new": false,
  "refuse_reason": null
}
כללים:
- פתח מדריך חדש רק אם יש צורך ברור (מצוקה, חג מתקרב, נושא שדובר בשיחה).
- אל תפתח אם למשתמש יש כבר 4+ מדריכים פעילים או סימני עומס (refuse_new=true).
- סגור מדריכים עונתיים שכבר לא רלוונטיים (למשל פסח אחרי החג).
- next_pick = המדריך/פרק הכי נכון להמשך למידה עכשיו מבין הפעילים.
- השתמש רק ב-course_id מהקטלוג.`;

function buildUserPayload(input: GuideCompanionLlmInput): string {
  const lines: string[] = [
    `תאריך: ${input.todayIso}`,
    `שם: ${input.firstName}`,
    `מגדר: ${input.gender ?? 'לא ידוע'}`,
    '',
    'מצוקות/נושאים:',
    ...(input.struggles.length ? input.struggles.map((s) => `• ${s}`) : ['• (אין)']),
    '',
    'מדריכים פעילים:',
  ];

  if (input.activeGuides.length === 0) {
    lines.push('• (אין מדריכים פעילים)');
  } else {
    for (const g of input.activeGuides) {
      lines.push(
        `• [${g.courseId}] "${g.courseTitle}": ${g.completedChapters}/${g.totalChapters} פרקים — ${
          g.currentChapterTitle ? `פרק נוכחי: ${g.currentChapterTitle}` : 'טרם התחיל'
        }`
      );
    }
  }

  lines.push('', 'קטלוג מדריכים (כל המדריכים שאלמוג מכיר):');
  for (const c of input.catalog) {
    lines.push(
      `• [${c.id}] "${c.title}" | ${c.lessonCount} פרקים | ~${c.totalMinutes} דק׳ | סוגי תוכן: ${c.contentTypes.join(', ') || 'טקסט'} | עונה: ${c.seasonTag} | פעיל עונתית: ${c.seasonallyActive ? 'כן' : 'לא'}`
    );
    if (c.description) lines.push(`  ${c.description.slice(0, 160)}`);
  }

  return lines.join('\n');
}

function parseResult(raw: string): GuideCompanionLlmResult | null {
  let t = raw.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  }
  try {
    const p = JSON.parse(t) as Record<string, unknown>;
    return {
      almog_note: typeof p.almog_note === 'string' ? p.almog_note.trim() : '',
      next_pick:
        p.next_pick && typeof p.next_pick === 'object' && p.next_pick !== null
          ? {
              course_id: String((p.next_pick as Record<string, unknown>).course_id ?? ''),
              reason: String((p.next_pick as Record<string, unknown>).reason ?? ''),
            }
          : null,
      open_guides: Array.isArray(p.open_guides)
        ? p.open_guides
            .map((x) => {
              if (!x || typeof x !== 'object') return null;
              const o = x as Record<string, unknown>;
              return { course_id: String(o.course_id ?? ''), reason: String(o.reason ?? '') };
            })
            .filter((x): x is { course_id: string; reason: string } => !!x?.course_id)
        : [],
      close_guides: Array.isArray(p.close_guides)
        ? p.close_guides
            .map((x) => {
              if (!x || typeof x !== 'object') return null;
              const o = x as Record<string, unknown>;
              return { course_id: String(o.course_id ?? ''), reason: String(o.reason ?? '') };
            })
            .filter((x): x is { course_id: string; reason: string } => !!x?.course_id)
        : [],
      refuse_new: p.refuse_new === true,
      refuse_reason: typeof p.refuse_reason === 'string' ? p.refuse_reason : null,
    };
  } catch {
    return null;
  }
}

/** ניתוח יומי זול — Groq Llama 4, fallback OpenRouter. */
export async function runGuideCompanionLlm(
  input: GuideCompanionLlmInput
): Promise<GuideCompanionLlmResult | null> {
  const userContent = buildUserPayload(input);
  const messages = [
    { role: 'system' as const, content: SYSTEM },
    { role: 'user' as const, content: userContent },
  ];

  if (process.env.GROQ_API_KEY?.trim()) {
    try {
      const completion = await groq.chat.completions.create({
        model: AI_MODELS.background_groq,
        temperature: 0.25,
        max_tokens: 700,
        response_format: { type: 'json_object' },
        messages,
      });
      const content = completion.choices[0]?.message?.content?.trim();
      if (content) return parseResult(content);
    } catch (e) {
      console.warn('[guide-companion-llm] Groq failed', e);
    }
  }

  if (process.env.OPENROUTER_API_KEY?.trim()) {
    try {
      const completion = await openrouter.chat.completions.create({
        model: 'meta-llama/llama-4-scout',
        temperature: 0.25,
        max_tokens: 700,
        response_format: { type: 'json_object' },
        messages,
      });
      const content = completion.choices[0]?.message?.content?.trim();
      if (content) return parseResult(content);
    } catch (e) {
      console.warn('[guide-companion-llm] OpenRouter failed', e);
    }
  }

  return null;
}
