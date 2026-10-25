'use server';
import { sealProfilePatch } from '@/lib/crypto/pii-seal';
import { buildSafetyScreening } from '@/lib/onboarding/safety-screening';

import { z } from 'zod';
import { headers } from 'next/headers';
import { consumeRateLimit } from '@/lib/api/rate-limit';
import {
  checkPasswordPolicy,
  PASSWORD_ERRORS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@/lib/auth/password-policy';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { publicAppOriginSync } from '@/lib/public-app-url';
import { generateMentorSystemPrompt, calculateDailyCheckInTimes } from '@/lib/ai/generate-mentor-system-prompt';
import { ingestOnboardingIntoVectorMemory } from '@/lib/ai/ingest-onboarding-vector-memory';
import type { OnboardingProfileForChat } from '@/lib/ai/onboarding-chat-context';
import { buildMealSchedule, type MealScheduleEntry } from '@/lib/onboarding/meal-schedule';
import { BODY_METRICS } from '@/lib/onboarding/body-metrics';
import { validateBirthDate } from '@/lib/privacy/age-validation';
import { recordRegistrationConsents } from '@/lib/privacy/record-consent';
import {
  computeChallengeEndDate,
  computeChallengeStartDate,
} from '@/lib/challenge/start-date';
import {
  GENDERS,
  MAIN_GOALS,
  MAIN_OBSTACLES,
  PREFERRED_CHANNELS,
  WEAKEST_TIMES,
} from '@/lib/onboarding/types';
import { clearChallengeGateCookie } from '@/lib/challenge/gate-cookie';
import { recordRetentionChoice } from '@/lib/privacy/subscription-retention';
import { recordConsentEvidence, validateSubmission } from '@/lib/legal/record-evidence';

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const onboardingSchema = z.object({
  full_name: z.string().trim().min(2, 'שם קצר מדי').max(120),
  gender: z.enum(GENDERS),
  main_goal: z.enum(MAIN_GOALS),
  // weight is optional (habits-first positioning)
  current_weight: z.coerce
    .number()
    .min(BODY_METRICS.weightMin)
    .max(BODY_METRICS.weightMax)
    .optional()
    .nullable(),
  target_weight: z.coerce
    .number()
    .min(BODY_METRICS.weightMin)
    .max(BODY_METRICS.weightMax)
    .optional()
    .nullable(),
  // safety screening (stored with the health-data consent)
  screen_ed_history: z.enum(['true', 'false']).optional(),
  screen_pregnancy: z.enum(['true', 'false']).optional(),
  screen_fluid_restriction: z.enum(['true', 'false']).optional(),
  screen_medical_followup: z.enum(['true', 'false']).optional(),
  height: z.coerce
    .number()
    .min(BODY_METRICS.heightMin)
    .max(BODY_METRICS.heightMax)
    .optional()
    .nullable(),
  weakest_time_of_day: z.enum(WEAKEST_TIMES),
  main_obstacle: z.enum(MAIN_OBSTACLES),
  main_obstacle_detail: z.string().trim().max(500).optional().nullable(),
  wake_up_time: z.string().regex(timeRegex, 'שעת השכמה לא תקינה'),
  sleep_time: z.string().regex(timeRegex, 'שעת שינה לא תקינה'),
  dinner_time: z
    .union([z.string().regex(timeRegex, 'שעת ארוחת ערב לא תקינה'), z.literal('')])
    .optional()
    .nullable(),
  preferred_channel: z.enum(PREFERRED_CHANNELS).default('in_app'),
  email: z.string().email('אימייל לא תקין'),
  password: z.string().min(PASSWORD_MIN_LENGTH, PASSWORD_ERRORS.tooShort).max(PASSWORD_MAX_LENGTH, PASSWORD_ERRORS.tooLong),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך לידה לא תקין'),
  health_data_consent: z.literal('true', {
    error: 'נדרשת הסכמה למידע בריאותי',
  }),
  legal_consent: z.literal('true', {
    error: 'נדרש אישור תנאי שימוש ומדיניות פרטיות',
  }),
  post_sub_retention: z.enum(['delete_now', 'keep_24m'], {
    error: 'יש לבחור מה יקרה למידע כשהמנוי יסתיים',
  }),
});

export type OnboardingActionState =
  | { ok: true; redirectTo: string; needsEmailVerification?: boolean }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function enrollNewUserInChallenge(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<void> {
  await clearChallengeGateCookie();
  const { data: settings } = await admin
    .from('site_settings')
    .select('challenge_enabled')
    .eq('id', 1)
    .maybeSingle();
  if (!settings?.challenge_enabled) return;

  const { data: campaign } = await admin
    .from('challenge_campaigns')
    .select('id, duration_days')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!campaign) return;

  const now = new Date();
  const startDate = computeChallengeStartDate(now);
  const endDate = computeChallengeEndDate(startDate, campaign.duration_days);

  await admin.from('challenge_enrollments').insert({
    user_id: userId,
    campaign_id: campaign.id,
    registered_at: now.toISOString(),
    challenge_start_date: startDate,
    challenge_end_date: endDate,
    status: 'waiting',
    is_demo: false,
  });
}

export async function completeOnboarding(
  _prev: OnboardingActionState | null,
  formData: FormData
): Promise<OnboardingActionState> {
  const raw = {
    full_name: formData.get('full_name'),
    gender: formData.get('gender'),
    main_goal: formData.get('main_goal'),
    current_weight: formData.get('current_weight') || null,
    target_weight: formData.get('target_weight') || null,
    screen_ed_history: formData.get('screen_ed_history') || undefined,
    screen_pregnancy: formData.get('screen_pregnancy') || undefined,
    screen_fluid_restriction: formData.get('screen_fluid_restriction') || undefined,
    screen_medical_followup: formData.get('screen_medical_followup') || undefined,
    height: formData.get('height') || null,
    weakest_time_of_day: formData.get('weakest_time_of_day'),
    main_obstacle: formData.get('main_obstacle'),
    main_obstacle_detail: formData.get('main_obstacle_detail') || null,
    wake_up_time: formData.get('wake_up_time'),
    sleep_time: formData.get('sleep_time'),
    dinner_time: formData.get('dinner_time') || null,
    preferred_channel: formData.get('preferred_channel') || 'in_app',
    email: formData.get('email'),
    password: formData.get('password'),
    date_of_birth: formData.get('date_of_birth'),
    health_data_consent: formData.get('health_data_consent'),
    legal_consent: formData.get('legal_consent'),
    post_sub_retention: formData.get('post_sub_retention'),
  };

  const parsed = onboardingSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const first =
      Object.values(fieldErrors).flat()[0] ||
      parsed.error.issues[0]?.message ||
      'נתונים לא תקינים';
    return { ok: false, error: first, fieldErrors };
  }

  const data = parsed.data;

  const ageCheck = validateBirthDate(data.date_of_birth);
  if (!ageCheck.ok) {
    const msg =
      ageCheck.code === 'too_young'
        ? 'השירות מיועד לגיל 18 ומעלה'
        : ageCheck.code === 'future_date'
          ? 'תאריך לידה לא יכול להיות בעתיד'
          : 'תאריך לידה לא תקין';
    return { ok: false, error: msg };
  }

  // Health consent must come through the evidence sheet (checkbox + typed word); validated before any account is created.
  const consentSub = {
    action: 'grant' as const,
    textVersion: String(formData.get('health_consent_text_version') ?? ''),
    typedWord: String(formData.get('health_consent_typed') ?? ''),
    checkbox: formData.get('health_consent_checkbox') === 'true',
    screenshotDataUrl: (formData.get('health_consent_screenshot') as string | null) || null,
    extraScreenshots: [2, 3, 4].map((n) => (formData.get(`health_consent_screenshot_${n}`) as string | null) || null).filter((x): x is string => !!x),
    client: (() => {
      try {
        return JSON.parse(String(formData.get('health_consent_client') ?? 'null')) as unknown;
      } catch {
        return null;
      }
    })(),
  };
  if (validateSubmission(consentSub)) {
    return { ok: false, error: 'צריך לאשר את ההסכמה למידע בריאותי בחלון ההסכמה' };
  }

  // Rate-limit signups per IP (Postgres limiter, keys hashed in DB).
  const h = await headers();
  const ip = (h.get('x-real-ip') || h.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim();
  const rl = await consumeRateLimit({ key: ip, namespace: 'auth-signup', limit: 10, windowSeconds: 600 });
  if (!rl.ok) return { ok: false, error: 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.' };

  // Server-side password policy (min length + HIBP k-anonymity). Cannot be bypassed client-side.
  const pw = await checkPasswordPolicy(data.password, { source: 'signup' });
  if (!pw.ok) return { ok: false, error: pw.error, fieldErrors: { password: [pw.error] } };

  const supabase = await createClient();
  const clientOrigin = formData.get('app_origin')?.toString().trim();
  const appOrigin =
    clientOrigin && /^https?:\/\//i.test(clientOrigin) ?
      clientOrigin.replace(/\/$/, '')
    : publicAppOriginSync();
  const emailRedirectTo = `${appOrigin}/auth/callback?next=/register/verified`;

  // Users are created ONLY here, server-side with the service role (public
  // signups are disabled in Supabase Auth). The confirmation email/OTP is then
  // sent by Supabase via `resend` (works with disable_signup=true).
  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: false,
    user_metadata: {
      full_name: data.full_name,
      username: data.email.split('@')[0],
    },
  });

  if (createError || !created?.user) {
    const code = (createError as { code?: string } | null)?.code;
    const exists =
      code === 'email_exists' ||
      code === 'user_already_exists' ||
      /already (been )?registered/i.test(createError?.message ?? '');
    return {
      ok: false,
      error: exists ? 'כתובת האימייל כבר רשומה — נסו להתחבר' : 'לא הצלחנו ליצור משתמש. נסו שוב.',
    };
  }

  const { error: resendError } = await supabase.auth.resend({
    type: 'signup',
    email: data.email,
    options: { emailRedirectTo },
  });
  if (resendError) {
    // eslint-disable-next-line no-console
    console.warn('[onboarding] confirmation email send failed', resendError.status ?? '');
  }
  const signUpData = { user: created.user };

  const userId = signUpData.user?.id;
  if (!userId) {
    return { ok: false, error: 'לא הצלחנו ליצור משתמש. נסו שוב.' };
  }

  const mealCountRaw = formData.get('meal_count');
  const mealCount =
    mealCountRaw === null || mealCountRaw === ''
      ? 0
      : Math.min(3, Math.max(0, Number.parseInt(String(mealCountRaw), 10) || 0));

  let mealSchedule: MealScheduleEntry[] = [];
  const mealJson = formData.get('meal_schedule_json');
  if (typeof mealJson === 'string' && mealJson.trim()) {
    try {
      const parsedMeals = JSON.parse(mealJson) as string[];
      if (Array.isArray(parsedMeals)) {
        mealSchedule = buildMealSchedule(parsedMeals);
      }
    } catch {
      /* ignore */
    }
  }

  const dinnerTime =
    mealSchedule.length === 0 && data.dinner_time && String(data.dinner_time).trim()
      ? String(data.dinner_time).trim()
      : null;

  const checkInTimes = calculateDailyCheckInTimes(
    data.wake_up_time,
    data.sleep_time,
    data.weakest_time_of_day,
    { dinnerTime, meals: mealSchedule.length ? mealSchedule : null }
  );

  const screening = buildSafetyScreening({
    edHistory: data.screen_ed_history === 'true',
    pregnancy: data.screen_pregnancy === 'true',
    fluidRestriction: data.screen_fluid_restriction === 'true',
    medicalFollowup: data.screen_medical_followup === 'true',
    minor: false,
  });
  // no weight focus for ED history / pregnancy / minors: drop weights even if typed
  const currentWeight = screening.no_weight ? null : (data.current_weight ?? null);
  const goalWeight = screening.no_weight ? null : (data.target_weight ?? null);

  const systemPrompt = generateMentorSystemPrompt({
    full_name: data.full_name,
    gender: data.gender,
    main_goal: data.main_goal,
    current_weight_kg: currentWeight,
    goal_weight_kg: goalWeight,
    height_cm: data.height ?? null,
    weakest_time_of_day: data.weakest_time_of_day,
    main_obstacle: data.main_obstacle,
    main_obstacle_detail: data.main_obstacle_detail,
    wake_up_time: data.wake_up_time,
    sleep_time: data.sleep_time,
    dinner_time: dinnerTime,
    meal_schedule: mealSchedule.length ? mealSchedule : null,
    preferred_channel: data.preferred_channel,
  });


  // Consent first: health fields are only written once health-data consent is on record.
  const consentResult = await recordRegistrationConsents(admin, {
    userId,
    source: 'onboarding_form',
    healthData: true,
    parentalGuardian: false,
    birthDate: data.date_of_birth,
    age: ageCheck.age,
  });
  if (!consentResult.ok) {
    console.warn('[complete-onboarding] consent record failed', consentResult.error);
  }

  const retentionResult = await recordRetentionChoice(admin, {
    userId,
    choice: data.post_sub_retention,
    source: 'onboarding',
  });
  if (!retentionResult.ok) {
    console.warn('[complete-onboarding] retention choice record failed', retentionResult.error);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: profileError } = await (admin.from('profiles') as any)
    .update(await sealProfilePatch({
      full_name: data.full_name,
      gender: data.gender,
      date_of_birth: data.date_of_birth,
      main_goal: data.main_goal,
      current_weight_kg: currentWeight,
      goal_weight_kg: goalWeight,
      height_cm: data.height ?? null,
      safety_screening: screening,
      weakest_time_of_day: data.weakest_time_of_day,
      main_obstacle: data.main_obstacle,
      main_obstacle_detail:
        data.main_obstacle === 'other' ? data.main_obstacle_detail?.trim() || null : null,
      wake_up_time: data.wake_up_time,
      sleep_time: data.sleep_time,
      dinner_time: dinnerTime,
      meal_count: mealCount,
      meal_schedule: mealSchedule.length ? mealSchedule : null,
      preferred_channel: data.preferred_channel,
      ai_check_in_times: checkInTimes,
      ai_system_prompt: systemPrompt,
      onboarding_completed: true,
      ai_context: {
        mentor: 'almog',
        intake_collected_by: 'dolev',
        onboarding_channel: data.preferred_channel,
        check_in_times: checkInTimes,
        ...(screening.no_weight ? { safety_no_weight: true } : {}),
        ...(screening.fluid_restriction ? { safety_fluid_restriction: true } : {}),
      },
    }, userId))
    .eq('id', userId);

  if (profileError) {
    return { ok: false, error: 'החשבון נוצר אך שמירת הפרופיל נכשלה. פנו לתמיכה.' };
  }

  // Signed, timestamped evidence of the onboarding health consent (same flow as settings/chat).
  try {
    const ev = await recordConsentEvidence(admin, userId, 'onboarding', consentSub, {
      ip: ip === 'unknown' ? null : ip,
      userAgent: h.get('user-agent')?.slice(0, 400) ?? null,
      sessionId: null,
      deviceId: null,
      requestId: h.get('x-vercel-id')?.slice(0, 120) ?? null,
    });
    if (!ev.ok) console.warn('[complete-onboarding] consent evidence failed', ev.error);
  } catch (e) {
    console.warn('[complete-onboarding] consent evidence error', e instanceof Error ? e.message : 'error');
  }


  const vectorProfile: OnboardingProfileForChat = {
    full_name: data.full_name,
    gender: data.gender,
    main_goal: data.main_goal,
    current_weight_kg: data.current_weight ?? null,
    goal_weight_kg: data.target_weight ?? null,
    weakest_time_of_day: data.weakest_time_of_day,
    main_obstacle: data.main_obstacle,
    main_obstacle_detail:
      data.main_obstacle === 'other' ? data.main_obstacle_detail?.trim() || null : null,
    wake_up_time: data.wake_up_time,
    sleep_time: data.sleep_time,
    dinner_time: dinnerTime,
    meal_schedule: mealSchedule.length ? mealSchedule : null,
    preferred_channel: data.preferred_channel,
    ai_check_in_times: checkInTimes,
    onboarding_completed: true,
  };

  ingestOnboardingIntoVectorMemory(userId, vectorProfile).catch((err) => {
    console.warn('[complete-onboarding] vector ingest failed', err);
  });

  await enrollNewUserInChallenge(admin, userId).catch((err) => {
    console.warn('[complete-onboarding] challenge enroll failed', err);
  });

  const needsEmailVerification = !signUpData.user?.email_confirmed_at;

  return {
    ok: true,
    redirectTo: needsEmailVerification
      ? `/register/check-email?email=${encodeURIComponent(data.email)}`
      : '/home',
    needsEmailVerification,
  };
}
