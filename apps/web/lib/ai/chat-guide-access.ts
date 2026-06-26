import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiUserContext } from '@/lib/ai/memory';
import {
  detectGuideAccessSignal,
  findGuideForSignal,
  grantGuideAccess,
  type GuideAccessSignal,
} from '@/lib/guides/grant-access';
import { TRIAL_DAYS_BY_SIGNAL } from '@/lib/guides/access';
import { fetchUserGuideSummaries } from '@/lib/guides/fetch-user-guides';
import { detectGuideSeasonTag, isGuideSeasonallyActive } from '@/lib/guides/seasonal';

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
  if (overloadReason) {
    return { granted: false, refused: true, refuseReason: overloadReason };
  }

  const companionPick = ctx.guide_companion?.available_picks?.[0];
  let detected = detectGuideAccessSignal(userMessage);

  if (!detected && companionPick) {
    detected = {
      signal: 'default',
      reason: companionPick.reason || 'המלצת אלמוג יומית',
    };
  }

  if (!detected) return { granted: false };

  let guide = await findGuideForSignal(supabase, detected.signal);

  if (companionPick?.courseId) {
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
