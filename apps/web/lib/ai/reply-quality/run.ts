/**
 * Async post-send quality check for Almog replies. Called from after() once the reply was
 * fully streamed AND persisted, so it never adds latency. Fail-silent: any error = no edit.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptChatContent, encryptChatContent } from '@/lib/crypto/pii-fields';
import { meteredFetch } from '@/lib/ai/usage-meter';
import {
  REPLY_QC_FEATURE,
  REPLY_QC_MAX_AGE_MS,
  REPLY_QC_MODEL,
  REPLY_QC_TIMEOUT_MS,
  buildReplyQcMessages,
  parseReplyQcVerdict,
  replyQcDailyCapUsd,
  replyQcEnabled,
  replyQcSkipReason,
  validateReplyQcFix,
  maskReplyQcInput,
  type ReplyQcInput,
  type ReplyQcVerdict,
} from './core';
import { logNotifyQualityEvents } from '@/lib/notifications/quality-learning';

/** source tag in notify_quality_events so nightly rules learn from chat replies too */
export const REPLY_QC_LEARN_SOURCE = 'almog_reply';

export type ReplyQcCallResult = {
  verdict: ReplyQcVerdict | null;
  latencyMs: number;
  costUsd: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
};

/** One model call (metered → ai_usage_events feature=almog_reply_qc). Exported for the measurement script. */
export async function callReplyQcModel(
  input: ReplyQcInput,
  opts: { userId?: string | null; fetchImpl?: typeof fetch; model?: string } = {}
): Promise<ReplyQcCallResult> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  const started = Date.now();
  if (!key) return { verdict: null, latencyMs: 0, costUsd: null, promptTokens: null, completionTokens: null };
  const f = opts.fetchImpl ?? meteredFetch(fetch, { userId: opts.userId ?? null, feature: REPLY_QC_FEATURE });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REPLY_QC_TIMEOUT_MS);
  try {
    const res = await f('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: opts.model ?? REPLY_QC_MODEL,
        // thinking models: keep it minimal (cost/latency); 2.5-flash-lite has no thinking by default
        ...(/gemini-3/.test(opts.model ?? REPLY_QC_MODEL) ? { reasoning: { effort: 'minimal', exclude: true } } : {}),
        temperature: 0,
        max_tokens: Math.min(1200, Math.ceil(input.reply.length / 1.5) + 60),
        response_format: { type: 'json_object' },
        usage: { include: true },
        messages: buildReplyQcMessages(input),
      }),
    });
    if (!res.ok) return { verdict: null, latencyMs: Date.now() - started, costUsd: null, promptTokens: null, completionTokens: null };
    const j = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      verdict: parseReplyQcVerdict(j.choices?.[0]?.message?.content ?? ''),
      latencyMs: Date.now() - started,
      costUsd: typeof j.usage?.cost === 'number' ? j.usage.cost : null,
      promptTokens: j.usage?.prompt_tokens ?? null,
      completionTokens: j.usage?.completion_tokens ?? null,
    };
  } catch {
    return { verdict: null, latencyMs: Date.now() - started, costUsd: null, promptTokens: null, completionTokens: null };
  } finally {
    clearTimeout(timer);
  }
}

let capCache: { at: number; spent: number } | null = null;

async function spentTodayUsd(admin: SupabaseClient): Promise<number> {
  if (capCache && Date.now() - capCache.at < 60_000) return capCache.spent;
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const offsetMs = new Date().getTime() - d.getTime();
  const startLocal = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() + offsetMs;
  const { data, error } = await admin
    .from('ai_usage_events')
    .select('cost_usd')
    .eq('feature', REPLY_QC_FEATURE)
    .gte('created_at', new Date(startLocal).toISOString())
    .limit(20000);
  if (error) throw error;
  const spent = (data ?? []).reduce((s, r) => s + Number((r as { cost_usd?: number }).cost_usd ?? 0), 0);
  capCache = { at: Date.now(), spent };
  return spent;
}

export type ReplyQcOutcome =
  | { status: 'disabled' | 'cap' | 'not_found' | 'too_old' | 'already_edited' | 'no_verdict' | 'ok' | 'error' }
  | { status: 'skipped'; reason: string }
  | { status: 'rejected'; reason: string }
  | { status: 'edited'; interactionId: string };

