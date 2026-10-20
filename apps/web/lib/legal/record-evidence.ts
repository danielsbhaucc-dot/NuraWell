import 'server-only';
/**
 * Creates one append-only, signed, hash-chained consent evidence record, stores the sheet
 * screenshot privately, and adds independent attestations (RFC 3161 TSA, OpenTimestamps,
 * email receipt). The model never calls this: only the consent API after an explicit user submit.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { encryptString } from '@/lib/crypto/pii';
import {
  consentText,
  isAcceptedConsentWord,
  normalizeGender,
  renderConsentHtml,
  CONSENT_TEXT_VERSION,
  type ConsentAction,
} from './consent-text';
import { canonicalJson, GENESIS, recordHash, sha256Hex, signHash, type EvidencePayload } from './evidence-crypto';
import { requestTimestamp } from './tsa';
import { otsStamp } from './ots';
import { storeEvidenceImage } from './evidence-storage';

export const MAX_SCREENSHOT_INPUT_BYTES = 600_000;

export type ConsentSubmission = {
  action: ConsentAction;
  textVersion: string;
  typedWord: string;
  checkbox: boolean;
  screenshotDataUrl?: string | null;
};

export type RequestMeta = { ip: string | null; userAgent: string | null; sessionId: string | null; deviceId: string | null };

export function requestMeta(request: Request, sessionId: string | null): RequestMeta {
  const h = request.headers;
  const ip = (h.get('x-real-ip') || h.get('x-forwarded-for')?.split(',')[0] || '').trim() || null;
  const cookie = h.get('cookie') ?? '';
  const dev = /(?:^|;\s*)nw_dev=([^;]+)/.exec(cookie)?.[1] ?? null;
  return { ip, userAgent: h.get('user-agent')?.slice(0, 400) ?? null, sessionId, deviceId: dev ? sha256Hex(dev).slice(0, 32) : null };
}

export function validateSubmission(s: ConsentSubmission): string | null {
  if (s.textVersion !== CONSENT_TEXT_VERSION) return 'stale_text_version';
  if (s.checkbox !== true) return 'checkbox_required';
  if (!isAcceptedConsentWord(s.action, s.typedWord)) return 'typed_word_invalid';
  return null;
}

/** Decodes + re-encodes the client screenshot (strips metadata, bounds size). */
export async function normalizeScreenshot(dataUrl: string | null | undefined): Promise<Buffer | null> {
  if (!dataUrl) return null;
  const m = /^data:image\/(webp|png|jpeg|avif);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const raw = Buffer.from(m[2]!, 'base64');
  if (raw.length > MAX_SCREENSHOT_INPUT_BYTES) return null;
  const sharp = (await import('sharp')).default;
  return sharp(raw, { limitInputPixels: 4096 * 8192 })
    .resize({ width: 1080, withoutEnlargement: true })
    .webp({ quality: 80, effort: 4 })
    .toBuffer();
}

export function ipHash(ip: string | null, userId: string): string | null {
  return ip ? createHash('sha256').update(`nw-consent-ip|${userId}|${ip}`).digest('hex') : null;
}

export type EvidenceResult =
  | { ok: true; id: string; recordHash: string; reference: string; createdAt: string }
  | { ok: false; error: string };

