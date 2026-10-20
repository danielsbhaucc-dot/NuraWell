import 'server-only';
/**
 * Cheap one-time description/classification of SITE media (never user data, never people's
 * personal files): filename, path, kind, size, embedded-metadata hints and a 384px preview.
 * Stored once per file hash. Daily cost cap; any failure = no description (scanner continues).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { meteredFetch } from '@/lib/ai/usage-meter';
import { SOURCE_TYPES, type SourceType } from './core';

export const MEDIA_AI_FEATURE = 'media_provenance_ai';
export const MEDIA_AI_MODEL = process.env.MEDIA_PROVENANCE_AI_MODEL?.trim() || 'google/gemini-2.5-flash-lite';
export function mediaAiDailyCapUsd() {
  const n = Number(process.env.MEDIA_PROVENANCE_AI_DAILY_CAP_USD);
  return Number.isFinite(n) && n >= 0 ? n : 0.5;
}

export type AiDescribeInput = { name: string; path: string | null; kind: string; mime: string | null; width?: number | null; height?: number | null; hints: string[]; usages: string[]; thumbJpeg?: Buffer | null; svgText?: string | null };
export type AiDescribe = { description_he: string; tags: string[]; likely_source: SourceType; confidence: number };

export function buildDescribeMessages(i: AiDescribeInput) {
  const facts = [`name: ${i.name}`, i.path ? `path: ${i.path}` : null, `kind: ${i.kind}`, i.mime ? `mime: ${i.mime}` : null, i.width ? `size: ${i.width}x${i.height}` : null,
    i.hints.length ? `embedded metadata: ${i.hints.join(' | ').slice(0, 600)}` : null, i.usages.length ? `used on: ${i.usages.slice(0, 6).join(', ')}` : null,
    i.svgText ? `svg source (truncated):\n${i.svgText.slice(0, 1500)}` : null].filter(Boolean).join('\n');
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: facts }];
  if (i.thumbJpeg) content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${i.thumbJpeg.toString('base64')}` } });
  return [
    { role: 'system', content: `You catalogue media files of a Hebrew wellness website for a legal provenance register. Reply ONLY JSON: {"description_he": string (one short Hebrew sentence describing what the file shows/sounds like, searchable, no guesses about people's identity), "tags": string[] (3-8 short Hebrew search tags), "likely_source": one of ${SOURCE_TYPES.join('|')}, "confidence": 0..1}. Hand-written SVG code = in_house. Never invent prompts, authors or licenses.` },
    { role: 'user', content },
  ];
}

export function parseDescribe(raw: string): AiDescribe | null {
  try {
    const j = JSON.parse(raw.replace(/^```(?:json)?|```$/g, '').trim()) as Partial<AiDescribe>;
    if (typeof j.description_he !== 'string' || !j.description_he.trim()) return null;
    const ls = SOURCE_TYPES.includes(j.likely_source as SourceType) ? (j.likely_source as SourceType) : 'unknown';
    return { description_he: j.description_he.trim().slice(0, 300), tags: (Array.isArray(j.tags) ? j.tags : []).filter((t): t is string => typeof t === 'string').map((t) => t.trim().slice(0, 40)).filter(Boolean).slice(0, 8), likely_source: ls, confidence: Math.max(0, Math.min(1, Number(j.confidence) || 0)) };
  } catch {
    return null;
  }
}

let spent: { at: number; usd: number } | null = null;
async function spentToday(admin: SupabaseClient) {
  if (spent && Date.now() - spent.at < 60_000) return spent.usd;
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data } = await admin.from('ai_usage_events').select('cost_usd').eq('feature', MEDIA_AI_FEATURE).gte('created_at', since).limit(20000);
  const usd = (data ?? []).reduce((s, r) => s + Number((r as { cost_usd?: number }).cost_usd ?? 0), 0);
  spent = { at: Date.now(), usd };
  return usd;
}

export async function describeMedia(admin: SupabaseClient, i: AiDescribeInput, fetchImpl?: typeof fetch): Promise<{ result: AiDescribe | null; costUsd: number | null; model: string }> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key || process.env.MEDIA_PROVENANCE_AI === 'off') return { result: null, costUsd: null, model: MEDIA_AI_MODEL };
  try {
    if ((await spentToday(admin)) >= mediaAiDailyCapUsd()) return { result: null, costUsd: null, model: MEDIA_AI_MODEL };
  } catch { /* cap lookup failed: be conservative */ return { result: null, costUsd: null, model: MEDIA_AI_MODEL }; }
  const f = fetchImpl ?? meteredFetch(fetch, { userId: null, feature: MEDIA_AI_FEATURE });
  try {
    const res = await f('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: MEDIA_AI_MODEL, temperature: 0, max_tokens: 220, response_format: { type: 'json_object' }, usage: { include: true }, messages: buildDescribeMessages(i) }),
    });
    if (!res.ok) return { result: null, costUsd: null, model: MEDIA_AI_MODEL };
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: { cost?: number } };
    const cost = typeof j.usage?.cost === 'number' ? j.usage.cost : null;
    if (spent && cost) spent.usd += cost;
    return { result: parseDescribe(j.choices?.[0]?.message?.content ?? ''), costUsd: cost, model: MEDIA_AI_MODEL };
  } catch {
    return { result: null, costUsd: null, model: MEDIA_AI_MODEL };
  }
}