/**
 * Review the latest stored assistant reply of the session; apply at most one small edit.
 * `admin` = service-role client (update + audit table are service-only).
 */
export async function runAlmogReplyQualityCheck(
  admin: SupabaseClient,
  p: Omit<ReplyQcInput, 'reply'> & { userId: string; sessionId: string; crisis?: boolean; firstName?: string | null }
): Promise<ReplyQcOutcome> {
  try {
    if (!replyQcEnabled()) return { status: 'disabled' };
    if ((await spentTodayUsd(admin)) >= replyQcDailyCapUsd()) return { status: 'cap' };

    const { data: row } = await admin
      .from('ai_interactions')
      .select('id, content, created_at, metadata')
      .eq('session_id', p.sessionId)
      .eq('user_id', p.userId)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!row) return { status: 'not_found' };
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    if (meta.qc_edited_at) return { status: 'already_edited' };
    const createdAt = new Date(String(row.created_at)).getTime();
    if (!Number.isFinite(createdAt) || Date.now() - createdAt > REPLY_QC_MAX_AGE_MS - REPLY_QC_TIMEOUT_MS) return { status: 'too_old' };

    const reply = decryptChatContent(row.content, p.userId);
    const input: ReplyQcInput = { ...p, reply };
    const skip = replyQcSkipReason({ ...input, crisis: p.crisis });
    if (skip) return { status: 'skipped', reason: skip };

    const { firstName, userId: _u, sessionId: _s, crisis: _c, ...qcBase } = p;
    const { masked, restore } = maskReplyQcInput({ ...qcBase, reply }, firstName);
    // userId only feeds our internal usage meter; the request body carries masked text only
    const r = await callReplyQcModel(masked, { userId: p.userId });
    if (r.costUsd && capCache) capCache.spent += r.costUsd;
    if (!r.verdict) return { status: 'no_verdict' };
    if (r.verdict.ok) return { status: 'ok' };
    const vm = validateReplyQcFix(masked.reply, r.verdict.fixed, { healthConsentOff: p.healthConsentOff });
    if (!vm.ok) {
      void logNotifyQualityEvents(
        [{ stage: 'qc_reject', category: vm.reason, source: REPLY_QC_LEARN_SOURCE, before: masked.reply, after: null }],
        { firstName, admin }
      );
      return { status: 'rejected', reason: vm.reason };
    }
    const v = { ok: true as const, fixed: restore(vm.fixed) };
    if (Date.now() - createdAt > REPLY_QC_MAX_AGE_MS) return { status: 'too_old' };

    // audit first (original kept, encrypted like chat) — unique(interaction_id) enforces max 1 edit
    const { error: auditErr } = await admin.from('ai_interaction_edits').insert({
      interaction_id: row.id,
      user_id: p.userId,
      session_id: p.sessionId,
      original_content: encryptChatContent(reply, p.userId),
      edited_content: encryptChatContent(v.fixed, p.userId),
      source: REPLY_QC_FEATURE,
      model: REPLY_QC_MODEL,
      cost_usd: r.costUsd ?? 0,
    });
    if (auditErr) return { status: 'already_edited' };
    const { error: updErr } = await admin
      .from('ai_interactions')
      .update({
        content: encryptChatContent(v.fixed, p.userId),
        metadata: { ...meta, qc_edited_at: new Date().toISOString(), qc_model: REPLY_QC_MODEL },
      })
      .eq('id', row.id)
      .eq('user_id', p.userId);
    if (updErr) {
      await admin.from('ai_interaction_edits').delete().eq('interaction_id', row.id);
      return { status: 'error' };
    }
    // anonymized learning (no name, no user id; PII already tokenized) → nightly style rules
    void logNotifyQualityEvents(
      [{ stage: 'qc_edit', category: 'reply_fix', source: REPLY_QC_LEARN_SOURCE, before: masked.reply, after: vm.fixed }],
      { firstName, admin }
    );
    return { status: 'edited', interactionId: String(row.id) };
  } catch {
    return { status: 'error' };
  }
}
