/**
 * ✍️ בונה ההצעה היזומה (proposal) של ה-Program Orchestrator.
 *
 * הקלט הוא ההכרעה הדטרמיניסטית (ProgramStateDecision) + קונטקסט אישי.
 * הפלט הוא אובייקט ProgramProposal מוכן שנשמר ב-profiles.pending_ai_proposal
 * וה-Dumb UI מצייר. ה-LLM (Groq/Llama, JSON mode) מנסח רק את הטקסט; המבנה,
 * ה-CTA וה-requires_buyin נקבעים בקוד.
 *
 * 🛡️ דוקטרינת בטיחות (מתוך מפרט "רגע לפני", פרק 2): אלמוג הוא *מלווה, לא
 * מטפל*. אסור מסגור של "שמירה/משטור" סביב אוכל, אסור אבחון, אסור אשמה.
 * המסגור תמיד תומך וחברי. הבלוק הזה מוזרק לכל פרומפט כאן.
 */

import { randomUUID } from 'node:crypto';

import { groq, AI_MODELS } from '../client';
import type {
  ProgramProposal,
  ProgramProposalNextStep,
  ProgramStateDecision,
} from './program-state';
import type { JourneyCompanionContext } from '../../workflows/journey-companion';
import type { AiUserContext } from '../memory';

export type BuildProposalInput = {
  decision: ProgramStateDecision;
  firstName: string;
  aiCtx: AiUserContext;
  companion: JourneyCompanionContext | null;
  /** רצף הימים — לשיקוף "מגיע לך" ב-level_up. */
  consecutiveCompletedDays: number;
};

const SAFETY_BLOCK = `אתה אלמוג — מאמן הרגלים וחבר תומך, *לא* מטפל/דיאטן/רופא.
אסור: לאבחן, לתת ייעוץ קליני, לדבר בשפת "שמירה/איסור אוכל", או להאשים. אכילה היא לא כישלון.
מותר ורצוי: חום, נוכחות, חיבור הצעד ל"למה" של המשתמש, והצעת צעד אחד קטן וקונקרטי.
כתוב בעברית טבעית, גוף שני, קצר (1-3 משפטים), בלי קלישאות ובלי שפת מערכת.`;

/** הנחיות פר-מצב — *מה* אלמוג מציע בכל אחד מהשלושה. */
function stateInstruction(input: BuildProposalInput): string {
  const focus =
    input.aiCtx.current_focus ||
    input.companion?.stepTitle ||
    'ההרגל הנוכחי';
  const goal = input.aiCtx.current_goal ? ` המטרה האישית שלו: "${input.aiCtx.current_goal}".` : '';

  switch (input.decision.proposalKind) {
    case 'level_up':
      return `מצב: READY_TO_ADVANCE. המשתמש שמר על עקביות ${input.consecutiveCompletedDays} ימים ב-"${focus}".${goal}
המשימה: לחגוג בקצרה את ההצלחה ולהציע את *הצעד ההגיוני הבא* בתוכנית (לבנות מעל מה שכבר שלט בו — לדוגמה: "שלטת במים, בוא נוסיף הליכה קצרה של 5 דקות").
הצעד הבא חייב להיות מיקרו, מדיד וקל. שאל בעדינות אם הוא בעניין (buy-in), אל תכפה.`;
    case 'daily_kickoff':
      return `מצב: MAINTAINING. המשתמש מתקדם תקין ב-"${focus}".${goal}
המשימה: פתיחת יום חמה וקצרה שמחזקת מומנטום בלי להוסיף עומס. בלי משימה חדשה — רק נוכחות מעודדת ותזכורת עדינה ל"למה".`;
    case 'pivot':
      return `מצב: STRUGGLING. למשתמש קשה כרגע ב-"${focus}" (${input.decision.reason}).${goal}
המשימה: בלי לחץ ובלי אשמה. הצע *הורדת הילוך* — גרסה זעירה של הצעד שאי-אפשר להיכשל בה (micro-step downgrade), כדי להחזיר תחושת הצלחה. ולידציה רכה קודם.`;
  }
}

const CTA_BY_KIND: Record<
  ProgramStateDecision['proposalKind'],
  { accept: string; decline: string }
> = {
  level_up: { accept: 'יאללה, מוכן/ה', decline: 'עוד לא עכשיו' },
  daily_kickoff: { accept: 'קדימה ליום', decline: 'תודה, הבנתי' },
  pivot: { accept: 'בוא ננסה ככה', decline: 'לא היום' },
};

