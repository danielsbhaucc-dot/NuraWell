import 'server-only';
/**
 * Receipt intake: raw RFC 822 message (from the receipts@ email worker or a manual upload) →
 * vendor DKIM/SPF check, rules-based parse, original .eml + attachments as content-addressed blobs,
 * a signed + chained + timestamped 'receipt' evidence record, and an index row with the paid period.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { sha256Hex } from '../evidence-crypto';
import { appendMediaEvidence } from './record';
import { storeMediaBlob } from './store';
import {
  VENDORS, detectVendor, forwarderAllowed, gmailConfirmationCode, isGmailForwardingConfirmation, parseAmount, parsePeriod, parsePlan,
} from './receipts-core';

export function allowedForwarders(): string[] {
  return (process.env.RECEIPTS_ALLOWED_FORWARDERS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

type Auth = { dkim: Array<{ domain: string; result: string; aligned: boolean }>; spf: string | null; dmarc: string | null };
async function authenticateRaw(raw: Buffer, envelopeFrom: string | null, ip: string | null): Promise<Auth> {
  try {
    const { authenticate } = await import('mailauth');
    const r = await authenticate(raw, { sender: envelopeFrom ?? undefined, ip: ip ?? undefined, trustReceived: false, disableArc: false });
    const dkim = (r.dkim?.results ?? []).map((x: { signingDomain?: string; status?: { result?: string; aligned?: string | boolean } }) => ({ domain: String(x.signingDomain ?? ''), result: String(x.status?.result ?? 'none'), aligned: !!x.status?.aligned }));
    const st = (v: unknown) => (v && typeof v === 'object' ? ((v as { status?: { result?: string } }).status?.result ?? null) : null);
    return { dkim, spf: st(r.spf), dmarc: st(r.dmarc) };
  } catch {
    return { dkim: [], spf: null, dmarc: null };
  }
}

export type IngestReceiptInput = { raw: Buffer; source: 'email' | 'upload'; envelopeFrom?: string | null; ip?: string | null; actorId?: string | null; extraFiles?: Array<{ name: string; mime: string; bytes: Buffer }> };

export async function ingestReceipt(admin: SupabaseClient, input: IngestReceiptInput) {
  const PostalMime = (await import('postal-mime')).default;
  const mail = await PostalMime.parse(input.raw);
  const from = mail.from?.address ?? '';
  const subject = (mail.subject ?? '').slice(0, 300);
  const text = (mail.text ?? (mail.html ?? '').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').slice(0, 50000);
  const headers: Record<string, string> = {};
  for (const h of mail.headers ?? []) headers[h.key.toLowerCase()] = String(h.value).slice(0, 500);

  const emlSha = sha256Hex(input.raw);
  const { data: dup } = await admin.from('media_receipts').select('id').eq('eml_sha', emlSha).maybeSingle();
  if (dup) return { ok: true as const, id: (dup as { id: string }).id, duplicate: true };

  const fwdOk = input.source === 'upload' ? true : forwarderAllowed(input.envelopeFrom ?? '', headers, allowedForwarders());
  const isConfirm = isGmailForwardingConfirmation(from, subject);
  if (input.source === 'email' && !fwdOk && !isConfirm) return { ok: false as const, error: 'forwarder_not_allowed' };

  const auth = await authenticateRaw(input.raw, input.envelopeFrom ?? null, input.ip ?? null);
  const fromDomain = from.split('@')[1]?.toLowerCase() ?? '';
  const vendorDkim = auth.dkim.some((d) => d.result === 'pass' && (fromDomain === d.domain || fromDomain.endsWith(`.${d.domain}`)));

  const eml = await storeMediaBlob(admin, input.raw, 'message/rfc822');
  if (!eml) return { ok: false as const, error: 'store_failed' };
  const atts: Array<{ sha256: string; name: string; mime: string; bytes: number }> = [];
  for (const a of mail.attachments ?? []) {
    const bytes = Buffer.from(a.content as ArrayBuffer);
    if (bytes.length > 8_000_000) continue;
    const b = await storeMediaBlob(admin, bytes, a.mimeType || 'application/octet-stream');
    if (b) atts.push({ sha256: b.sha256, name: (a.filename ?? 'attachment').slice(0, 200), mime: a.mimeType, bytes: bytes.length });
  }
  for (const f of input.extraFiles ?? []) {
    const b = await storeMediaBlob(admin, f.bytes, f.mime);
    if (b) atts.push({ sha256: b.sha256, name: f.name.slice(0, 200), mime: f.mime, bytes: f.bytes.length });
  }

  let vendor: string = isConfirm ? 'unknown' : detectVendor(from, subject, text);
  let { amount, currency } = parseAmount(text);
  let plan = parsePlan(vendor as never, `${subject}\n${text}`);
  let annualHint = false;
  let aiUsed = false;
  if (!isConfirm && (vendor === 'unknown' || amount === null)) {
    const ai = await aiParseFallback(admin, maskReceiptText(subject, text));
    if (ai) {
      aiUsed = true;
      if (vendor === 'unknown' && ai.vendor && ai.vendor in VENDORS) vendor = ai.vendor;
      if (amount === null && typeof ai.amount === 'number') { amount = ai.amount; currency = ai.currency ?? currency; }
      plan = plan ?? ai.plan ?? null;
      annualHint = !!ai.annual;
    }
  }
  const date = mail.date ? new Date(mail.date) : null;
  const receiptDate = date && !isNaN(+date) ? date.toISOString().slice(0, 10) : null;
  const period = parsePeriod(annualHint ? `${text}\nannual` : text, receiptDate);
  const trust = isConfirm ? 'review' : vendorDkim && fwdOk ? 'verified' : 'review';
  const row = {
    source: isConfirm ? 'gmail_confirmation' : input.source, vendor, plan, amount, currency, receipt_date: receiptDate,
    period_start: period.start, period_end: period.end, subject, original_from: from.slice(0, 200), forwarder_ok: fwdOk,
    dkim: { results: auth.dkim, dmarc: auth.dmarc, vendor_dkim_pass: vendorDkim }, spf: auth.spf, trust, eml_sha: eml.sha256, attachments: atts,
    confirmation_code: isConfirm ? gmailConfirmationCode(text) : null,
  };
  const parsedBy = aiUsed ? 'rules+ai' : 'rules';
  const { data: ins, error } = await admin.from('media_receipts').insert(row).select('id').single();
  if (error) return { ok: false as const, error: error.message };
  const id = (ins as { id: string }).id;
  const rec = await appendMediaEvidence(admin, `receipt:${id}`, 'receipt', { ...row, message_id: headers['message-id'] ?? null, parsed_by: parsedBy, received_at: new Date().toISOString(), envelope_from_hash: input.envelopeFrom ? sha256Hex(input.envelopeFrom.toLowerCase()) : null, actor_id: input.actorId ?? null });
  if (rec.ok) await admin.from('media_receipts').update({ record_hash: rec.recordHash }).eq('id', id);
  return { ok: true as const, id, vendor, trust, duplicate: false };
}

export async function updateReceipt(admin: SupabaseClient, id: string, patch: { vendor?: string; plan?: string | null; period_start?: string | null; period_end?: string | null; trust?: 'verified' | 'review' | 'rejected' }, actorId: string) {
  const rec = await appendMediaEvidence(admin, `receipt:${id}`, 'receipt_update', { patch, actor_id: actorId });
  if (!rec.ok) return { ok: false as const, error: rec.error };
  const { error } = await admin.from('media_receipts').update({ ...patch, record_hash: rec.recordHash, updated_at: new Date().toISOString() }).eq('id', id);
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

/** Masks anything identifying before the (rare) AI fallback: emails, long digit runs, card tails, addresses lines. */
export function maskReceiptText(subject: string, text: string): string {
  const keep = text.split('\n').filter((l) => /total|amount|plan|subscription|period|renew|premium|pro|plus|grok|suno|gemini|google one|chatgpt|elevenlabs|סה"כ|מנוי|תקופה|\d+[.,]\d{2}/i.test(l)).slice(0, 25).join('\n');
  return `${subject}\n${keep}`.replace(/[\w.+-]+@[\w.-]+\.\w+/g, '[email]').replace(/\b\d{6,}\b/g, '[n]').replace(/(?:ending in|\*{2,}|x{4})\s*\d{2,4}/gi, '[card]').slice(0, 1500);
}

export const RECEIPTS_AI_FEATURE = 'receipts_parse_ai';
/** Only when rules failed. Own usage component, daily cap (default $0.05). Fail-silent. */
export async function aiParseFallback(admin: SupabaseClient, masked: string): Promise<{ vendor?: string; plan?: string; amount?: number; currency?: string; annual?: boolean } | null> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key || process.env.RECEIPTS_AI === 'off') return null;
  const cap = Number(process.env.RECEIPTS_AI_DAILY_CAP_USD ?? 0.05);
  const { data } = await admin.from('ai_usage_events').select('cost_usd').eq('feature', RECEIPTS_AI_FEATURE).gte('created_at', new Date(Date.now() - 86400_000).toISOString()).limit(5000);
  if ((data ?? []).reduce((s, r) => s + Number((r as { cost_usd?: number }).cost_usd ?? 0), 0) >= cap) return null;
  const { meteredFetch } = await import('@/lib/ai/usage-meter');
  try {
    const res = await meteredFetch(fetch, { userId: null, feature: RECEIPTS_AI_FEATURE })('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(15_000), headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.MEDIA_PROVENANCE_AI_MODEL?.trim() || 'google/gemini-2.5-flash-lite', temperature: 0, max_tokens: 120, response_format: { type: 'json_object' }, usage: { include: true },
        messages: [{ role: 'system', content: 'Extract from this subscription receipt excerpt. JSON only: {"vendor": one of suno|xai|x_premium|google|openai|elevenlabs|apple|unknown, "plan": string|null, "amount": number|null, "currency": "USD"|"ILS"|"EUR"|"GBP"|null, "annual": boolean}' }, { role: 'user', content: masked }] }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return JSON.parse(j.choices?.[0]?.message?.content ?? 'null');
  } catch { return null; }
}

