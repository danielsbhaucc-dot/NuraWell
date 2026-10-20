/**
 * Receipts — pure rules (no network, no AI): vendor detection, amount/date/plan parsing,
 * coverage periods, forwarder allowlist, and matching AI assets to paid-plan periods.
 * Rules instead of a model: receipts carry names/addresses, so no text leaves the server.
 */
import type { GeneratorId } from './labels';

export const VENDORS = {
  suno: { label: 'Suno', generators: ['suno'] },
  xai: { label: 'xAI · Grok', generators: ['grok'] },
  x_premium: { label: 'X Premium (Grok)', generators: ['grok'] },
  google: { label: 'Google One / Gemini', generators: ['nano_banana', 'gemini_music'] },
  openai: { label: 'OpenAI · ChatGPT', generators: ['gpt_image'] },
  elevenlabs: { label: 'ElevenLabs', generators: ['elevenlabs'] },
  apple: { label: 'Apple (App Store)', generators: [] },
  unknown: { label: 'לא זוהה', generators: [] },
} as const satisfies Record<string, { label: string; generators: GeneratorId[] }>;
export type VendorId = keyof typeof VENDORS;

/** Body keyword wins over sender (App Store / Stripe / Google Play bill for many vendors). */
export function detectVendor(from: string, subject: string, text: string): VendorId {
  const hay = `${subject}\n${text}`.slice(0, 20000);
  if (/\bsuno\b/i.test(hay) || /@(?:[\w-]+\.)?suno\.(?:com|ai)\b/i.test(from)) return 'suno';
  if (/super\s*grok|\bgrok\b|x\.ai\b|\bxai\b/i.test(hay) || /@(?:[\w-]+\.)?x\.ai\b/i.test(from)) return 'xai';
  if (/x\s*premium|premium\+|twitter blue/i.test(hay) || /@(?:[\w-]+\.)?(?:x|twitter)\.com\b/i.test(from)) return 'x_premium';
  if (/elevenlabs/i.test(hay) || /@(?:[\w-]+\.)?elevenlabs\.io\b/i.test(from)) return 'elevenlabs';
  if (/chatgpt|openai/i.test(hay) || /@(?:[\w-]+\.)?openai\.com\b/i.test(from)) return 'openai';
  if (/google\s*one|gemini|ai\s*premium|google ai (?:pro|ultra)/i.test(hay) || /@google\.com\b/i.test(from)) return 'google';
  if (/@(?:[\w-]+\.)?apple\.com\b/i.test(from)) return 'apple';
  return 'unknown';
}