/** ניסוח דטרמיניסטי — fallback כשאין LLM / נכשל. לעולם לא משאירים בלי טקסט. */
function fallbackProposalText(input: BuildProposalInput): {
  headline: string;
  body: string;
  nextStep: ProgramProposalNextStep | null;
} {
  const name = input.firstName?.trim() || 'היי';
  const focus = input.aiCtx.current_focus || input.companion?.stepTitle || 'ההרגל שלך';
  switch (input.decision.proposalKind) {
    case 'level_up':
      return {
        headline: 'מוכן/ה לשלב הבא? 🚀',
        body: `${name}, שמרת על ${focus} ${input.consecutiveCompletedDays} ימים ברצף — זה בדיוק הרגע להוסיף צעד קטן חדש. בא נבנה על המומנטום.`,
        nextStep: {
          title: 'נוסיף מיקרו-צעד אחד קטן מעל מה שכבר עובד',
          detail: 'משהו של דקות בודדות, שקל להצליח בו כל יום.',
          next_step_id: null,
          habit_hint: null,
        },
      };
    case 'daily_kickoff':
      return {
        headline: 'בוקר טוב, ממשיכים 💪',
        body: `${name}, אתה בקצב טוב עם ${focus}. אותו דבר היום — צעד קטן אחד, ואני פה.`,
        nextStep: null,
      };
    case 'pivot':
      return {
        headline: 'בא ניקח את זה קטן יותר 💙',
        body: `${name}, אם ${focus} מרגיש כבד עכשיו — זה לגמרי בסדר. בוא נוריד הילוך לגרסה זעירה שאי-אפשר להיכשל בה, רק כדי להישאר בתנועה.`,
        nextStep: null,
      };
  }
}

type LlmProposalShape = {
  headline?: unknown;
  body?: unknown;
  next_step_title?: unknown;
  next_step_detail?: unknown;
};

function stripFences(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fence ? fence[1] : text).trim();
}

function parseJsonObject(raw: string): LlmProposalShape | null {
  const stripped = stripFences(raw);
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  const candidate = start !== -1 && end > start ? stripped.slice(start, end + 1) : stripped;
  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as LlmProposalShape)
      : null;
  } catch {
    return null;
  }
}

function asText(value: unknown, max = 320): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/\s+/g, ' ').replace(/^["'״׳`]+|["'״׳`]+$/g, '').trim();
  if (cleaned.length < 2) return null;
  return cleaned.length > max ? `${cleaned.slice(0, max - 1).trimEnd()}…` : cleaned;
}

/**
 * בונה הצעה מלאה. מנסה Groq JSON; אם אין מפתח / נכשל / פלט לא תקין —
 * נופל לניסוח דטרמיניסטי. תמיד מחזיר ProgramProposal תקין.
 */
export async function buildProgramProposal(
  input: BuildProposalInput
): Promise<ProgramProposal> {
  const cta = CTA_BY_KIND[input.decision.proposalKind];
  const fallback = fallbackProposalText(input);

  let headline = fallback.headline;
  let body = fallback.body;
  let nextStep = fallback.nextStep;
  let model: string | null = null;

  if (process.env.GROQ_API_KEY?.trim()) {
    const wantsNextStep = input.decision.proposalKind === 'level_up';
    const system = `${SAFETY_BLOCK}

${stateInstruction(input)}

החזר JSON תקין בלבד עם הסכימה:
{
  "headline": "כותרת קצרה מאוד לכרטיס (עד 6 מילים)",
  "body": "גוף ההודעה, 1-3 משפטים בקולו של אלמוג"${
    wantsNextStep
      ? `,
  "next_step_title": "ניסוח קצר של הצעד הבא המוצע",
  "next_step_detail": "משפט הסבר קצר אחד למה זה קטן וקל"`
      : ''
  }
}`;

    try {
      const completion = await groq.chat.completions.create({
        model: AI_MODELS.background_groq,
        temperature: 0.6,
        max_tokens: 400,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: `שם המשתמש: ${input.firstName || 'המשתמש'}. נסח את ההצעה עכשיו.`,
          },
        ],
      });
      const parsed = parseJsonObject(completion.choices[0]?.message?.content ?? '');
      const h = parsed ? asText(parsed.headline, 60) : null;
      const b = parsed ? asText(parsed.body, 320) : null;
      if (h && b) {
        headline = h;
        body = b;
        model = AI_MODELS.background_groq;
        if (wantsNextStep) {
          const title = asText(parsed?.next_step_title, 120) ?? fallback.nextStep?.title ?? '';
          const detail = asText(parsed?.next_step_detail, 160);
          nextStep = title
            ? {
                title,
                detail: detail ?? null,
                next_step_id: input.companion?.stepId ?? null,
                habit_hint: null,
              }
            : fallback.nextStep;
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[program-orchestrator] proposal LLM failed, using fallback', err);
    }
  }

  return {
    id: randomUUID(),
    kind: input.decision.proposalKind,
    state: input.decision.state,
    headline,
    body,
    next_step: nextStep,
    cta_accept_label: cta.accept,
    cta_decline_label: cta.decline,
    requires_buyin: input.decision.requiresBuyin,
    created_at: new Date().toISOString(),
    model,
  };
}
