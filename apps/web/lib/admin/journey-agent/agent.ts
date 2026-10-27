import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { findNutritionSafetyViolation } from '@/lib/module-api/agent/lib-ai-safety-nutrition-safety';
import {
  chatJson,
  enrichResearchesFromLinks,
  ensureMinimums,
  extractUrls,
  mergeUrlsIntoResearches,
  runFillLLM,
  type AiFilledStep,
} from './fill-core';

/**
 * Journey-step agent for admins (replaces the one-shot "smart fill").
 *
 * Feels like an agent: it reads the material, says what it thinks (opinion + concerns), asks the
 * admin only questions that change the result (≤3, at most 2 rounds), then writes the step, scans
 * the research links, reviews its own draft (model critique + deterministic checks: minimum counts,
 * nutrition-safety, missing transcript) and reports. Every step is emitted as a live event and
 * persisted in journey_agent_sessions, so the panel can reload and Gideon/Telegram can follow.
 *
 * Model: STEP_AIFILL_MODEL (default google/gemini-2.5-flash — cheap, fast, strong Hebrew + JSON).
 */

export type AgentEvent =
  | { type: 'status'; text: string; progress?: number }
  | { type: 'thought'; text: string }
  | { type: 'opinion'; text: string; concerns?: string[] }
  | { type: 'question'; questions: AgentQuestion[] }
  | { type: 'review'; score: number; verdict: string; strengths: string[]; issues: string[]; suggestions: string[] }
  | { type: 'draft'; step: AiFilledStep; summary: string }
  | { type: 'done'; sessionId: string }
  | { type: 'error'; text: string };

export type AgentQuestion = { id: string; label: string; why: string };

export type AgentSession = {
  id: string;
  status: 'working' | 'waiting' | 'done' | 'error';
  source_text: string;
  answers: Record<string, string>;
  analysis: Analysis | null;
  pending_questions: AgentQuestion[];
  draft: AiFilledStep | null;
  review: Review | null;
  events: Array<AgentEvent & { at: string }>;
};

const Analysis = z.object({
  summary: z.string().default(''),
  opinion: z.string().default(''),
  concerns: z.array(z.string()).default([]),
  key_ideas: z.array(z.string()).default([]),
  target_behavior: z.string().default(''),
  has_lesson_transcript: z.boolean().default(true),
  questions: z
    .array(z.object({ id: z.string(), label: z.string(), why: z.string().default('') }))
    .max(3)
    .default([]),
  rounds: z.number().default(1),
});
type Analysis = z.infer<typeof Analysis>;

const Review = z.object({
  score: z.number().min(1).max(10).default(6),
  verdict: z.string().default(''),
  strengths: z.array(z.string()).default([]),
  issues: z.array(z.string()).default([]),
  suggestions: z.array(z.string()).default([]),
});
type Review = z.infer<typeof Review>;

const ANALYZE_SYSTEM = `אתה סוכן תוכן בכיר ב-NuraWell (מסע הרגלים בריאים בעברית) שעובד מול המנהל.
קרא את חומר המקור לפני שבונים צעד במסע, ותגיד מה אתה חושב — כמו עמית מקצועי, לא כמו טופס.
החזר JSON בלבד:
{
 "summary": "2-3 משפטים: על מה החומר",
 "opinion": "דעה כנה בגוף ראשון: מה חזק פה, מה הצעד צריך להשיג, מה הייתי עושה",
 "concerns": ["חששות אמיתיים: מחקר חלש/הפרזה, חסר תמלול, עומס, טענה רפואית/תזונתית שדורשת זהירות"],
 "key_ideas": ["3-6 רעיונות מרכזיים"],
 "target_behavior": "הפעולה ההתנהגותית האחת שהמשתמש אמור לעשות",
 "has_lesson_transcript": true/false,
 "questions": [{"id":"q1","label":"שאלה למנהל","why":"איך התשובה תשנה את הצעד"}]
}
כללים לשאלות: רק אם התשובה באמת משנה את התוצאה (מסר מרכזי, פעולה, סולם קושי, תמלול חסר). מקסימום 3. אם אפשר להחליט לבד בסבירות — אל תשאל, החלט וציין ב-opinion.
אסור להמליץ על תפריט/קלוריות/מאקרו אישיים — NuraWell לא דיאטן.`;

const REVIEW_SYSTEM = `אתה עורך בכיר ב-NuraWell. בדוק טיוטת צעד במסע (JSON) מול חומר המקור.
החזר JSON בלבד: {"score":1-10,"verdict":"משפט אחד","strengths":["..."],"issues":["בעיות קונקרטיות: אי-דיוק מול המקור, הפרזה מחקרית, שאלות כפולות, משימה לא מדידה, עברית לא טבעית, ייעוץ תזונתי אישי"],"suggestions":["תיקון קונקרטי אחד לכל בעיה"]}
היה ענייני וקצר. אל תמציא בעיות.`;

