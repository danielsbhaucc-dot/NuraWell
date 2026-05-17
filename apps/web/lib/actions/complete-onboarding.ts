'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { generateMentorSystemPrompt, calculateDailyCheckInTimes } from '@/lib/ai/generate-mentor-system-prompt';
import { ingestOnboardingIntoVectorMemory } from '@/lib/ai/ingest-onboarding-vector-memory';
import type { OnboardingProfileForChat } from '@/lib/ai/onboarding-chat-context';
import {
  GENDERS,
  MAIN_GOALS,
  MAIN_OBSTACLES,
  PREFERRED_CHANNELS,
  WEAKEST_TIMES,
} from '@/lib/onboarding/types';

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const onboardingSchema = z.object({
  full_name: z.string().trim().min(2, 'שם קצר מדי').max(120),
  gender: z.enum(GENDERS),
  main_goal: z.enum(MAIN_GOALS),
  current_weight: z.coerce.number().min(30).max(400),
  target_weight: z.coerce.number().min(30).max(400),
  height: z.coerce.number().min(100).max(250).optional().nullable(),
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
  password: z.string().min(6, 'סיסמה קצרה מדי — לפחות 6 תווים'),
});

export type OnboardingActionState =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function completeOnboarding(
  _prev: OnboardingActionState | null,
  formData: FormData
): Promise<OnboardingActionState> {
  const raw = {
    full_name: formData.get('full_name'),
    gender: formData.get('gender'),
    main_goal: formData.get('main_goal'),
    current_weight: formData.get('current_weight'),
    target_weight: formData.get('target_weight'),
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
  };

  const parsed = onboardingSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const first =
      Object.values(fieldErrors).flat()[0] ||
      parsed.error.errors[0]?.message ||
      'נתונים לא תקינים';
    return { ok: false, error: first, fieldErrors };
  }

  const data = parsed.data;
  const supabase = await createClient();

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      data: {
        full_name: data.full_name,
        username: data.email.split('@')[0],
      },
    },
  });

  if (signUpError) {
    const msg =
      signUpError.message === 'User already registered'
        ? 'כתובת האימייל כבר רשומה — נסו להתחבר'
        : signUpError.message;
    return { ok: false, error: msg };
  }

  const userId = signUpData.user?.id;
  if (!userId) {
    return { ok: false, error: 'לא הצלחנו ליצור משתמש. נסו שוב.' };
  }

  const dinnerTime =
    data.dinner_time && String(data.dinner_time).trim() ? String(data.dinner_time).trim() : null;

  const checkInTimes = calculateDailyCheckInTimes(
    data.wake_up_time,
    data.sleep_time,
    data.weakest_time_of_day,
    dinnerTime
  );

  const systemPrompt = generateMentorSystemPrompt({
    full_name: data.full_name,
    gender: data.gender,
    main_goal: data.main_goal,
    current_weight_kg: data.current_weight,
    goal_weight_kg: data.target_weight,
    height_cm: data.height ?? null,
    weakest_time_of_day: data.weakest_time_of_day,
    main_obstacle: data.main_obstacle,
    main_obstacle_detail: data.main_obstacle_detail,
    wake_up_time: data.wake_up_time,
    sleep_time: data.sleep_time,
    dinner_time: dinnerTime,
    preferred_channel: data.preferred_channel,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: profileError } = await (supabase.from('profiles') as any)
    .update({
      full_name: data.full_name,
      gender: data.gender,
      main_goal: data.main_goal,
      current_weight_kg: data.current_weight,
      goal_weight_kg: data.target_weight,
      height_cm: data.height ?? null,
      weakest_time_of_day: data.weakest_time_of_day,
      main_obstacle: data.main_obstacle,
      main_obstacle_detail:
        data.main_obstacle === 'other' ? data.main_obstacle_detail?.trim() || null : null,
      wake_up_time: data.wake_up_time,
      sleep_time: data.sleep_time,
      dinner_time: dinnerTime,
      preferred_channel: data.preferred_channel,
      ai_check_in_times: checkInTimes,
      ai_system_prompt: systemPrompt,
      onboarding_completed: true,
      ai_context: {
        mentor: 'almog',
        intake_collected_by: 'dolev',
        onboarding_channel: data.preferred_channel,
        check_in_times: checkInTimes,
      },
    })
    .eq('id', userId);

  if (profileError) {
    return { ok: false, error: 'החשבון נוצר אך שמירת הפרופיל נכשלה. פנו לתמיכה.' };
  }

  const vectorProfile: OnboardingProfileForChat = {
    full_name: data.full_name,
    gender: data.gender,
    main_goal: data.main_goal,
    current_weight_kg: data.current_weight,
    goal_weight_kg: data.target_weight,
    weakest_time_of_day: data.weakest_time_of_day,
    main_obstacle: data.main_obstacle,
    main_obstacle_detail:
      data.main_obstacle === 'other' ? data.main_obstacle_detail?.trim() || null : null,
    wake_up_time: data.wake_up_time,
    sleep_time: data.sleep_time,
    dinner_time: dinnerTime,
    preferred_channel: data.preferred_channel,
    ai_check_in_times: checkInTimes,
    onboarding_completed: true,
  };

  ingestOnboardingIntoVectorMemory(userId, vectorProfile).catch((err) => {
    console.warn('[complete-onboarding] vector ingest failed', err);
  });

  return { ok: true, redirectTo: '/courses' };
}
