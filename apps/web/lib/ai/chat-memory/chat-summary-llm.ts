import { guardOutboundBody } from '@/lib/ai/privacy/outbound-pii-guard';
import { currentAiUserId, recordBatchUsage } from '@/lib/ai/usage-meter';
/**
 * סיכום שיחות — מודל זול OpenRouter (או Batch API אם מוגדר).
 */

import { publicAppUrlForAiReferer } from '../../public-app-url';
import type { ChatSummaryType } from './chat-period-keys';
import { adaptGroqChatBody, groqCompatFetch } from '../groq-compat';
import { applyOpenRouterProviderIgnore, readOpenRouterProvider } from '@/lib/ai/openrouter-request';

export const CHAT_SUMMARY_MODEL =
  process.env.CHAT_SUMMARY_MODEL?.trim() ||
  process.env.MEMORY_EXTRACTION_MODEL?.trim() ||
  'openai/gpt-oss-120b';

const TYPE_LABELS: Record<ChatSummaryType, string> = {
  daily: 'יום',
  weekly: 'שבוע',
  monthly: 'חודש',
  bi_monthly: 'חודשיים',
  quarterly: 'רבעון',
  semi_annual: 'חצי שנה',
  annual: 'שנה',
};

const SYSTEM_PROMPT = `אתה מארגן זיכרון שיחות של מנטור בריאות (אלמוג / NuraWell) בעברית.
מטרה: לעשות סדר במידע — לא לשכתב הכל.

החזר טקסט מובנה (בלי markdown, בלי JSON):
סיכום: ...
מה_המשתמש_הסביר: [תאריך/שעה] נושא — מה נאמר; ...
תובנות: ...
פתוח: ...
חוזר: ... (×N אם חוזר)

כללים:
- ציין תאריכים ושעות כשיש בחומר.
- הפרד בין מה שנאמר בפועל לבין השערות.
- קצר ומדויק. יום=עד ~400 מילים; שבוע+=עד ~600.`;

function isOpenRouterBatchEnabled(): boolean {
  const v = process.env.CHAT_SUMMARY_USE_BATCH?.trim().toLowerCase();
  return v === '1' || v === 'true';
}

async function callOpenRouterSync(params: {
  userContent: string;
  maxTokens: number;
}): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) return '';

  const res = await groqCompatFetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'HTTP-Referer': publicAppUrlForAiReferer(),
      'X-Title': 'NuraWell Chat Summary',
    },
    body: JSON.stringify({
      model: CHAT_SUMMARY_MODEL,
      temperature: 0.2,
      max_tokens: params.maxTokens,
      usage: { include: true },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: params.userContent },
      ],
    }),
  });

  if (!res.ok) return '';
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

/**
 * OpenRouter Batch API — אצווה א-synchronous; כרגע fallback ל-sync אם לא הוגדר batch key.
 * https://openrouter.ai/docs/features/batch-api
 */
type BatchResultBody = {
  model?: string;
  provider?: unknown;
  usage?: Parameters<typeof recordBatchUsage>[0]['usage'];
  choices?: Array<{ message?: { content?: string } }>;
};

type Detokenize = { detokenizeText: (text: string) => string };

const openRouterAuthHeaders = (key: string) => ({ Authorization: `Bearer ${key}` });

const summaryInnerBody = (userContent: string, maxTokens: number): Record<string, unknown> => ({
  model: CHAT_SUMMARY_MODEL,
  temperature: 0.2,
  max_tokens: maxTokens,
  messages: [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ],
});

const createSummaryBatch = async (
  key: string,
  customId: string,
  innerBody: Record<string, unknown>
): Promise<string | null> => {
  const createRes = await fetch('https://openrouter.ai/api/v1/batches', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...openRouterAuthHeaders(key),
    },
    body: JSON.stringify({
      requests: [
        {
          custom_id: customId,
          method: 'POST',
          url: '/v1/chat/completions',
          body: applyOpenRouterProviderIgnore(
            adaptGroqChatBody(innerBody as Parameters<typeof adaptGroqChatBody>[0], { viaOpenRouter: true })
          ),
        },
      ],
    }),
  });
  if (!createRes.ok) return null;
  const created = (await createRes.json()) as { id?: string };
  return created.id ?? null;
};

const readCompletedBatchLine = async (resultsUrl: string, key: string): Promise<string | null> => {
  const resultsRes = await fetch(resultsUrl, { headers: openRouterAuthHeaders(key) });
  if (!resultsRes.ok) return null;
  const text = await resultsRes.text();
  const line = text.split('\n').find(Boolean);
  return line ?? null;
};