function parseJson<T>(raw: string, schema: z.ZodType<T>): T {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return schema.parse(JSON.parse(cleaned));
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    return schema.parse(m ? JSON.parse(m[0]) : {});
  }
}

function answersBlock(answers: Record<string, string>): string {
  const e = Object.entries(answers).filter(([, v]) => v.trim());
  return e.length ? `\n\n---\nתשובות/הערות המנהל:\n${e.map(([k, v]) => `${k}: ${v}`).join('\n')}` : '';
}

/** Deterministic checks the model can't talk its way out of. */
export function deterministicReview(step: AiFilledStep, analysis: Analysis | null): string[] {
  const issues: string[] = [];
  if ((step.quiz_questions?.length ?? 0) < 3) issues.push(`רק ${step.quiz_questions?.length ?? 0} שאלות הבנה (מינימום 3)`);
  if ((step.game_items?.length ?? 0) < 3) issues.push(`רק ${step.game_items?.length ?? 0} טענות משחק (מינימום 3)`);
  if ((step.attention_stops?.length ?? 0) < 4) issues.push(`רק ${step.attention_stops?.length ?? 0} נקודות קשב (מינימום 4)`);
  if (!step.tasks?.length) issues.push('אין משימה מדידה');
  const texts = [
    step.summary_text,
    step.description,
    ...(step.tasks ?? []).map((t) => `${t.title} ${t.description ?? ''}`),
    ...(step.habits ?? []).map((h) => `${h.title} ${h.description ?? ''}`),
  ];
  for (const t of texts) {
    const v = findNutritionSafetyViolation(t);
    if (v) {
      issues.push(`ניסוח שנראה כמו ייעוץ תזונתי אישי (${v}): "${String(t).slice(0, 80)}"`);
      break;
    }
  }
  if (analysis && !analysis.has_lesson_transcript) issues.push('אין תמלול שיעור — שאלות ההבנה ונקודות הקשב מבוססות על חומר חלקי');
  return issues;
}

export class JourneyAgent {
  constructor(
    private db: SupabaseClient,
    private session: AgentSession,
    private onEvent: (e: AgentEvent) => void = () => {}
  ) {}

  private async emit(e: AgentEvent) {
    const stamped = { ...e, at: new Date().toISOString() } as AgentEvent & { at: string };
    // drafts are big — keep them in the draft column, not duplicated in the event log
    this.session.events.push(e.type === 'draft' ? ({ type: 'draft', summary: e.summary, at: stamped.at } as never) : stamped);
    this.onEvent(e);
    await this.save();
  }

  private async save(patch: Partial<AgentSession> = {}) {
    Object.assign(this.session, patch);
    await this.db
      .from('journey_agent_sessions')
      .update({
        status: this.session.status,
        answers: this.session.answers,
        analysis: this.session.analysis,
        pending_questions: this.session.pending_questions,
        draft: this.session.draft,
        review: this.session.review,
        events: this.session.events.slice(-200),
        updated_at: new Date().toISOString(),
      })
      .eq('id', this.session.id);
  }

