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
  // Platform / infrastructure vendors (cost ledger only — no media generators).
  openrouter: { label: 'OpenRouter (AI)', generators: [] },
  deepseek: { label: 'DeepSeek (AI)', generators: [] },
  anthropic: { label: 'Anthropic (AI)', generators: [] },
  vercel: { label: 'Vercel', generators: [] },
  supabase: { label: 'Supabase', generators: [] },
  google_cloud: { label: 'Google Cloud', generators: [] },
  upstash: { label: 'Upstash', generators: [] },
  cloudflare: { label: 'Cloudflare', generators: [] },
  resend: { label: 'Resend (אימייל)', generators: [] },
  bunny: { label: 'Bunny (וידאו)', generators: [] },
  domain: { label: 'דומיינים', generators: [] },
  unknown: { label: 'לא זוהה', generators: [] },
} as const satisfies Record<string, { label: string; generators: GeneratorId[] }>;
export type VendorId = keyof typeof VENDORS;

/** Body keyword wins over sender (App Store / Stripe / Google Play bill for many vendors). */
export function detectVendor(from: string, subject: string, text: string): VendorId {
  const hay = `${subject}\n${text}`.slice(0, 20000);
  const infra = detectInfraVendor(from, hay);
  if (infra) return infra;
  if (/\bsuno\b/i.test(hay) || /@(?:[\w-]+\.)?suno\.(?:com|ai)\b/i.test(from)) return 'suno';
  if (/super\s*grok|\bgrok\b|x\.ai\b|\bxai\b/i.test(hay) || /@(?:[\w-]+\.)?x\.ai\b/i.test(from)) return 'xai';
  if (/x\s*premium|premium\+|twitter blue/i.test(hay) || /@(?:[\w-]+\.)?(?:x|twitter)\.com\b/i.test(from)) return 'x_premium';
  if (/elevenlabs/i.test(hay) || /@(?:[\w-]+\.)?elevenlabs\.io\b/i.test(from)) return 'elevenlabs';
  if (/chatgpt|openai/i.test(hay) || /@(?:[\w-]+\.)?openai\.com\b/i.test(from)) return 'openai';
  if (/google\s*one|gemini|ai\s*premium|google ai (?:pro|ultra)/i.test(hay) || /@google\.com\b/i.test(from)) return 'google';
  if (/@(?:[\w-]+\.)?apple\.com\b/i.test(from)) return 'apple';
  return 'unknown';
}

/** Platform vendors are identified by their own sending domain (or Google Cloud's billing wording). */
export function detectInfraVendor(from: string, hay: string): VendorId | null {
  const f = from.toLowerCase();
  const dom = (d: string) => new RegExp(`@(?:[\\w-]+\\.)*${d.replace(/\./g, '\\.')}$`).test(f);
  if (dom('openrouter.ai')) return 'openrouter';
  if (dom('deepseek.com')) return 'deepseek';
  if (dom('anthropic.com')) return 'anthropic';
  if (dom('vercel.com')) return 'vercel';
  if (dom('supabase.com') || dom('supabase.io')) return 'supabase';
  if (dom('upstash.com')) return 'upstash';
  if (dom('cloudflare.com')) return /registrar|domain|דומיין/i.test(hay) ? 'domain' : 'cloudflare';
  if (dom('resend.com') || dom('resend.dev')) return 'resend';
  if (dom('bunny.net')) return 'bunny';
  if (dom('namecheap.com') || dom('porkbun.com') || dom('godaddy.com') || dom('gandi.net')) return 'domain';
  if (/@google\.com$/.test(f) && /google cloud|cloud platform|cloud billing|\bGCP\b|billing account \w{6}-\w{6}-\w{6}/i.test(hay)) return 'google_cloud';
  return null;
}