const batchResultBody = (line: string): BatchResultBody | undefined => {
  const parsed = JSON.parse(line) as { response?: { body?: BatchResultBody } };
  return parsed.response ? parsed.response.body : undefined;
};

const firstMessageContent = (body: BatchResultBody | undefined): string | undefined => {
  if (!body || !body.choices) return undefined;
  const message = body.choices[0] ? body.choices[0].message : undefined;
  return message ? message.content : undefined;
};

const batchChoiceText = (body: BatchResultBody | undefined): string | null => {
  const raw = firstMessageContent(body);
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
};

const recordAndDetokenizeBatchLine = async (line: string, shield: Detokenize): Promise<string | null> => {
  const body = batchResultBody(line);
  await recordBatchUsage({
    feature: 'chat_periodic_summary',
    model: body && body.model ? body.model : CHAT_SUMMARY_MODEL,
    usage: body ? body.usage : undefined,
    provider: readOpenRouterProvider(body),
  }).catch(() => undefined);
  const out = batchChoiceText(body);
  if (!out) return null;
  return shield.detokenizeText(out);
};

const handleCompletedBatch = async (resultsUrl: string, key: string, shield: Detokenize): Promise<string | null> => {
  const line = await readCompletedBatchLine(resultsUrl, key);
  if (!line) return null;
  return recordAndDetokenizeBatchLine(line, shield);
};

const isFailedOrCancelledBatch = (status?: string): boolean =>
  status === 'failed' || status === 'cancelled';

type PollResult = string | null | 'continue';

const pollSummaryBatchOnce = async (key: string, batchId: string, shield: Detokenize): Promise<PollResult> => {
  const poll = await fetch(`https://openrouter.ai/api/v1/batches/${batchId}`, {
    headers: openRouterAuthHeaders(key),
  });
  if (!poll.ok) return 'continue';
  const status = (await poll.json()) as { status?: string; results_url?: string };
  if (status.status === 'completed' && status.results_url) {
    return handleCompletedBatch(status.results_url, key, shield);
  }
  if (isFailedOrCancelledBatch(status.status)) return null;
  return 'continue';
};

const pollSummaryBatch = async (key: string, batchId: string, shield: Detokenize): Promise<string | null> => {
  for (let i = 0; i < 30; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const result = await pollSummaryBatchOnce(key, batchId, shield);
    if (result !== 'continue') return result;
  }
  return null;
};

const callOpenRouterBatch = async (params: {
  customId: string;
  userContent: string;
  maxTokens: number;
}): Promise<string | null> => {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) return null;
  try {
    // Batch API bypasses meteredFetch, so run the central PII guard on the inner request explicitly.
    const innerBody = summaryInnerBody(params.userContent, params.maxTokens);
    const shield = await guardOutboundBody(innerBody, currentAiUserId());
    const batchId = await createSummaryBatch(key, params.customId, innerBody);
    if (!batchId) return null;
    return pollSummaryBatch(key, batchId, shield);
  } catch {
    return null;
  }
};

export async function generateChatSummaryInsight(params: {
  type: ChatSummaryType;
  periodKey: string;
  firstName: string;
  sourceBlock: string;
  childInsights?: Array<{ period_key: string; insight: string }>;
}): Promise<string> {
  const label = TYPE_LABELS[params.type];
  const maxTokens = params.type === 'daily' ? 650 : params.type === 'weekly' ? 750 : 900;

  const childBlock =
    params.childInsights && params.childInsights.length > 0
      ? `\n\nסיכומי רמה נמוכה:\n${params.childInsights.map((c) => `• ${c.period_key}: ${c.insight.slice(0, 400)}`).join('\n')}`
      : '';

  const userContent = `רמה: ${label} ${params.periodKey}
שם: ${params.firstName}

חומר גולמי:
${params.sourceBlock || '(אין חומר)'}${childBlock}`;

  if (isOpenRouterBatchEnabled()) {
    const batchResult = await callOpenRouterBatch({
      customId: `${params.type}-${params.periodKey}`.slice(0, 64),
      userContent,
      maxTokens,
    });
    if (batchResult?.trim()) return batchResult.slice(0, 3200);
  }

  const sync = await callOpenRouterSync({ userContent, maxTokens });
  return sync.slice(0, 3200);
}
