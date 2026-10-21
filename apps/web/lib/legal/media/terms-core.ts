/**
 * Provider terms library + per-asset rights dossier — pure logic (no DB, no network).
 * Terms pages are archived under asset_key `terms:<provider>` as signed 'license_snapshot' records,
 * a new record only when the page bytes change, so the version in force on a given day can be picked.
 */
import type { GeneratorId } from './labels';

export type ProviderId = 'google' | 'openai' | 'xai' | 'suno' | 'elevenlabs';

/** Official pages that govern ownership / commercial use of outputs (checked 2026-10-21). */
export const PROVIDER_TERMS: Record<ProviderId, { label: string; urls: string[] }> = {
  google: { label: 'Google (Gemini / AI Pro / AI Plus)', urls: ['https://policies.google.com/terms', 'https://policies.google.com/terms/generative-ai/use-policy'] },
  openai: { label: 'OpenAI (ChatGPT)', urls: ['https://openai.com/policies/terms-of-use/', 'https://openai.com/policies/usage-policies/'] },
  xai: { label: 'xAI (Grok)', urls: ['https://x.ai/legal/terms-of-service', 'https://x.ai/legal/brand-guidelines', 'https://x.ai/legal/acceptable-use-policy'] },
  suno: { label: 'Suno', urls: ['https://suno.com/terms'] },
  elevenlabs: { label: 'ElevenLabs', urls: ['https://elevenlabs.io/terms-of-use'] },
};

export const GENERATOR_PROVIDER: Record<GeneratorId, ProviderId | null> = {
  gpt_image: 'openai', grok: 'xai', nano_banana: 'google', gemini_music: 'google', suno: 'suno', elevenlabs: 'elevenlabs', other: null,
} as Record<GeneratorId, ProviderId | null>;

export const termsAssetKey = (p: ProviderId) => `terms:${p}`;

export type TermsSnapshot = { url: string; fetched_at: string; sha256: string | null; http_status: number };

/** Latest snapshot of `url` fetched on/before `day` (YYYY-MM-DD); else the earliest one after it (flagged as later). */
export function pickTermsVersion(snaps: TermsSnapshot[], url: string, day: string | null | undefined): { snap: TermsSnapshot; exact: boolean } | null {
  const ok = snaps.filter((s) => s.url === url && s.sha256).sort((a, b) => a.fetched_at.localeCompare(b.fetched_at));
  if (!ok.length) return null;
  if (!day) return { snap: ok[ok.length - 1]!, exact: false };
  const end = `${day}T23:59:59.999Z`;
  const before = ok.filter((s) => s.fetched_at <= end);
  return before.length ? { snap: before[before.length - 1]!, exact: true } : { snap: ok[0]!, exact: false };
}

/** Wayback "closest to" timestamp for the creation day. */
export const waybackTimestamp = (day: string | null | undefined) => (day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.replace(/-/g, '') : null);

/** Should a new snapshot be appended? Only when the bytes differ from the last good one. */
export function termsChanged(prev: TermsSnapshot[], url: string, sha: string | null): boolean {
  if (!sha) return false;
  const last = prev.filter((s) => s.url === url && s.sha256).sort((a, b) => a.fetched_at.localeCompare(b.fetched_at)).pop();
  return !last || last.sha256 !== sha;
}

export type Commercial = { allowed: 'yes' | 'no' | 'conditional'; note_he: string };

/** Commercial-use reading of the provider terms for the plan at creation (rules, not legal advice). */
export function commercialAssessment(generator: GeneratorId | null | undefined, plan: string | null | undefined, opts: { vendorStatement?: boolean } = {}): Commercial {
  const p = (plan ?? '').toLowerCase();
  const free = /free|חינם|basic/.test(p);
  switch (generator) {
    case 'suno':
      if (!plan) return { allowed: 'conditional', note_he: 'Suno: מסחרי רק אם השיר נוצר במנוי Pro או Premier והורד בכפתור ההורדה הרשמי. חסר מסלול בזמן היצירה.' };
      if (free && opts.vendorStatement) return { allowed: 'conditional', note_he: 'conditional: commercial after Pro download/purchased download. Suno אישרה בכתב (2026-10-20) שרכישת הורדה בודדת, או הורדה בזמן מנוי Pro או Premier, נותנת זכויות מסחריות קבועות גם אחרי ביטול. התשובות נוצרו על ידי עוזר ה־AI של Suno ועלולות לטעות. עד שתהיה הורדה כזו וקבלה, השיר לשימוש אישי בלבד.' };
      if (free) return { allowed: 'no', note_he: 'Suno: שיר שנוצר בחינם (Free או Basic) מותר לשימוש אישי ולא מסחרי בלבד, גם אם שודרג אחר כך.' };
      if (/pro|premier/.test(p)) return { allowed: 'yes', note_he: 'Suno: Pro או Premier בזמן היצירה, הבעלות עוברת אליך. מסחרי רק לקובץ שהורד בכפתור הרשמי. הזכות קבועה גם אחרי ביטול.' };
      return { allowed: 'conditional', note_he: 'Suno: לא ברור אם המסלול הוא Pro או Premier.' };
    case 'grok':
      return { allowed: 'conditional', note_he: 'xAI: מותר מסחרית, אבל הנחיות המותג מבקשות לציין "Created with Grok" או "Written with Grok" במקום הפרסום, וייתכן שיידרש גם סימון AI.' };
    case 'gpt_image':
      return { allowed: 'yes', note_he: 'OpenAI: התוכן שלך ומותר מסחרית בכל מסלול. אסור להציג אותו כאילו נוצר בידי אדם.' };
    case 'nano_banana': case 'gemini_music':
      return { allowed: 'yes', note_he: 'Google: גוגל לא טוענת לבעלות. מותר מסחרית. אסור להטעות שהתוכן נוצר בידי אדם או להסיר סימונים.' };
    case 'elevenlabs':
      return { allowed: 'conditional', note_he: 'ElevenLabs: לפי תנאי המסלול. לא נבדק מחדש.' };
    default:
      return { allowed: 'conditional', note_he: 'שירות לא מזוהה.' };
  }
}

export type DossierInput = {
  generator?: GeneratorId | null; plan?: string | null; created_on?: string | null; sha256?: string | null;
  receipt_ids?: string[] | null; terms_found?: number; terms_exact?: number;
};

/** A vendor written statement is an attachment whose label starts with 'הצהרת ספק'. */
export const hasVendorStatement = (atts: Array<{ label?: string | null }> | null | undefined) => (atts ?? []).some((a) => (a.label ?? '').startsWith('הצהרת ספק'));

/** The five links an AI asset dossier must have, and which are missing. */
export function dossierGaps(d: DossierInput): string[] {
  const g: string[] = [];
  if (!d.generator) g.push('generator');
  if (!d.plan) g.push('plan');
  if (!d.created_on) g.push('created_on');
  if (!d.sha256) g.push('file_sha256');
  if (!d.receipt_ids?.length && !/free|חינם/i.test(d.plan ?? '')) g.push('receipt');
  if (!d.terms_found) g.push('terms_snapshot');
  else if (!d.terms_exact) g.push('terms_snapshot_from_creation_day');
  return g;
}
