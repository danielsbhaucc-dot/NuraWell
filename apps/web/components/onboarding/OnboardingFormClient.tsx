'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ChevronLeft, Loader2, Mail, Lock } from 'lucide-react';
import { completeOnboarding } from '@/lib/actions/complete-onboarding';
import { useToast, ToastContainer } from '@/components/shared/Toast';
import { MentorBubble } from './MentorBubble';
import { GlassChoiceButton } from './GlassChoiceButton';
import type { MainGoal, MainObstacle, OnboardingGender, WeakestTimeOfDay } from '@/lib/onboarding/types';
import { classifyMealSlot, mealSlotLabel } from '@/lib/onboarding/meal-schedule';
import { genderCopy } from '@/lib/onboarding/gender-copy';
import { OnboardingSummaryStep } from './OnboardingSummaryStep';

const TOTAL_STEPS = 6;

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || 'חבר/ה';
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

  const name = address('', fullName);
  const gc = useMemo(() => genderCopy(gender), [gender]);

  const progress = useMemo(() => (step / TOTAL_STEPS) * 100, [step]);

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
      const cw = Number(currentWeight);
      const tw = Number(targetWeight);
      if (!Number.isFinite(cw) || cw < 30) {
        toast.warning('משקל', `${gc.enter} משקל נוכחי תקין`);
        return;
      }
      if (!Number.isFinite(tw) || tw < 30) {
        toast.warning('משקל יעד', `${gc.enter} משקל יעד תקין`);
        return;
      }
    }
    if (step === 3) {
      if (!weakest || !obstacle) {
        toast.warning('כמעט', `${gc.choose} לפחות אפשרות אחת בכל שאלה`);
        return;
      }
      if (obstacle === 'other' && !obstacleDetail.trim()) {
        toast.warning('פרט/י', `${gc.tell} בקצרה מה המכשול`);
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
    if (!email.trim() || !password || password.length < 6) {
      toast.warning('חשבון', 'מלא/י אימייל וסיסמה (לפחות 6 תווים)');
      return;
    }
    const fd = new FormData();
    fd.set('full_name', fullName.trim());
    fd.set('gender', gender);
    fd.set('main_goal', mainGoal);
    fd.set('current_weight', currentWeight);
    fd.set('target_weight', targetWeight);
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

    startTransition(async () => {
      const result = await completeOnboarding(null, fd);
      if (result.ok) {
        const sub = result.needsEmailVerification
          ? 'שלחנו קישור לאימות — אחרי האישור אלמוג יברך אותך במייל ובאפליקציה.'
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
            <Link
              href="/register"
              className="text-sm text-white/60 hover:text-white flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              חזרה
            </Link>
            <span className="text-xs font-bold text-emerald-300/90">
              שלב {step} מתוך {TOTAL_STEPS}
            </span>
          </div>

          <div
            className="h-1.5 rounded-full bg-white/10 mb-6 overflow-hidden"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <motion.div
              className="h-full bg-gradient-to-l from-emerald-400 to-teal-300 rounded-full"
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
                  <label className="block mt-6">
                    <span className="text-sm font-bold text-emerald-50 mb-2 block">השם שלך</span>
                    <input
                      type="text"
                      autoComplete="name"
                      autoFocus
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="onboarding-input-dark w-full text-lg"
                      placeholder="למשל: ישראל"
                    />
                  </label>
                </>
              )}

              {step === 2 && (
                <>
                  <MentorBubble mentorId="dolev">
                    <p>
                      נעים להכיר, <strong className="text-emerald-300 font-bold">{name}</strong>! עכשיו נכיר אותך קצת יותר — בלי לחץ.
                    </p>
                  </MentorBubble>

                  <p className="text-sm font-bold text-emerald-100/85 mt-5 mb-2">מין (לפנייה נכונה)</p>
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

                  <p className="text-sm font-bold text-emerald-100/85 mb-2">
                    {gender ? `${gc.you}, מה המטרה העיקרית?` : 'מה המטרה העיקרית?'}
                  </p>
                  <div className="space-y-2 mb-4">
                    <GlassChoiceButton
                      selected={mainGoal === 'weight_loss'}
                      onClick={() => setMainGoal('weight_loss')}
                      emoji="🎯"
                      title="ירידה במשקל"
                    />
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
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label>
                      <span className="text-xs font-bold text-emerald-100/85">משקל נוכחי (ק״ג)</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={30}
                        max={400}
                        value={currentWeight}
                        onChange={(e) => setCurrentWeight(e.target.value)}
                        className="onboarding-input-dark w-full mt-1"
                        dir="ltr"
                      />
                    </label>
                    <label>
                      <span className="text-xs font-bold text-emerald-100/85">משקל יעד (ק״ג)</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={30}
                        max={400}
                        value={targetWeight}
                        onChange={(e) => setTargetWeight(e.target.value)}
                        className="onboarding-input-dark w-full mt-1"
                        dir="ltr"
                      />
                    </label>
                  </div>
                  <label className="block mt-3">
                    <span className="text-xs font-bold text-emerald-100/85">גובה (ס״מ) — מומלץ</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={100}
                      max={250}
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      className="onboarding-input-dark w-full mt-1"
                      placeholder="אופציונלי"
                      dir="ltr"
                    />
                  </label>
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

                  <p className="text-sm font-bold text-emerald-100/85 mt-5 mb-2">
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

                  <p className="text-sm font-bold text-emerald-100/85 mb-2">מה המכשול העיקרי בעבר?</p>
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
                      {gc.come} נסדר את הקצב של היום. כמה ארוחות עיקריות {gc.have}?
                      {gc.recommend} בחום על 2–3 — כך אלמוג יידע מתי לגעת לפני ואחרי. אפשר גם לדלג.
                    </p>
                  </MentorBubble>

                  <p className="text-sm font-bold text-emerald-100/90 mt-4 mb-2">כמה ארוחות עיקריות ביום?</p>
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
                            <span className="text-xs font-bold text-emerald-100/85">
                              שעת ארוחה {i + 1}
                              {slot ? (
                                <span className="text-emerald-300/80 font-normal mr-1">
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

                  <p className="text-sm font-bold text-emerald-100/90 mt-2 mb-2">שעות יום (תמיד)</p>
                  <div className="grid grid-cols-2 gap-4">
                    <label>
                      <span className="text-xs font-bold text-emerald-100/85">שעת השכמה</span>
                      <input
                        type="time"
                        value={wakeUp}
                        onChange={(e) => setWakeUp(e.target.value)}
                        className="onboarding-input-dark w-full mt-1"
                      />
                    </label>
                    <label>
                      <span className="text-xs font-bold text-emerald-100/85">שעת שינה</span>
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
                      <span className="text-sm font-bold text-emerald-50 flex items-center gap-2 mb-2">
                        <Mail className="w-4 h-4 text-emerald-400" />
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
                      <span className="text-sm font-bold text-emerald-50 flex items-center gap-2 mb-2">
                        <Lock className="w-4 h-4 text-emerald-400" />
                        סיסמה (לפחות 6 תווים)
                      </span>
                      <input
                        type="password"
                        autoComplete="new-password"
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="onboarding-input-dark w-full"
                        dir="ltr"
                        required
                      />
                    </label>
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="fixed bottom-0 inset-x-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent z-20">
          <div className="max-w-lg mx-auto flex gap-2">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                disabled={pending}
                className="min-h-[52px] px-5 rounded-2xl border border-white/20 text-white font-bold bg-white/10"
              >
                אחורה
              </button>
            ) : null}
            {step < TOTAL_STEPS ? (
              <button
                type="button"
                onClick={goNext}
                className="flex-1 min-h-[52px] rounded-2xl font-black text-white bg-gradient-to-l from-emerald-600 to-teal-500 flex items-center justify-center gap-2"
              >
                המשך
                <ArrowRight className="w-5 h-5 rotate-180" />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="flex-1 min-h-[52px] rounded-2xl font-black text-white bg-gradient-to-l from-emerald-600 to-teal-500 flex items-center justify-center gap-2 disabled:opacity-60"
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
