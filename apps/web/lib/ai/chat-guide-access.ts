import type { SupabaseClient } from '@supabase/supabase-js';
import {
  detectGuideAccessSignal,
  findGuideForSignal,
  grantGuideAccess,
  type GuideAccessSignal,
} from '@/lib/guides/grant-access';
import { TRIAL_DAYS_BY_SIGNAL } from '@/lib/guides/access';

export interface GuideAccessIntentResult {
  granted: boolean;
  guideTitle?: string;
  message?: string;
  signal?: GuideAccessSignal;
}

/**
 * מזהה מצוקה רלוונטית ופותח גישת ניסיון למדריך מתאים.
 * נקרא post-processing אחרי תשובת אלמוג.
 */
export async function applyGuideAccessFromSignals(
  supabase: SupabaseClient,
  userId: string,
  userMessage: string
): Promise<GuideAccessIntentResult> {
  const detected = detectGuideAccessSignal(userMessage);
  if (!detected) return { granted: false };

  const guide = await findGuideForSignal(supabase, detected.signal);
  if (!guide) return { granted: false };

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
