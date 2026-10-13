import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * When may Almog open a guide? Admin-configurable (site_settings.guide_rules, /ops/guides).
 *
 * Prod audit 13.10.2026: the same guide was "granted" 10× in one day to one user, triggered by
 * "המשימה של המים ממש קשה לי, תוריד לי רמה" (stress keyword "קשה לי"), every grant extended the
 * trial, and the daily companion pick opened a guide on *any* chat message. Defaults below fix that:
 * open on explicit request; topic signals only for Shabbat/holidays; stress + companion auto-open off.
 */
export const GuideRules = z.object({
  enabled: z.boolean().default(true),
  open_on_explicit_request: z.boolean().default(true),
  signals: z
    .object({ shabbat: z.boolean().default(true), holidays: z.boolean().default(true), stress: z.boolean().default(false) })
    .default({ shabbat: true, holidays: true, stress: false }),
  companion_auto_open: z.boolean().default(false),
  max_active_guides: z.number().int().min(1).max(20).default(4),
  cooldown_hours: z.number().int().min(0).max(24 * 30).default(72),
  blocked_phrases: z.array(z.string().min(2).max(60)).max(50).default(['תוריד', 'רמה', 'משימה', 'תזכורת']),
});
export type GuideRules = z.infer<typeof GuideRules>;

export const DEFAULT_GUIDE_RULES: GuideRules = GuideRules.parse({});

export function parseGuideRules(raw: unknown): GuideRules {
  const r = GuideRules.safeParse(raw ?? {});
  return r.success ? r.data : DEFAULT_GUIDE_RULES;
}

export async function readGuideRules(admin: SupabaseClient): Promise<GuideRules> {
  const { data, error } = await admin.from('site_settings').select('guide_rules').eq('id', 1).maybeSingle();
  if (error) return DEFAULT_GUIDE_RULES; // column missing before migration → defaults
  return parseGuideRules((data as { guide_rules?: unknown } | null)?.guide_rules);
}

export async function writeGuideRules(admin: SupabaseClient, rules: GuideRules): Promise<{ ok: boolean; error?: string }> {
  const { error } = await admin
    .from('site_settings')
    .update({ guide_rules: rules, updated_at: new Date().toISOString() })
    .eq('id', 1);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** "תפתח לי את המדריך על שינה", "אפשר מדריך לשבת?", "יש מדריך על אכילה רגשית?" */
const EXPLICIT_RE =
  /(?:(?:תפתח|פתח|תפתחי|פתחי|תן|תני|תביא|תביאי|אפשר|רוצה|יש)\s+(?:לי\s+)?(?:את\s+)?(?:ה)?מדריך)|(?:מדריך\s+(?:על|ל|בנושא))/;

export function isExplicitGuideRequest(message: string): boolean {
  return EXPLICIT_RE.test(message.replace(/\s+/g, ' '));
}

export type GuideOpenDecision =
  | { open: true; via: 'explicit' | 'signal' | 'companion' }
  | { open: false; reason: string };

/** Pure decision (tested). */
export function decideGuideOpen(params: {
  rules: GuideRules;
  message: string;
  signal: 'shabbat' | 'holidays' | 'stress' | null;
  hasCompanionPick: boolean;
  activeGuideCount: number;
  lastAiGrantAt: string | null;
  now?: Date;
}): GuideOpenDecision {
  const { rules, message } = params;
  if (!rules.enabled) return { open: false, reason: 'disabled' };
  const explicit = rules.open_on_explicit_request && isExplicitGuideRequest(message);
  if (!explicit && rules.blocked_phrases.some((p) => message.includes(p))) return { open: false, reason: 'blocked_phrase' };
  if (params.activeGuideCount >= rules.max_active_guides) return { open: false, reason: 'max_active' };
  if (!explicit && params.lastAiGrantAt) {
    const hours = ((params.now ?? new Date()).getTime() - Date.parse(params.lastAiGrantAt)) / 3_600_000;
    if (hours < rules.cooldown_hours) return { open: false, reason: 'cooldown' };
  }
  if (explicit) return { open: true, via: 'explicit' };
  if (params.signal && rules.signals[params.signal]) return { open: true, via: 'signal' };
  if (params.hasCompanionPick && rules.companion_auto_open) return { open: true, via: 'companion' };
  return { open: false, reason: 'no_trigger' };
}

/** One line for Almog's context so his words match what the system will actually do. */
export function formatGuideRulesForAi(rules: GuideRules): string {
  if (!rules.enabled) return 'מדריכים: אלמוג לא פותח מדריכים כרגע — אל תבטיח לפתוח מדריך.';
  return rules.open_on_explicit_request
    ? 'מדריכים: אם המשתמש מבקש במפורש מדריך — הוא נפתח לו אוטומטית אחרי התשובה (אם יש מדריך מתאים); אפשר לומר "פתחתי לך גישה, תמצא אותו בעמוד המדריכים". אל תציע מדריך בכל הודעה — רק כשזה באמת עוזר.'
    : 'מדריכים: פתיחת מדריך לפי בקשה כבויה כרגע — אל תבטיח לפתוח מדריך.';
}