const CUR: Array<[RegExp, string]> = [[/₪|ILS|ש"ח|שח\b/, 'ILS'], [/\$|USD/, 'USD'], [/€|EUR/, 'EUR'], [/£|GBP/, 'GBP']];
export function parseAmount(text: string): { amount: number | null; currency: string | null } {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const pref = lines.filter((l) => /total|amount paid|סה"כ|סך הכל|לתשלום|שולם|charged|amount/i.test(l));
  for (const l of [...pref, ...lines]) {
    const m = /(?:(₪|\$|€|£|USD|ILS|EUR|GBP)\s?)(\d{1,5}(?:[.,]\d{2})?)|(\d{1,5}(?:[.,]\d{2})?)\s?(₪|\$|€|£|USD|ILS|EUR|GBP|ש"ח)/.exec(l);
    if (m) {
      const num = Number((m[2] ?? m[3])!.replace(',', '.'));
      const sym = m[1] ?? m[4] ?? '';
      return { amount: Number.isFinite(num) ? num : null, currency: CUR.find(([re]) => re.test(sym))?.[1] ?? null };
    }
  }
  return { amount: null, currency: null };
}

export function parsePlan(vendor: VendorId, text: string): string | null {
  const t = text.slice(0, 20000);
  const pats: RegExp[] = [/super\s*grok(?:\s*heavy)?/i, /x\s*premium\+?/i, /premium\+/i, /(?:suno\s*)?(?:pro|premier)\s*plan/i, /\b(?:pro|premier)\b(?= (?:plan|subscription|monthly|annual))/i,
    /google\s*ai\s*(?:pro|ultra|premium)/i, /google\s*one\s*ai\s*premium/i, /chatgpt\s*(?:plus|pro|team)/i, /\b(?:creator|starter|independent publisher)\b(?= plan)/i];
  for (const re of pats) { const m = re.exec(t); if (m) return m[0].replace(/\s+/g, ' ').trim(); }
  return vendor === 'unknown' ? null : null;
}

export function isAnnual(text: string) { return /annual|yearly|per year|\/yr|שנתי|לשנה/i.test(text); }

export function addMonths(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + n);
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

/** Explicit "period: X – Y" if present, else receipt date + 1 month (or 1 year). */
export function parsePeriod(text: string, receiptDate: string | null): { start: string | null; end: string | null } {
  const m = /(\w{3,9} \d{1,2}, \d{4})\s*[–—-]\s*(\w{3,9} \d{1,2}, \d{4})/.exec(text);
  if (m) {
    const a = new Date(`${m[1]} UTC`); const b = new Date(`${m[2]} UTC`);
    if (!isNaN(+a) && !isNaN(+b)) return { start: a.toISOString().slice(0, 10), end: b.toISOString().slice(0, 10) };
  }
  if (!receiptDate) return { start: null, end: null };
  return { start: receiptDate, end: addMonths(receiptDate, isAnnual(text) ? 12 : 1) };
}

/** Gmail auto-forward envelope: `name+caf_=receipts=nurawell.ai@gmail.com` → base address. */
export function normalizeForwarder(addr: string): string {
  const a = addr.trim().toLowerCase();
  const m = /^([^+@]+)(?:\+[^@]*)?@(.+)$/.exec(a);
  if (!m) return a;
  const local = m[2] === 'gmail.com' || m[2] === 'googlemail.com' ? m[1]!.replace(/\./g, '') : m[1]!;
  return `${local}@${m[2] === 'googlemail.com' ? 'gmail.com' : m[2]}`;
}

export function forwarderAllowed(envelopeFrom: string, headers: Record<string, string>, allowed: string[]): boolean {
  const set = new Set(allowed.map(normalizeForwarder).filter(Boolean));
  if (!set.size) return false;
  const cands = [envelopeFrom, headers['x-forwarded-for'] ?? '', headers['x-forwarded-to'] ?? '', headers['from'] ?? '']
    .flatMap((h) => h.match(/[\w.+-]+@[\w.-]+\.\w+/g) ?? []);
  return normalizeForwarder(envelopeFrom) !== '' && set.has(normalizeForwarder(envelopeFrom)) || cands.slice(1, 3).some((c) => set.has(normalizeForwarder(c)));
}

export function isGmailForwardingConfirmation(from: string, subject: string) {
  return /forwarding-noreply@google\.com/i.test(from) && /(forwarding|העברה)/i.test(subject);
}
export function gmailConfirmationCode(text: string): string | null {
  return /(?:confirmation code|קוד האישור)[^\d]{0,20}(\d{6,12})/i.exec(text)?.[1] ?? /\b(\d{9})\b/.exec(text)?.[1] ?? null;
}

export type ReceiptPeriod = { id: string; vendor: VendorId; plan: string | null; period_start: string | null; period_end: string | null; trust: string };
/** Which paid period (if any) covers an AI asset created on `createdOn` with `generator`. */
export function coverageFor(generator: GeneratorId | null | undefined, createdOn: string | null | undefined, receipts: ReceiptPeriod[]): ReceiptPeriod | null {
  if (!generator || !createdOn) return null;
  return receipts.find((r) => r.trust !== 'rejected' && r.period_start && r.period_end && (VENDORS[r.vendor].generators as readonly string[]).includes(generator) && createdOn >= r.period_start && createdOn <= r.period_end) ?? null;
}