/** Vendor's own invoice/receipt number → stable dedupe key (a re-forwarded copy has a different .eml hash). */
export function parseInvoiceRef(vendor: string, subject: string, text: string): string | null {
  const hay = `${subject}\n${text.slice(0, 20000)}`;
  const pats = [/receipt\s*\[#([\w-]{4,40})\]/i, /\b(IN-\d{5,12})\b/, /invoice\s*(?:number|no\.?|#)\s*[:#]?\s*([A-Z0-9][\w-]{4,40})/i, /receipt\s*(?:number|no\.?|#)\s*[:#]?\s*([A-Z0-9][\w-]{4,40})/i, /סימוכין\s+([A-Z][\w -]{3,30}?)(?=\s+ב-|\)|$)/m, /מספר הזמנה:\s*([A-Z]{2,4}\.[\d.-]{8,40})/];
  for (const re of pats) { const m = re.exec(hay); if (m) return `${vendor}:${m[1]!.trim().replace(/\s+/g, '-').toUpperCase()}`; }
  return null;
}

/** VAT line if the receipt states one (מע"מ / VAT / Tax). */
export function parseVat(input: string): number | null {
  const t = normalizeReceiptText(input);
  const m = /(?:מע"מ|VAT|Tax)\b[^\n\d]{0,30}?(?:₪|\$|€|£|USD|ILS|EUR)?\s?(\d{1,5}(?:[.,]\d{2})?)/i.exec(t);
  if (!m) return null;
  const n = Number(m[1]!.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const CUR: Array<[RegExp, string]> = [[/₪|ILS|ש"ח|שח\b/, 'ILS'], [/\$|USD/, 'USD'], [/€|EUR/, 'EUR'], [/£|GBP/, 'GBP']];
const SYM = '₪|\\$|€|£|USD|ILS|EUR|GBP|ש"ח';
const AMOUNT_RE = new RegExp(`(?:(${SYM})\\s?)(\\d{1,5}(?:[.,]\\d{2})?)(?!\\d)|(?<![\\d.,])(\\d{1,5}(?:[.,]\\d{2})?)\\s?(${SYM})`);
/** Future/quoted prices (trial notices, price changes) are not what was charged. */
const NOT_CHARGED = /התשלום הבא|יבוצע רק|החיוב הראשון|לאחר מכן|החל מ-?|next payment|will be charged|starting|after the trial|renews at/i;

/** Normalizes receipt text: drops bidi marks (Google Play wraps every price in U+200F), NBSPs, HTML entities. */
export function normalizeReceiptText(text: string): string {
  return text
    .replace(/<(?:br|\/p|\/div|\/tr|\/td)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/[\u00a0\u202f\u2009]/g, ' ')
    .replace(/״/g, '"')
    .replace(/[ \t]+/g, ' ');
}

export function parseAmount(input: string): { amount: number | null; currency: string | null } {
  const raw = normalizeReceiptText(input).split(/\n/).map((l) => l.trim()).filter(Boolean);
  // Re-join a number wrapped onto the next line before its currency ("74.90\n₪/חודש").
  const lines: string[] = [];
  for (const l of raw) { if (lines.length && /^(₪|\$|€|£|USD|ILS|EUR|GBP|ש"ח)/.test(l) && /\d$/.test(lines[lines.length - 1]!)) lines[lines.length - 1] += ` ${l}`; else lines.push(l); }
  const pref = lines.filter((l) => /total|amount paid|סה"כ|סך הכל|לתשלום|שולם|charged|refund|החזר כספי בסכום|היום:/i.test(l));
  const rest = lines.filter((l) => !pref.includes(l) && !NOT_CHARGED.test(l));
  for (const l of [...pref, ...rest]) {
    const m = AMOUNT_RE.exec(l);
    if (m) {
      const num = Number((m[2] ?? m[3])!.replace(',', '.'));
      const sym = m[1] ?? m[4] ?? '';
      return { amount: Number.isFinite(num) ? num : null, currency: CUR.find(([re]) => re.test(sym))?.[1] ?? null };
    }
  }
  return { amount: null, currency: null };
}

/** Bundle-import files: a Gmail connector .json (plaintextBody/htmlBody), an .html body, or plain text. */
export function receiptTextFromFile(name: string, bytes: Uint8Array): string | null {
  const ext = name.split('.').pop()?.toLowerCase();
  const s = Buffer.from(bytes).toString('utf8');
  if (ext === 'json') { try { const j = JSON.parse(s) as { plaintextBody?: string; htmlBody?: string; snippet?: string }; return j.plaintextBody || j.htmlBody || j.snippet || null; } catch { return null; } }
  if (ext === 'html' || ext === 'htm' || ext === 'txt') return s;
  return null;
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
/** Decode quoted-printable soft breaks/escapes (UTF-8) so a raw message can be scanned as a fallback. */
export function decodeQuotedPrintable(s: string): string {
  const t = s.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '=' && /^[0-9A-F]{2}$/i.test(t.slice(i + 1, i + 3))) { bytes.push(parseInt(t.slice(i + 1, i + 3), 16)); i += 2; }
    else { const c = t.charCodeAt(i); if (c < 128) bytes.push(c); else bytes.push(...Buffer.from(t[i], 'utf8')); }
  }
  return Buffer.from(bytes).toString('utf8');
}
const CODE_RES = [
  /\(#\s*(\d{6,12})\)/,
  /(?:confirmation code|verification code)\s*[:：]?\s*(\d{6,12})/i,
  /קוד(?:\s+ה?אישור|\s+ה?אימות)[^\d]{0,20}(\d{6,12})/,
];
export function gmailConfirmationCode(text: string, subject = ''): string | null {
  for (const src of [subject, text]) for (const re of CODE_RES) { const m = re.exec(src); if (m) return m[1]; }
  return /(?<![\d#])(\d{9})(?!\d)/.exec(text)?.[1] ?? null;
}
/** The one-click verification link Gmail puts in the mail (mail.google.com / mail-settings.google.com / isolated.mail.google.com). */
export function gmailConfirmationLink(...sources: string[]): string | null {
  for (const raw of sources) {
    const s = (raw ?? '').replace(/&amp;/g, '&');
    const m = /https:\/\/(?:[\w-]+\.)*mail(?:-settings)?\.google\.com\/mail\/[^\s"'<>)\]]+/i.exec(s);
    if (m) return m[0].replace(/[.,;]+$/, '');
  }
  return null;
}
/** Best-effort extraction from parsed text/html/subject, falling back to the raw (QP-decoded) message. */
export function extractGmailConfirmation(p: { subject?: string; text?: string; html?: string; raw?: string }): { code: string | null; link: string | null } {
  const rawDec = p.raw ? decodeQuotedPrintable(p.raw) : '';
  const rawSubj = /^subject:\s*(.*(?:\r?\n[ \t].*)*)/im.exec(p.raw ?? '')?.[1] ?? '';
  const htmlText = (p.html ?? '').replace(/<[^>]+>/g, ' ');
  const code = gmailConfirmationCode(p.text ?? '', p.subject ?? '') ?? gmailConfirmationCode(htmlText, rawSubj) ?? gmailConfirmationCode(rawDec);
  return { code, link: gmailConfirmationLink(p.text ?? '', p.html ?? '', rawDec) };
}

export type ReceiptPeriod = { id: string; vendor: VendorId; plan: string | null; period_start: string | null; period_end: string | null; trust: string };
/** Which paid period (if any) covers an AI asset created on `createdOn` with `generator`. */
export function coverageFor(generator: GeneratorId | null | undefined, createdOn: string | null | undefined, receipts: ReceiptPeriod[]): ReceiptPeriod | null {
  if (!generator || !createdOn) return null;
  return receipts.find((r) => r.trust !== 'rejected' && r.period_start && r.period_end && (VENDORS[r.vendor].generators as readonly string[]).includes(generator) && createdOn >= r.period_start && createdOn <= r.period_end) ?? null;
}