export async function recordConsentEvidence(
  admin: SupabaseClient,
  userId: string,
  source: string,
  sub: ConsentSubmission,
  meta: RequestMeta,
  opts: { sendReceipt?: boolean } = {}
): Promise<EvidenceResult> {
  const invalid = validateSubmission(sub);
  if (invalid) return { ok: false, error: invalid };

  const { data: prof } = await admin.from('profiles').select('gender').eq('id', userId).maybeSingle();
  const gender = normalizeGender((prof as { gender?: string } | null)?.gender);
  const text = consentText(sub.action, gender);
  const html = renderConsentHtml(text, { checkbox: sub.checkbox, typed: sub.typedWord.slice(0, 40) });
  const renderedSha = sha256Hex(html);

  let shot: Buffer | null = null;
  try {
    shot = await normalizeScreenshot(sub.screenshotDataUrl);
  } catch {
    shot = null;
  }
  const shotSha = shot ? sha256Hex(shot) : null;
  let stored: { storage: string; key: string } | null = null;
  if (shot && shotSha) stored = await storeEvidenceImage(admin, userId, shotSha, shot);

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: last } = await admin
      .from('consent_evidence')
      .select('record_hash')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    const prev = (last as { record_hash?: string } | null)?.record_hash ?? GENESIS;
    const createdAt = new Date().toISOString();
    const payload: EvidencePayload = {
      v: 1,
      user_id: userId,
      consent_type: 'health_data',
      action: sub.action,
      source,
      text_version: text.version,
      rendered_sha256: renderedSha,
      typed_word: sub.typedWord.slice(0, 40),
      checkbox_checked: sub.checkbox,
      ip_hash: ipHash(meta.ip, userId),
      user_agent: meta.userAgent,
      session_id: meta.sessionId,
      device_id: meta.deviceId,
      screenshot_sha256: shotSha,
      created_at: createdAt,
      prev_hash: prev,
    };
    const payloadJson = canonicalJson(payload);
    const hash = recordHash(payloadJson);
    const sig = signHash(hash);
    const { data: ins, error } = await admin
      .from('consent_evidence')
      .insert({
        user_id: userId,
        consent_type: 'health_data',
        action: sub.action,
        source,
        text_version: text.version,
        rendered_html: html,
        rendered_sha256: renderedSha,
        typed_word: payload.typed_word,
        checkbox_checked: sub.checkbox,
        ip_hash: payload.ip_hash,
        ip_enc: meta.ip ? encryptString(meta.ip, userId) : null,
        user_agent: meta.userAgent,
        session_id: meta.sessionId,
        device_id: meta.deviceId,
        screenshot_sha256: shotSha,
        screenshot_storage: stored?.storage ?? null,
        screenshot_key: stored?.key ?? null,
        screenshot_bytes: shot?.length ?? null,
        payload_json: payloadJson,
        prev_hash: prev,
        record_hash: hash,
        signature: sig.signature,
        signing_key_id: sig.keyId,
        created_at: createdAt,
      })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') continue; // concurrent append: re-read head and retry
      return { ok: false, error: error.message };
    }
    const id = (ins as { id: string }).id;
    const reference = `NW-${createdAt.slice(0, 10).replace(/-/g, '')}-${hash.slice(0, 8).toUpperCase()}`;
    await attest(admin, id, hash);
    if (opts.sendReceipt !== false) await sendReceipt(admin, userId, id, sub.action, createdAt, reference, gender);
    void maybeAnchorChainHead(admin).catch(() => undefined);
    return { ok: true, id, recordHash: hash, reference, createdAt };
  }
  return { ok: false, error: 'chain_contention' };
}

async function attest(admin: SupabaseClient, recordId: string, hash: string) {
  const [tsa, ots] = await Promise.all([requestTimestamp(hash), otsStamp(hash)]);
  const rows: Array<Record<string, unknown>> = [];
  if (tsa.ok) rows.push({ record_id: recordId, kind: 'tsa', digest: hash, payload: { url: tsa.url, token_b64: tsa.tokenB64, nonce: tsa.nonceHex, gen_time: tsa.genTime } });
  else rows.push({ record_id: recordId, kind: 'tsa', digest: hash, payload: { failed: true, error: tsa.error.slice(0, 300) } });
  if (ots.length) rows.push({ record_id: recordId, kind: 'ots', digest: hash, payload: { proofs: ots } });
  await admin.from('consent_evidence_attestations').insert(rows);
}

