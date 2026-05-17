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

const TOTAL_STEPS = 5;

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || 'חבר/ה';
}

function address(gender: OnboardingGender | '', name: string): string {
  const n = firstName(name);
  if (!gender) return n;
  return gender === 'male' ? n : n;
}

function addressYou(gender: OnboardingGender | ''): string {
  if (gender === 'male') return 'אתה';
  if (gender === 'female') return 'את';
  return 'את/ה';
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
  const [dinnerTime, setDinnerTime] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const name = address('', fullName);
  const you = addressYou(gender);

  const progress = useMemo(() => (step / TOTAL_STEPS) * 100, [step]);

  const goNext = () => {
    if (step === 1 && fullName.trim().length < 2) {
      toast.warning('רגע', 'איך לקרוא לך?');
      return;
    }
    if (step === 2) {
      if (!gender) {
        toast.warning('עוד רגע', 'בחר/י מין לפנייה נכונה');
        return;
      }
      if (!mainGoal) {
        toast.warning('מטרה', 'מה המטרה העיקרית שלך?');
        return;
      }
      const cw = Number(currentWeight);
      const tw = Number(targetWeight);
      if (!Number.isFinite(cw) || cw < 30) {
        toast.warning('משקל', 'הזן/י משקל נוכחי תקין');
        return;
      }
      if (!Number.isFinite(tw) || tw < 30) {
        toast.warning('משקל יעד', 'הזן/י משקל יעד תקין');
        return;
      }
    }
    if (step === 3) {
      if (!weakest || !obstacle) {
        toast.warning('כמעט', 'בחר/י לפחות אפשרות אחת בכל שאלה');
        return;
      }
      if (obstacle === 'other' && !obstacleDetail.trim()) {
        toast.warning('פרט/י', 'ספר/י בקצרה מה המכשול');
        return;
      }
    }
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  };

  const submit = () => {
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
    if (dinnerTime.trim()) fd.set('dinner_time', dinnerTime);
    fd.set('preferred_channel', 'in_app');
    fd.set('email', email.trim());
    fd.set('password', password);

    startTransition(async () => {
      const result = await completeOnboarding(null, fd);
      if (result.ok) {
        toast.success(`ברוך/ה הבא/ה, ${firstName(fullName)}!`, 'מעבירים אותך לאפליקציה...');
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
        <motion.div className="max-w-lg mx-auto w-full">
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
                    {gender ? `${you}, מה המטרה העיקרית?` : 'מה המטרה העיקרית?'} (אפשר יותר מאחת)
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
                      {gender ? `${name}, ` : ''}בוא/י נזהה את הרגעים הקשים — כדי שאדע בדיוק מתי לתמוך בך. בלי
                      חיבורים ארוכים, רק לחיצות.
                    </p>
                  </MentorBubble>

                  <p className="text-sm font-bold text-emerald-100/85 mt-5 mb-2">מתי הכי קשה לשמור על תזונה?</p>
                  <div className="space-y-2 mb-5">
                    {(
                      [
                        ['morning', '🌅', 'בוקר', 'ממהר/ת, מפספס/ת ארוחות'],
                        ['noon', '🍽️', 'צהריים', 'אוכל/ת בחוץ / משלוחים'],
                        ['afternoon', '😴', 'אחר הצהריים', 'עייפות אחרי העבודה'],
                        ['evening_night', '🌙', 'ערב/לילה', 'נשנושים מול מסך'],
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
                      placeholder="ספר/י בקצרה..."
                      maxLength={500}
                    />
                  ) : null}
                </>
              )}

              {step === 4 && (
                <>
                  <MentorBubble mentorId="dolev">
                    <p>
                      {gender ? `${name}, ` : ''}מתי {you} קם/ה, אוכל/ת ערב ומתי הולכ/ת לישון? אלמוג יידע מתי לגעת
                      בך — כולל לפני ואחרי ארוחת ערב אם תמלא/י למטה.
                    </p>
                  </MentorBubble>
                  <div className="grid grid-cols-2 gap-4 mt-6">
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
                  <label className="block mt-4">
                    <span className="text-xs font-bold text-emerald-100/85">
                      שעת ארוחת ערב (אופציונלי — מומלץ)
                    </span>
                    <input
                      type="time"
                      value={dinnerTime}
                      onChange={(e) => setDinnerTime(e.target.value)}
                      className="onboarding-input-dark w-full mt-1"
                      aria-describedby="dinner-hint"
                    />
                    <span id="dinner-hint" className="text-xs text-white/50 mt-1 block">
                      אלמוג ישלח מגע לפני ואחרי הארוחה בערב
                    </span>
                  </label>
                </>
              )}

              {step === 5 && (
                <>
                  <MentorBubble mentorId="dolev">
                    <p>
                      {gender ? `מעולה ${name}! ` : ''}נשאר רק לפתוח חשבון — שם המשתמש ייווצר מהאימייל שלך. מוכן/ה?
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
        </motion.div>

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
                {pending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'סיום והתחלה 🎉'}
              </button>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
