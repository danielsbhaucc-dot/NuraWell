/**
 * סיכום שיחות — מודל זול OpenRouter (או Batch API אם מוגדר).
 */

import { publicAppUrlForAiReferer } from '../../public-app-url';
import type { ChatSummaryType } from './chat-period-keys';

export const CHAT_SUMMARY_MODEL =
  process.env.CHAT_SUMMARY_MODEL?.trim() ||
  process.env.MEMORY_EXTRACTION_MODEL?.trim() ||
  'meta-llama/llama-4-scout';

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

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
async function callOpenRouterBatch(params: {
  customId: string;
  userContent: string;
  maxTokens: number;
}): Promise<string | null> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) return null;

  try {
    const createRes = await fetch('https://openrouter.ai/api/v1/batches', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        requests: [
          {
            custom_id: params.customId,
            method: 'POST',
            url: '/v1/chat/completions',
            body: {
              model: CHAT_SUMMARY_MODEL,
              temperature: 0.2,
              max_tokens: params.maxTokens,
              messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: params.userContent },
              ],
            },
          },
        ],
      }),
    });

    if (!createRes.ok) return null;
    const created = (await createRes.json()) as { id?: string };
    const batchId = created.id;
    if (!batchId) return null;

    for (let i = 0; i < 30; i += 1) {
      await new Promise((r) => setTimeout(r, 2000));
      const poll = await fetch(`https://openrouter.ai/api/v1/batches/${batchId}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!poll.ok) continue;
      const status = (await poll.json()) as {
        status?: string;
        results_url?: string;
      };
      if (status.status === 'completed' && status.results_url) {
        const resultsRes = await fetch(status.results_url, {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (!resultsRes.ok) return null;
        const text = await resultsRes.text();
        const line = text.split('\n').find(Boolean);
        if (!line) return null;
        const parsed = JSON.parse(line) as {
          response?: { body?: { choices?: Array<{ message?: { content?: string } }> } };
        };
        return parsed.response?.body?.choices?.[0]?.message?.content?.trim() ?? null;
      }
      if (status.status === 'failed' || status.status === 'cancelled') return null;
    }
    return null;
  } catch {
    return null;
  }
}

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