async function sendReceipt(
  admin: SupabaseClient,
  userId: string,
  recordId: string,
  action: ConsentAction,
  createdAt: string,
  reference: string,
  gender: ReturnType<typeof normalizeGender>
) {
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    const to = data.user?.email;
    if (!to) return;
    const when = new Intl.DateTimeFormat('he-IL', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jerusalem' }).format(new Date(createdAt));
    const what = action === 'grant' ? 'הסכמה לשמירת מידע בריאותי' : 'ביטול ההסכמה לשמירת מידע בריאותי (והמידע נמחק)';
    const hello = gender === 'female' ? 'היי, רצינו שיהיה לך עותק' : gender === 'male' ? 'היי, רצינו שיהיה לך עותק' : 'היי, רצינו שיהיה עותק';
    const html = `<div dir="rtl" style="font-family:Assistant,Arial,sans-serif;font-size:15px;line-height:1.7;color:#1f2a24">
<p>${hello} של מה שאושר עכשיו ב־NuraWell:</p>
<table style="border-collapse:collapse"><tr><td style="padding:4px 0 4px 16px;color:#5b6b61">מה אושר</td><td><b>${what}</b></td></tr>
<tr><td style="padding:4px 0 4px 16px;color:#5b6b61">מתי</td><td>${when} (שעון ישראל)</td></tr>
<tr><td style="padding:4px 0 4px 16px;color:#5b6b61">מספר אסמכתא</td><td dir="ltr" style="text-align:right">${reference}</td></tr></table>
<p style="color:#5b6b61">אפשר לשנות את זה בכל רגע בהגדרות הפרטיות או בבקשה מאלמוג. אם לא את/ה אישרת, פשוט השיבו למייל הזה.</p></div>`.replace('אם לא את/ה אישרת', 'אם זה לא היה אישור שלך');
    const { sendResendEmail } = await import('@/lib/email/resend');
    const r = await sendResendEmail({ to, subject: `אישור: ${what} · ${reference}`, html, sender: 'default', purpose: 'consent_receipt' });
    await admin.from('consent_evidence_attestations').insert({
      record_id: recordId,
      kind: 'email_receipt',
      digest: sha256Hex(html),
      payload: { ok: r.ok, provider_id: r.ok ? r.id ?? null : null, to_hash: sha256Hex(to.toLowerCase()), reference, sent_at: new Date().toISOString() },
    });
  } catch {
    /* receipt is best-effort; record stands on its own */
  }
}

/** Global chain head = SHA-256 over every record hash in order. Anchored at most once per ~24h. */
export async function computeChainHead(admin: SupabaseClient): Promise<{ head: string; count: number }> {
  const hashes: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from('consent_evidence').select('record_hash').order('created_at').order('id').range(from, from + 999);
    const rows = (data ?? []) as Array<{ record_hash: string }>;
    hashes.push(...rows.map((r) => r.record_hash));
    if (rows.length < 1000) break;
  }
  return { head: sha256Hex(hashes.join('\n')), count: hashes.length };
}

export async function maybeAnchorChainHead(admin: SupabaseClient, force = false): Promise<{ anchored: boolean; head?: string }> {
  if (!force) {
    const { data } = await admin.from('consent_evidence_attestations').select('created_at').eq('kind', 'chain_anchor').order('created_at', { ascending: false }).limit(1).maybeSingle();
    const last = (data as { created_at?: string } | null)?.created_at;
    if (last && Date.now() - new Date(last).getTime() < 23 * 3600_000) return { anchored: false };
  }
  const { head, count } = await computeChainHead(admin);
  if (!count) return { anchored: false };
  const [tsa, ots] = await Promise.all([requestTimestamp(head), otsStamp(head)]);
  await admin.from('consent_evidence_attestations').insert({
    record_id: null,
    kind: 'chain_anchor',
    digest: head,
    payload: { count, nonce: randomBytes(4).toString('hex'), tsa: tsa.ok ? { url: tsa.url, token_b64: tsa.tokenB64, nonce: tsa.nonceHex, gen_time: tsa.genTime } : { failed: true }, ots },
  });
  return { anchored: true, head };
}
