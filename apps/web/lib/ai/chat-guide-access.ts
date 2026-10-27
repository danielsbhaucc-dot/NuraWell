import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiUserContext } from '@/lib/ai/memory';
import {
  detectGuideAccessSignal,
  findGuideForSignal,
  grantGuideAccess,
  type GuideAccessSignal,
} from '@/lib/module-api/journey/lib-guides-grant-access';
import { TRIAL_DAYS_BY_SIGNAL } from '@/lib/module-api/journey/lib-guides-access';
import { fetchUserGuideSummaries } from '@/lib/module-api/journey/lib-guides-fetch-user-guides';
import { detectGuideSeasonTag, isGuideSeasonallyActive } from '@/lib/module-api/journey/lib-guides-seasonal';
import { decideGuideOpen, isExplicitGuideRequest, readGuideRules } from '@/lib/module-api/journey/lib-guides-guide-rules';
import { isStorableMemoryText } from '@/lib/ai/safety/memory-text-guard';

/** Best title/description word overlap with the user's message (explicit "open the guide about X"). */
async function findGuideByMessage(
  supabase: SupabaseClient,
  message: string
): Promise<{ id: string; title: string } | null> {
  const { data } = await supabase.from('courses').select('id, title, description').eq('is_published', true);
  const words = message.replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter((w) => w.length >= 3 && !['מדריך', 'המדריך', 'תפתח', 'אפשר', 'רוצה'].includes(w));
  let best: { id: string; title: string; score: number } | null = null;
  for (const c of (data ?? []) as Array<{ id: string; title: string; description: string | null }>) {
    const hay = `${c.title} ${c.description ?? ''}`;
    const score = words.filter((w) => hay.includes(w) || hay.includes(w.replace(/^ה/, ''))).length;
    if (score > 0 && (!best || score > best.score)) best = { id: c.id, title: c.title, score };
  }
  return best ? { id: best.id, title: best.title } : null;
}

export interface GuideAccessIntentResult {
  granted: boolean;
  guideTitle?: string;
  message?: string;
  signal?: GuideAccessSignal;
  refused?: boolean;
  refuseReason?: string;
}

function todayJerusalem(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

function isUserOverloaded(ctx: AiUserContext, activeGuideCount: number): string | null {
  const today = todayJerusalem();
  if (ctx.fatigue_signal === true) {
    return 'נראה שיש לך עומס כרגע — בוא נתמקד במה שכבר פתוח ולא נוסיף מדריך חדש';
  }
  if (ctx.daily_availability?.date === today && ctx.daily_availability?.level === 'low') {
    return 'היום מוגדר כיום עמוס — נחזור למדריך חדש כשיהיה לך יותר אוויר';
  }
  if (activeGuideCount >= 4) {
    return 'יש לך כבר כמה מדריכים פעילים — בוא נסיים קודם אחד מהם לפני שנפתח חדש';
  }
  return null;
}

/**
 * מזהה מצוקה רלוונטית ופותח גישת ניסיון למדריך מתאים.
 * נקרא post-processing אחרי תשובת אלמוג — רק אלמוג פותח מדריכים.
 */
export async function applyGuideAccessFromSignals(
  supabase: SupabaseClient,
  userId: string,
  userMessage: string,
  aiContext?: AiUserContext | null
): Promise<GuideAccessIntentResult> {
  const ctx = aiContext ?? {};
  const activeGuides = await fetchUserGuideSummaries(supabase, userId);
  const overloadReason = isUserOverloaded(ctx, activeGuides.length);
  const explicitAsk = isExplicitGuideRequest(userMessage);
  if (overloadReason && !explicitAsk) {
    return { granted: false, refused: true, refuseReason: overloadReason };
  }

  const rules = await readGuideRules(supabase);
  const companionPick = ctx.guide_companion?.available_picks?.[0];
  let detected = detectGuideAccessSignal(userMessage);

  const { data: lastGrant } = await supabase
    .from('guide_access_grants')
    .select('created_at')
    .eq('user_id', userId)
    .eq('granted_by', 'ai')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const decision = decideGuideOpen({
    rules,
    message: userMessage,
    signal: detected && detected.signal !== 'default' ? detected.signal : null,
    hasCompanionPick: Boolean(companionPick),
    activeGuideCount: activeGuides.length,
    lastAiGrantAt: (lastGrant as { created_at?: string } | null)?.created_at ?? null,
  });
  if (!decision.open) return { granted: false };

  if (decision.via === 'explicit') {
    detected = { signal: detected?.signal ?? 'default', reason: 'המשתמש ביקש מדריך' };
  } else if (decision.via === 'companion' || !detected) {
    const reason = companionPick?.reason && isStorableMemoryText(companionPick.reason) ? companionPick.reason : 'המלצת אלמוג';
    detected = { signal: 'default', reason };
  }

  let guide =
    decision.via === 'explicit'
      ? (await findGuideByMessage(supabase, userMessage)) ?? (await findGuideForSignal(supabase, detected.signal))
      : await findGuideForSignal(supabase, detected.signal);

  if (decision.via === 'companion' && companionPick?.courseId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: preferred } = await supabase
      .from('courses')
      .select('id, title, description')
      .eq('id', companionPick.courseId)
      .eq('is_published', true)
      .maybeSingle();
    if (preferred) {
      guide = { id: preferred.id, title: preferred.title };
    }
  }

  if (!guide) return { granted: false };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: courseRow } = await supabase
    .from('courses')
    .select('id, title, description')
    .eq('id', guide.id)
    .maybeSingle();

  const tag = detectGuideSeasonTag(
    courseRow?.title ?? guide.title,
    courseRow?.description ?? null
  );
  if (!isGuideSeasonallyActive(tag)) {
    return {
      granted: false,
      refused: true,
      refuseReason: 'המדריך הזה כבר לא רלוונטי לעונה הנוכחית',
    };
  }

  const trialDays = TRIAL_DAYS_BY_SIGNAL[detected.signal] ?? TRIAL_DAYS_BY_SIGNAL.default;

  const result = await grantGuideAccess({
    supabase,
    userId,
    courseId: guide.id,
    accessType: 'trial',
    grantedBy: 'ai',
    grantedReason: detected.reason,
    signalText: userMessage.slice(0, 500),
    trialDays,
  });

  if (!result.granted) {
    return {
      granted: false,
      guideTitle: guide.title,
      message: result.alreadyHadAccess ? undefined : result.message,
    };
  }

  return {
    granted: true,
    guideTitle: guide.title,
    message: result.message,
    signal: detected.signal,
  };
}