  /** Runs until it needs the admin (status=waiting) or finishes (done). */
  async run(): Promise<AgentSession> {
    try {
      await this.save({ status: 'working' });
      const src = this.session.source_text;

      // 1) read + opinion + (maybe) questions
      const needAnalysis = !this.session.analysis || this.session.pending_questions.length === 0 && !this.session.draft && Object.keys(this.session.answers).length > 0 && (this.session.analysis.rounds ?? 1) < 2;
      if (!this.session.analysis || needAnalysis) {
        await this.emit({ type: 'status', text: this.session.analysis ? 'קורא את התשובות שלך ומעדכן את התמונה…' : 'קורא את החומר…', progress: 8 });
        const { content } = await chatJson(ANALYZE_SYSTEM, `חומר המקור:\n${src.slice(0, 60_000)}${answersBlock(this.session.answers)}`, { maxTokens: 2500, temperature: 0.3 });
        const a = parseJson(content, Analysis);
        a.rounds = (this.session.analysis?.rounds ?? 0) + 1;
        // never re-ask what was answered; second round may only ask if something is still critical
        a.questions = a.questions.filter((q) => !this.session.answers[q.id] && !Object.values(this.session.answers).some((v) => v && q.label && v.includes(q.label)));
        if (a.rounds > 2) a.questions = [];
        this.session.analysis = a;
        await this.emit({ type: 'thought', text: a.summary });
        await this.emit({ type: 'opinion', text: a.opinion, concerns: a.concerns });
        if (a.questions.length) {
          this.session.pending_questions = a.questions;
          await this.emit({ type: 'question', questions: a.questions });
          await this.save({ status: 'waiting' });
          return this.session;
        }
      }

      // 2) write the step
      const a = this.session.analysis!;
      await this.emit({ type: 'status', text: 'כותב את הצעד: כותרת, סיכום, שאלות, משחק, נקודות קשב, משימות…', progress: 30 });
      const summary = [a.summary, a.target_behavior && `פעולה מרכזית: ${a.target_behavior}`, a.key_ideas.length && `רעיונות: ${a.key_ideas.join('; ')}`].filter(Boolean).join('\n');
      const { result, model } = await runFillLLM(src, { clarificationAnswers: this.session.answers, analysisSummary: summary });
      await this.emit({ type: 'status', text: `טיוטה ראשונה מוכנה (${model}). משלים מה שחסר…`, progress: 55 });
      await ensureMinimums(src, result, { clarificationAnswers: this.session.answers, analysisSummary: summary });
      const urls = extractUrls(src);
      result.researches = mergeUrlsIntoResearches(result.researches, urls);
      if (result.researches.some((r) => r.url)) {
        await this.emit({ type: 'status', text: `קורא ${Math.min(15, result.researches.filter((r) => r.url).length)} מחקרים מהקישורים…`, progress: 62 });
        const enriched = await enrichResearchesFromLinks(result.researches, (processed, total) => {
          this.onEvent({ type: 'status', text: `קורא מחקרים ${processed}/${total}`, progress: 62 + Math.round((processed / Math.max(1, total)) * 20) });
        });
        result.researches = enriched.researches;
      }

      // 3) self-review
      await this.emit({ type: 'status', text: 'בודק את עצמי: דיוק מול המקור, כפילויות, בטיחות…', progress: 88 });
      let review: Review = Review.parse({});
      try {
        const { content } = await chatJson(REVIEW_SYSTEM, `מקור (מקוצר):\n${src.slice(0, 15_000)}\n\nטיוטה:\n${JSON.stringify({ ...result, researches: result.researches.map((r) => ({ title: r.title, finding: r.finding })) }).slice(0, 30_000)}`, { maxTokens: 1500, temperature: 0.2 });
        review = parseJson(content, Review);
      } catch {
        review.verdict = 'לא הצלחתי להריץ ביקורת מודל — רק בדיקות אוטומטיות.';
      }
      const hard = deterministicReview(result, a);
      review.issues = [...hard, ...review.issues];
      if (hard.length) review.score = Math.min(review.score, 6);
      this.session.review = review;
      this.session.draft = result;
      await this.emit({ type: 'review', ...review });
      await this.emit({
        type: 'draft',
        step: result,
        summary: `${result.quiz_questions.length} שאלות · ${result.game_items.length} טענות משחק · ${result.attention_stops.length} נקודות קשב · ${result.tasks.length} משימות · ${result.habits.length} הרגלים · ${result.researches.length} מחקרים`,
      });
      await this.save({ status: 'done', pending_questions: [] });
      await this.emit({ type: 'done', sessionId: this.session.id });
      return this.session;
    } catch (e) {
      const text = e instanceof Error ? e.message : 'שגיאה';
      this.session.status = 'error';
      await this.emit({ type: 'error', text });
      return this.session;
    }
  }
}

export async function createAgentSession(db: SupabaseClient, p: { createdBy: string; sourceText: string; stepId?: string | null }): Promise<AgentSession> {
  const { data, error } = await db
    .from('journey_agent_sessions')
    .insert({ created_by: p.createdBy, source_text: p.sourceText, step_id: p.stepId ?? null })
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'session_create_failed');
  return normalizeSession(data);
}

export async function loadAgentSession(db: SupabaseClient, id: string): Promise<AgentSession | null> {
  const { data } = await db.from('journey_agent_sessions').select('*').eq('id', id).maybeSingle();
  return data ? normalizeSession(data) : null;
}

function normalizeSession(r: Record<string, unknown>): AgentSession {
  return {
    id: String(r.id),
    status: (r.status as AgentSession['status']) ?? 'working',
    source_text: String(r.source_text ?? ''),
    answers: (r.answers as Record<string, string>) ?? {},
    analysis: (r.analysis as Analysis) ?? null,
    pending_questions: (r.pending_questions as AgentQuestion[]) ?? [],
    draft: (r.draft as AiFilledStep) ?? null,
    review: (r.review as Review) ?? null,
    events: (r.events as AgentSession['events']) ?? [],
  };
}

/** Admin answers / free comments. A comment after a finished draft starts a new revision round. */
export function applyAdminInput(s: AgentSession, input: { answers?: Record<string, string>; comment?: string }): AgentSession {
  const answers = { ...s.answers, ...(input.answers ?? {}) };
  if (input.comment?.trim()) answers[`הערה ${Object.keys(answers).length + 1}`] = input.comment.trim();
  const revise = s.status === 'done' && Boolean(input.comment?.trim());
  return {
    ...s,
    answers,
    pending_questions: [],
    draft: revise ? null : s.draft,
    review: revise ? null : s.review,
    status: 'working',
  };
}