/** Manual fallback: a PDF/image receipt (or a forwarded .eml) uploaded in Ops. */
export async function uploadReceiptFile(admin: SupabaseClient, f: { name: string; mime: string; bytes: Buffer }, meta: { vendor: string; plan: string | null; receipt_date: string | null; period_start: string | null; period_end: string | null; amount: number | null; currency: string | null }, actorId: string) {
  if (/rfc822/.test(f.mime) || /\.eml$/i.test(f.name)) return ingestReceipt(admin, { raw: f.bytes, source: 'upload', actorId });
  const b = await storeMediaBlob(admin, f.bytes, f.mime);
  if (!b) return { ok: false as const, error: 'store_failed' };
  const row = { source: 'upload', ...meta, subject: f.name.slice(0, 300), forwarder_ok: true, trust: 'review', eml_sha: null, attachments: [{ sha256: b.sha256, name: f.name.slice(0, 200), mime: f.mime, bytes: f.bytes.length }] };
  const { data: ins, error } = await admin.from('media_receipts').insert(row).select('id').single();
  if (error) return { ok: false as const, error: error.message };
  const id = (ins as { id: string }).id;
  const rec = await appendMediaEvidence(admin, `receipt:${id}`, 'receipt', { ...row, actor_id: actorId, received_at: new Date().toISOString() });
  if (rec.ok) await admin.from('media_receipts').update({ record_hash: rec.recordHash }).eq('id', id);
  return { ok: true as const, id, duplicate: false };
}
