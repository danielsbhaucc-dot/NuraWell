/**
 * Almog golden behavior cases (behavior lock).
 * Every deterministic step of an Almog turn that runs BEFORE/AFTER the model call:
 * signals → writer routing (v2 + v3 lanes) → intent detection (task/habit/weight/response)
 * → prompt assembly (system prompts, personas, guardrails, notify prompts)
 * → output post-processing (sanitize, leak/echo detection) → greeting/repetition hints.
 * Model calls are not executed here: the model is mocked as fixed raw outputs fed to the post-processors.
 * Fixture: almog-golden.fixture.json. Regenerate ONLY with explicit owner approval:
 *   UPDATE_ALMOG_GOLDEN=1 npx vitest run tests/almog-golden.test.ts
 */
import { createHash } from 'node:crypto';
import * as router from '../../lib/ai/chat-intent-router';
import * as v3 from '../../lib/ai/routing-v3';
import { detectChatSignals } from '../../lib/ai/chat-signals';
import { classifyResponseFast, outcomeFromCategory, isReportingCategory } from '../../lib/ai/response-classifier-fast';
import { detectTaskIntent } from '../../lib/ai/chat-task-intent';
import { detectHabitIntent, detectWaterHabitCompletionIntent } from '../../lib/ai/chat-habit-intent';
import { parseWeightKgFromMessage } from '../../lib/ai/chat-weight-intent';
import * as prompts from '../../lib/ai/prompts';
import * as promptsV2 from '../../lib/ai/prompts-v2';
import * as hebrew from '../../lib/ai/hebrew-output-rules';
import * as sanitize from '../../lib/ai/sanitize-writer-output';
import { buildAlmogGreeting, buildTaskDoneChatPrefill } from '../../lib/ai/almog-greeting';
import { buildRepetitionHint } from '../../lib/ai/repetition-hint';
import { parseLlmJsonObject } from '../../lib/ai/parse-llm-json';

export const USER_MESSAGES = [
  'היי', 'תודה, עשיתי', 'יום קשה, אני מרגיש לבד', 'מחר אתחיל, היום אין מצב',
  'אתה סתם בוט, לא מבין כלום', 'אני לא רוצה לחיות יותר', 'שתיתי 2 כוסות מים',
  'שקלתי היום 82.4 קילו', 'לא הספקתי את המשימה, אין לי כוח', 'סיימתי את ההליכה של הבוקר',
  'אכלתי שוקולד שלם, נשברתי', 'תפסיק ללחוץ עליי', 'מה אני צריך לעשות היום?',
  'אני לא מסכים איתך בכלל', 'אני רוצה להקיא אחרי כל ארוחה', 'ישנתי רק 4 שעות',
  'בוקר טוב אלמוג', 'עשיתי 10 דקות מדיטציה', 'אין לי זמן השבוע', 'סבבה', 'למה אתה לא עונה כמו שצריך?!',
  'השבוע ירדתי קילו!', 'אני מרגיש תקוע', 'בא לי לוותר על הכל', 'אני בסדר', 'what is my plan today',
];

const RAW_MODEL_OUTPUTS = [
  'היי {name}, איך עבר הבוקר?',
  '<think>user seems tired</think>בוא נעשה צעד קטן אחד.',
  '[מצב: אמפתיה]',
  'אני כאן איתך — ספר לי מה קרה.',
  'Thinking: the user wants...\nמה דעתך על הליכה קצרה?',
  'סיכום: המשתמש אמר שהוא עייף. תשובה: יאללה, מנוחה קודם.',
];

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

function stringExports(mod: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(mod).sort()) if (typeof mod[k] === 'string') out[k] = sha(mod[k] as string);
  return out;
}

const SIGNALS = { blocker_mentioned: false, avoid_push_requested: false, daily_availability_low_requested: false };
const PENDING = [{ id: 't1', title: 'הליכה של הבוקר' }, { id: 't2', title: 'לשתות 8 כוסות מים' }, { id: 't3', title: 'מדיטציה 10 דקות' }];
const HABITS = [{ id: 'h1', title: 'שתיית מים' }, { id: 'h2', title: 'שינה לפני 23:00' }];
const FIXED_NOW = new Date('2026-10-27T07:30:00Z');

