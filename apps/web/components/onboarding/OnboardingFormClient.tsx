'use client';

import { PageBackButton } from '@/components/shared/PageBackButton';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, ChevronLeft, Loader2, Mail, Lock } from 'lucide-react';
import { completeOnboarding } from '@/lib/actions/complete-onboarding';
import { useToast, ToastContainer } from '@/components/shared/Toast';
import { MentorBubble } from './MentorBubble';
import { GlassChoiceButton } from './GlassChoiceButton';
import type { MainGoal, MainObstacle, OnboardingGender, WeakestTimeOfDay } from '@/lib/onboarding/types';
import { classifyMealSlot, mealSlotLabel } from '@/lib/onboarding/meal-schedule';
import { BODY_METRICS, validateBodyMetrics } from '@/lib/onboarding/body-metrics';
import { genderCopy } from '@/lib/onboarding/gender-copy';
import { OnboardingSummaryStep } from './OnboardingSummaryStep';
import {
  HealthDataConsentBlock,
  LegalConsentCheckbox,
} from '@/components/legal/PrivacyConsentFields';
import type { ConsentCollected } from '@/components/legal/ConsentEvidenceSheet';
import { validateBirthDate } from '@/lib/privacy/age-validation';
import { SCREENING_GUIDANCE } from '@/lib/onboarding/safety-screening';
import { RetentionChoicePicker } from '@/components/privacy/RetentionChoicePicker';
import type { RetentionChoice } from '@saas/billing';

const TOTAL_STEPS = 6;

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || '';
}

function address(gender: OnboardingGender | '', name: string): string {
  const n = firstName(name);
  if (!gender) return n;
  return gender === 'male' ? n : n;
}