export function computeAlmogGolden() {
  const saved = { ...process.env };
  for (const k of ['AI_CHAT_WRITER_CHEAP_V3', 'ALMOG_ROUTING_V3', 'AI_CHAT_WRITER_HAIKU', 'ALMOG_DAILY_SOFT_CAP_USD', 'AI_CHAT_WRITER_EMPATHY', 'ALMOG_PROMPT_V2']) delete process.env[k];
  try {
    const turns = USER_MESSAGES.map((m) => {
      const signals = detectChatSignals(m);
      const analysis = router.analyzeWriterIntent(m, SIGNALS);
      const cls = classifyResponseFast(m);
      return {
        m,
        signals,
        evasion: router.detectEvasion(m),
        analysis,
        stance: router.writerStancePrompt(analysis.tags ?? []) ? sha(router.writerStancePrompt(analysis.tags ?? [])!) : null,
        v3: v3.routeV3(m, analysis.tags ?? []),
        crisis: v3.isCrisisText(m, []),
        response: cls,
        outcome: cls ? outcomeFromCategory(cls.category as never) : null,
        reporting: cls ? isReportingCategory(cls.category) : null,
        task: detectTaskIntent(m, PENDING),
        habit: detectHabitIntent(m, HABITS),
        water: detectWaterHabitCompletionIntent(m),
        weightKg: parseWeightKgFromMessage(m),
      };
    });
    const merges = [
      ['llama4', 'llama4', []], ['terra', 'llama4', []], ['llama4', 'claude5', ['safety']],
      ['llama4', 'grok', ['accusation']], ['llama4', 'terra', ['empathy']], [undefined, 'claude5', ['evasion']],
    ].map(([a, b, tags]) => router.mergeWriterDecisions(a as never, b as never, undefined, undefined, tags as string[]));
    const writers = ['terra', 'claude5', 'grok', 'llama4', undefined, 'unknown'];
    const promptAssembly = {
      prompts: stringExports(prompts as never),
      promptsV2: stringExports(promptsV2 as never),
      hebrew: stringExports(hebrew as never),
      addressing: Object.fromEntries(['male', 'female', 'neutral', 'unknown'].map((g) => [g, sha(hebrew.hebrewAddressingRule(g as never))])),
      personas: writers.map((w) => sha(prompts.buildAlmogWriterPersona(w) + '\n' + prompts.buildAlmogVoiceSticky(w))),
      notify: ['hint-a', 'משימה: הליכה'].map((h) => sha(prompts.buildAlmogNotifySystemPrompt(h) + prompts.buildCompactAlmogNotifyPrompt(h, 'ctx'))),
      routerInstructions: sha(router.writerRouterInstructions()),
      promptV2Enabled: promptsV2.almogPromptV2Enabled(),
      v3Enabled: v3.routingV3Enabled(),
      softCap: v3.dailySoftCapUsd(),
    };
    const post = RAW_MODEL_OUTPUTS.map((raw) => ({
      raw,
      sanitized: sanitize.sanitizeWriterOutput(raw, { firstName: 'נועה' }),
      preferred: sanitize.preferSanitizedWriterOutput(raw, { firstName: 'נועה' }),
      echo: sanitize.looksLikeCondenserEcho(raw),
      bracket: sanitize.looksLikeBracketOnlyReply(raw),
      thinking: sanitize.looksLikeLeakedThinking(raw),
      hold: sanitize.shouldHoldStreamForThinking(raw.slice(0, 12)),
    }));
    const greetings = (['loading', 'fresh', 'pending', 'done'] as const).map((taskState) =>
      buildAlmogGreeting({ firstName: 'נועה', taskState, pendingCount: 2, doneCount: 1, dueToday: 3,
        pendingTasks: [{ title: 'הליכה', emoji: '🚶', slotLabel: 'בוקר' }], now: FIXED_NOW }));
    const misc = {
      prefill: buildTaskDoneChatPrefill('הליכה', 'בוקר'),
      repetition: buildRepetitionHint('אני לא מצליח לישון בלילה', [
        { content: 'אני לא מצליח לישון בלילה בכלל', created_at: '2026-10-26T20:00:00Z', session_id: 's1' } as never,
      ], { sessionId: 's2', now: FIXED_NOW.getTime() }),
      json: ['{"a":1}', '```json\n{"b":2}\n```', 'garbage'].map((r) => parseLlmJsonObject(r)),
    };
    return { version: 1, turns, merges, promptAssembly, post, greetings, misc };
  } finally {
    process.env = saved;
  }
}