export function OnboardingFormClient() {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [pending, startTransition] = useTransition();

  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<OnboardingGender | ''>('');
  const [mainGoal, setMainGoal] = useState<MainGoal | ''>('');
  const [currentWeight, setCurrentWeight] = useState('');
  const [targetWeight, setTargetWeight] = useState('');
  const [height, setHeight] = useState('');
  const [weakest, setWeakest] = useState<WeakestTimeOfDay | ''>('');
  const [obstacle, setObstacle] = useState<MainObstacle | ''>('');
  const [obstacleDetail, setObstacleDetail] = useState('');
  const [wakeUp, setWakeUp] = useState('07:00');
  const [sleep, setSleep] = useState('23:00');
  const [mealCount, setMealCount] = useState<number | null>(null);
  const [mealTimes, setMealTimes] = useState<string[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [healthConsent, setHealthConsent] = useState(false);
  const [consentEvidence, setConsentEvidence] = useState<ConsentCollected | null>(null);
  const [screen, setScreen] = useState({ ed_history: false, pregnancy: false, fluid_restriction: false, medical_followup: false });
  const [legalConsent, setLegalConsent] = useState(false);
  const [retentionChoice, setRetentionChoice] = useState<RetentionChoice | null>(null);

  const ageInfo = useMemo(() => {
    if (!birthDate.trim()) return null;
    return validateBirthDate(birthDate);
  }, [birthDate]);

  const name = address('', fullName);
  const gc = useMemo(() => genderCopy(gender), [gender]);

  // ED history / pregnancy → no weight fields at all (habits only)
  const noWeight = screen.ed_history || screen.pregnancy;

  const progress = useMemo(() => (step / TOTAL_STEPS) * 100, [step]);

  const bodyMetricsErrorToast = (err: NonNullable<ReturnType<typeof validateBodyMetrics>>) => {
    if (err.field === 'current_weight') {
      toast.warning(
        'משקל נוכחי',
        err.code === 'missing' ?
          `${gc.enter} משקל נוכחי`
        : `${gc.enter} משקל בין ${BODY_METRICS.weightMin} ל־${BODY_METRICS.weightMax} ק״ג`
      );
      return;
    }
    if (err.field === 'target_weight') {
      toast.warning(
        'משקל יעד',
        err.code === 'missing' ?
          `${gc.enter} משקל יעד`
        : `${gc.enter} משקל בין ${BODY_METRICS.weightMin} ל־${BODY_METRICS.weightMax} ק״ג`
      );
      return;
    }
    toast.warning(
      'גובה',
      `${gc.enter} גובה בין ${BODY_METRICS.heightMin} ל־${BODY_METRICS.heightMax} ס״מ, או השאר ריק`
    );
  };

  const goNext = () => {
    if (step === 1 && fullName.trim().length < 2) {
      toast.warning('רגע', 'איך לקרוא לך?');
      return;
    }
    if (step === 2) {
      if (!gender) {
        toast.warning('עוד רגע', `${gc.choose} מין לפנייה נכונה`);
        return;
      }
      if (!mainGoal) {
        toast.warning('מטרה', `מה המטרה העיקרית של ${gc.you}?`);
        return;
      }
      if (!birthDate.trim()) {
        toast.warning('תאריך לידה', `${gc.enter} תאריך לידה`);
        return;
      }
      const ageResult = validateBirthDate(birthDate);
      if (!ageResult.ok) {
        toast.warning(
          'גיל',
          ageResult.code === 'too_young'
            ? 'השירות מיועד לגיל 18 ומעלה'
            : 'תאריך לידה לא תקין'
        );
        return;
      }
      if (!healthConsent) {
        toast.warning('הסכמה', 'נדרשת הסכמה לאיסוף מידע בריאותי/גוף');
        return;
      }
      const metricsErr = validateBodyMetrics({ currentWeight, targetWeight, height });
      if (metricsErr) {
        bodyMetricsErrorToast(metricsErr);
        return;
      }
    }
    if (step === 4 || step === 5) {
      const metricsErr = validateBodyMetrics({ currentWeight, targetWeight, height });
      if (metricsErr) {
        bodyMetricsErrorToast(metricsErr);
        if (step === 5) setStep(2);
        return;
      }
    }
    if (step === 3) {
      if (!weakest || !obstacle) {
        toast.warning('כמעט', `${gc.choose} לפחות אפשרות אחת בכל שאלה`);
        return;
      }
      if (obstacle === 'other' && !obstacleDetail.trim()) {
        toast.warning(gc.detail, `${gc.tell} בקצרה מה המכשול`);
        return;
      }
    }
    if (step === 4) {
      if (mealCount === null) {
        toast.warning('רגע', 'כמה ארוחות עיקריות ביום? אפשר גם לדלג');
        return;
      }
      if (mealCount > 0) {
        for (let i = 0; i < mealCount; i++) {
          if (!mealTimes[i]?.trim()) {
            toast.warning('שעות ארוחה', `מתי הארוחה ${i + 1}?`);
            return;
          }
        }
      }
    }
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  };

  const summaryData = useMemo(
    () => ({
      fullName,
      gender,
      mainGoal,
      currentWeight,
      targetWeight,
      height,
      weakest,
      obstacle,
      obstacleDetail,
      mealCount,
      mealTimes,
      wakeUp,
      sleep,
      email,
    }),
    [
      fullName,
      gender,
      mainGoal,
      currentWeight,
      targetWeight,
      height,
      weakest,
      obstacle,
      obstacleDetail,
      mealCount,
      mealTimes,
      wakeUp,
      sleep,
      email,
    ]
  );

  const submit = () => {
    if (!retentionChoice) {
      toast.warning('שמירת מידע', 'יש לבחור מה יקרה למידע כשהמנוי יסתיים');
      return;
    }
    if (!legalConsent) {
      toast.warning('אישור משפטי', 'יש לאשר את תנאי השימוש ומדיניות הפרטיות');
      return;
    }
    if (!email.trim() || !password || password.length < 10) {
      toast.warning('חשבון', `${gc.fill} אימייל וסיסמה (לפחות 10 תווים, אותיות וספרה)`);
      return;
    }
    const metricsErr = validateBodyMetrics({ currentWeight, targetWeight, height });
    if (metricsErr) {
      bodyMetricsErrorToast(metricsErr);
      setStep(2);
      return;
    }
    const fd = new FormData();
    fd.set('full_name', fullName.trim());
    fd.set('gender', gender);
    fd.set('main_goal', mainGoal);
    fd.set('current_weight', noWeight ? '' : currentWeight);
    fd.set('target_weight', noWeight ? '' : targetWeight);
    fd.set('screen_ed_history', String(screen.ed_history));
    fd.set('screen_pregnancy', String(screen.pregnancy));
    fd.set('screen_fluid_restriction', String(screen.fluid_restriction));
    fd.set('screen_medical_followup', String(screen.medical_followup));
    if (height.trim()) fd.set('height', height);
    fd.set('weakest_time_of_day', weakest);
    fd.set('main_obstacle', obstacle);
    if (obstacle === 'other') fd.set('main_obstacle_detail', obstacleDetail);
    fd.set('wake_up_time', wakeUp);
    fd.set('sleep_time', sleep);
    fd.set('meal_count', String(mealCount ?? 0));
    if (mealCount && mealCount > 0) {
      fd.set('meal_schedule_json', JSON.stringify(mealTimes.slice(0, mealCount)));
    }
    fd.set('preferred_channel', 'in_app');
    fd.set('email', email.trim());
    fd.set('password', password);
    fd.set('date_of_birth', birthDate);
    fd.set('health_data_consent', 'true');
    if (consentEvidence) {
      fd.set('health_consent_text_version', consentEvidence.text_version);
      fd.set('health_consent_typed', consentEvidence.typed_word);
      fd.set('health_consent_checkbox', 'true');
      if (consentEvidence.screenshot) fd.set('health_consent_screenshot', consentEvidence.screenshot);
      (consentEvidence.screenshots ?? []).slice(1, 4).forEach((u, i) => fd.set(`health_consent_screenshot_${i + 2}`, u));
      if (consentEvidence.client) fd.set('health_consent_client', JSON.stringify(consentEvidence.client));
    }
    fd.set('legal_consent', 'true');
    fd.set('post_sub_retention', retentionChoice);
    if (typeof window !== 'undefined') {
      fd.set('app_origin', window.location.origin);
    }

    startTransition(async () => {
      const result = await completeOnboarding(null, fd);
      if (result.ok) {
        const sub = result.needsEmailVerification
          ? 'שלחנו קישור לאימות — אחרי האישור דולב ישלח סיכום במייל.'
          : 'מעבירים אותך לאפליקציה...';
        toast.success(`${gc.welcome}, ${firstName(fullName)}!`, sub);
        setTimeout(() => {
          router.push(result.redirectTo);
          router.refresh();
        }, 900);
      } else {
        toast.error('לא הצלחנו', result.error);
      }
    });
  };

  return (
    <>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
      <main id="main-content" className="onboarding-shell-dark px-4 py-6 pb-28">
        <div className="onboarding-page-inner max-w-lg mx-auto w-full">
          <div className="flex items-center justify-between mb-4">
            <PageBackButton href="/register" />
            <span className="text-xs font-bold text-primary-300/90">
              שלב {step} מתוך {TOTAL_STEPS}
            </span>
          </div>

          <div
            className="h-1.5 rounded-full bg-background-card/10 mb-6 overflow-hidden"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <motion.div
              className="h-full bg-linear-to-l from-primary-400 to-secondary-300 rounded-full"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.35 }}
            />
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.25 }}
              className="onboarding-panel-dark"
            >
              {step === 1 && (
                <>
                  <MentorBubble mentorId="dolev">
                    <p>שמח שבאת! לפני הכל — איך קוראים לך? אני דולב, ומכאן אדבר איתך בשם הפרטי 😊</p>
                  </MentorBubble>
                  <label htmlFor="onboarding-full-name" className="block mt-6">
                    <span className="text-sm font-bold text-primary-50 mb-2 block">השם שלך</span>
                    <input
                      id="onboarding-full-name"
                      name="full_name"
                      type="text"
                      autoComplete="name"
                      autoFocus
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="onboarding-input-dark w-full text-lg"
                      placeholder="למשל: ישראל"
                      aria-required="true"
                    />
                  </label>
                </>
              )}

              {step === 2 && (
                <>
                  <MentorBubble mentorId="dolev">
                    <p>
                      נעים להכיר, <strong className="text-primary-300 font-bold">{name}</strong>! עכשיו נכיר אותך קצת יותר — בלי לחץ.
                    </p>
                  </MentorBubble>

                  <p className="text-sm font-bold text-primary-100/85 mt-5 mb-2">מין (לפנייה נכונה)</p>
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <GlassChoiceButton
                      selected={gender === 'female'}
                      onClick={() => setGender('female')}
                      emoji="👩"
                      title="אישה"
                    />
                    <GlassChoiceButton
                      selected={gender === 'male'}
                      onClick={() => setGender('male')}
                      emoji="👨"
                      title="גבר"
                    />
                  </div>

                  <p className="text-sm font-bold text-primary-100/85 mb-2">
                    {gender ? `${gc.you}, מה המטרה העיקרית?` : 'מה המטרה העיקרית?'}
                  </p>
                  <div className="space-y-2 mb-4">
                    <GlassChoiceButton
                      selected={mainGoal === 'healthy_lifestyle'}
                      onClick={() => setMainGoal('healthy_lifestyle')}
                      emoji="🌿"
                      title="סיגול אורח חיים בריא יותר"
                    />
                    <GlassChoiceButton
                      selected={mainGoal === 'both'}
                      onClick={() => setMainGoal('both')}
                      emoji="✨"
                      title="גם וגם"
                    />
                    <GlassChoiceButton
                      selected={mainGoal === 'weight_loss'}
                      onClick={() => setMainGoal('weight_loss')}
                      emoji="🎯"
                      title="ירידה במשקל"
                    />
                  </div>

                  <label className="block mt-4">
                    <span className="text-xs font-bold text-primary-100/85">תאריך לידה</span>
                    <input
                      type="date"
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      className="onboarding-input-dark w-full mt-1"
                      dir="ltr"
                      max={new Date().toISOString().slice(0, 10)}
                      required
                    />
                  </label>

                  <HealthDataConsentBlock checked={healthConsent} onChange={setHealthConsent} gender={gender} onEvidence={setConsentEvidence} />

                  <fieldset className={`mt-4 rounded-2xl border border-primary-200/20 bg-on-dark/5 p-3 ${healthConsent ? '' : 'opacity-50 pointer-events-none'}`}>
                    <legend className="px-1 text-sm font-bold text-primary-100/90">כדי להתאים את התוכנית בבטחה (לא חובה)</legend>
                    <p className="mb-2 text-xs text-primary-100/70">מה מהבאים נכון לגבי המצב שלך היום? התשובות נשמרות בהסכמה למידע בריאותי.</p>
                    {(
                      [
                        ['ed_history', 'הפרעת אכילה עכשיו או בעבר'],
                        ['pregnancy', 'הריון או הנקה'],
                        ['fluid_restriction', 'מחלת כליות או לב, או הגבלת שתייה מרופא'],
                        ['medical_followup', 'מצב רפואי אחר במעקב (למשל סוכרת)'],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key} className="mb-2">
                        <label className="flex items-start gap-2 text-sm text-primary-50">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={screen[key]}
                            onChange={(e) => setScreen((p) => ({ ...p, [key]: e.target.checked }))}
                          />
                          <span>{label}</span>
                        </label>
                        {screen[key] ? (
                          <p role="note" className="mt-1 ms-6 rounded-xl bg-primary-950/40 p-2 text-xs leading-relaxed text-primary-100">
                            {SCREENING_GUIDANCE[key]}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </fieldset>

                  <div className={healthConsent ? '' : 'opacity-50 pointer-events-none'}>
                  {noWeight ? null : (
                  <>
                  <p className="mt-4 text-xs text-primary-100/70">משקל — לא חובה. אפשר לדלג; NuraWell מתמקדת בהרגלים.</p>
                  <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end mt-2">
                    <label>
                      <span className="text-xs font-bold text-primary-100/85">משקל נוכחי (ק״ג) — לא חובה</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={BODY_METRICS.weightMin}
                        max={BODY_METRICS.weightMax}
                        value={currentWeight}
                        onChange={(e) => setCurrentWeight(e.target.value)}
                        className="onboarding-input-dark w-full mt-1"
                        dir="ltr"
                      />
                    </label>
                    <span
                      className="flex h-[46px] items-center justify-center text-primary-300/90 pb-0.5"
                      aria-hidden
                      title="ממשקל נוכחי ליעד"
                    >
                      <ArrowLeft className="w-5 h-5" strokeWidth={2.5} />
                    </span>
                    <label>
                      <span className="text-xs font-bold text-primary-100/85">משקל יעד (ק״ג) — לא חובה</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={BODY_METRICS.weightMin}
                        max={BODY_METRICS.weightMax}
                        value={targetWeight}
                        onChange={(e) => setTargetWeight(e.target.value)}
                        className="onboarding-input-dark w-full mt-1"
                        dir="ltr"
                      />
                    </label>
                  </div>
                  <label className="block mt-3">
                    <span className="text-xs font-bold text-primary-100/85">גובה (ס״מ) — מומלץ</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={BODY_METRICS.heightMin}
                      max={BODY_METRICS.heightMax}
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      className="onboarding-input-dark w-full mt-1"
                      placeholder="אופציונלי"
                      dir="ltr"
                    />
                  </label>
                  </>
                  )}
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <MentorBubble mentorId="dolev">
                    <p>
                      {gender ? `${name}, ` : ''}
                      {gc.come} נזהה את הרגעים הקשים — כדי שאדע בדיוק מתי לתמוך בך. בלי חיבורים ארוכים, רק
                      לחיצות.
                    </p>
                  </MentorBubble>

                  <p className="text-sm font-bold text-primary-100/85 mt-5 mb-2">
                    {gender ? `מתי הכי קשה ל${gc.you} לשמור על תזונה?` : 'מתי הכי קשה לשמור על תזונה?'}
                  </p>
                  <div className="space-y-2 mb-5">
                    {(
                      [
                        ['morning', '🌅', 'בוקר', `${gc.hurry}, ${gc.missMeals}`],
                        ['noon', '🍽️', 'צהריים', gc.eatOut],
                        ['afternoon', '😴', 'אחר הצהריים', gc.tired],
                        ['evening_night', '🌙', 'ערב/לילה', gc.snack],
                      ] as const
                    ).map(([id, emoji, title, sub]) => (
                      <GlassChoiceButton
                        key={id}
                        selected={weakest === id}
                        onClick={() => setWeakest(id)}
                        emoji={emoji}
                        title={title}
                        subtitle={sub}
                      />
                    ))}
                  </div>

                  <p className="text-sm font-bold text-primary-100/85 mb-2">מה המכשול העיקרי בעבר?</p>
                  <div className="space-y-2">
                    {(
                      [
                        ['no_time', '⏱️', 'חוסר זמן לבשל / להתארגן'],
                        ['emotional_eating', '💭', 'אכילה רגשית'],
                        ['lack_of_consistency', '📉', 'קושי להתמיד'],
                        ['no_support', '🤝', 'חוסר תמיכה ומעקב'],
                        ['other', '✏️', 'אחר'],
                      ] as const
                    ).map(([id, emoji, title]) => (
                      <GlassChoiceButton
                        key={id}
                        selected={obstacle === id}
                        onClick={() => setObstacle(id)}
                        emoji={emoji}
                        title={title}
                      />
                    ))}
                  </div>
                  {obstacle === 'other' ? (
                    <input
                      type="text"
                      value={obstacleDetail}
                      onChange={(e) => setObstacleDetail(e.target.value)}
                      className="onboarding-input-dark w-full mt-3"
                      placeholder={`${gc.tell} בקצרה...`}
                      maxLength={500}
                    />
                  ) : null}
                </>
              )}

              {step === 4 && (
                <>
                  <MentorBubble mentorId="dolev">
                    <p>
                      {gender ? `${name}, ` : ''}
                      {gc.come} נסדר את הקצב של היום. כמה <strong>ארוחות עיקריות וגדולות</strong> {gc.have}?
                      {gc.recommend} בחום על 2–3 — כך אלמוג יידע מתי לגעת לפני, בזמן ואחרי. אפשר גם לדלג.
                    </p>
                  </MentorBubble>

                  <p className="text-sm font-bold text-primary-100/90 mt-4 mb-1">
                    כמה ארוחות עיקריות וגדולות ביום?
                  </p>
                  <p className="text-xs text-primary-200/75 mb-2 leading-relaxed">
                    ארוחות מלאות — לא נשנושים קטנים. המשימות במסע יסתנכרנו לפי הזמנים האלה.
                  </p>
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {(
                      [
                        [0, 'לא עכשיו', 'נשתמש בשעות כלליות'],
                        [1, 'ארוחה אחת', undefined],
                        [2, 'שתיים', 'מומלץ ✨'],
                        [3, 'שלוש', undefined],
                      ] as const
                    ).map(([n, title, sub]) => (
                      <GlassChoiceButton
                        key={n}
                        selected={mealCount === n}
                        onClick={() => {
                          setMealCount(n);
                          setMealTimes((prev) =>
                            Array.from({ length: n }, (_, idx) => prev[idx] ?? '')
                          );
                        }}
                        title={title}
                        subtitle={sub}
                      />
                    ))}
                  </div>

                  {mealCount !== null && mealCount > 0 ? (
                    <motion.div className="space-y-3 mb-4">
                      {Array.from({ length: mealCount }, (_, i) => {
                        const t = mealTimes[i] ?? '';
                        const slot = t ? classifyMealSlot(t) : null;
                        return (
                          <label key={i}>
                            <span className="text-xs font-bold text-primary-100/85">
                              שעת ארוחה עיקרית {i + 1}
                              {slot ? (
                                <span className="text-primary-300/80 font-normal mr-1">
                                  · זוהה: {mealSlotLabel(slot)}
                                </span>
                              ) : null}
                            </span>
                            <input
                              type="time"
                              value={t}
                              onChange={(e) => {
                                const next = [...mealTimes];
                                next[i] = e.target.value;
                                setMealTimes(next);
                              }}
                              className="onboarding-input-dark w-full mt-1"
                            />
                          </label>
                        );
                      })}
                    </motion.div>
                  ) : null}

                  <p className="text-sm font-bold text-primary-100/90 mt-2 mb-2">שעות יום (תמיד)</p>
                  <div className="grid grid-cols-2 gap-4">
                    <label>
                      <span className="text-xs font-bold text-primary-100/85">שעת השכמה</span>
                      <input
                        type="time"
                        value={wakeUp}
                        onChange={(e) => setWakeUp(e.target.value)}
                        className="onboarding-input-dark w-full mt-1"
                      />
                    </label>
                    <label>
                      <span className="text-xs font-bold text-primary-100/85">שעת שינה</span>
                      <input
                        type="time"
                        value={sleep}
                        onChange={(e) => setSleep(e.target.value)}
                        className="onboarding-input-dark w-full mt-1"
                      />
                    </label>
                  </div>
                </>
              )}

              {step === 5 && (
                <OnboardingSummaryStep
                  data={summaryData}
                  name={name}
                  gender={gender}
                  onEdit={(s) => setStep(s)}
                />
              )}

              {step === 6 && (
                <>
                  <MentorBubble mentorId="dolev">
                    <p>
                      {gender ? `מעולה ${name}! ` : ''}נשאר רק לפתוח חשבון — שם המשתמש ייווצר מהאימייל שלך.{' '}
                      {gc.ready}?
                    </p>
                  </MentorBubble>
                  <div className="space-y-4 mt-6">
                    <label>
                      <span className="text-sm font-bold text-primary-50 flex items-center gap-2 mb-2">
                        <Mail className="w-4 h-4 text-primary-400" />
                        אימייל
                      </span>
                      <input
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="onboarding-input-dark w-full"
                        dir="ltr"
                        required
                      />
                    </label>
                    <label>
                      <span className="text-sm font-bold text-primary-50 flex items-center gap-2 mb-2">
                        <Lock className="w-4 h-4 text-primary-400" />
                        סיסמה (לפחות 10 תווים, אותיות וספרה)
                      </span>
                      <input
                        type="password"
                        autoComplete="new-password"
                        minLength={10}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="onboarding-input-dark w-full"
                        dir="ltr"
                        required
                      />
                    </label>
                    <div className="mb-4" data-testid="onboarding-retention-choice">
                      <RetentionChoicePicker value={retentionChoice} onChange={setRetentionChoice} disabled={pending} tone="dark" />
                    </div>
                    <LegalConsentCheckbox
                      id="onboarding-legal-consent"
                      checked={legalConsent}
                      onChange={setLegalConsent}
                      disabled={pending}
                    />
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="fixed bottom-0 inset-x-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-linear-to-t from-ink-950 via-ink-950/95 to-transparent z-20">
          <div className="max-w-lg mx-auto flex gap-2">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                disabled={pending}
                className="min-h-[52px] px-5 rounded-2xl border border-on-dark/20 text-on-dark font-bold bg-background-card/10"
              >
                אחורה
              </button>
            ) : null}
            {step < TOTAL_STEPS ? (
              <button
                type="button"
                onClick={goNext}
                className="flex-1 min-h-[52px] rounded-2xl font-black text-on-dark bg-linear-to-l from-primary-600 to-secondary-500 flex items-center justify-center gap-2"
              >
                המשך
                <ArrowRight className="w-5 h-5 rotate-180" />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="flex-1 min-h-[52px] rounded-2xl font-black text-on-dark bg-linear-to-l from-primary-600 to-secondary-500 flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {pending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'סיום ושליחת אימות 🎉'}
              </button>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
