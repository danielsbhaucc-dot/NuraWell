'use client';

import { PageBackButton } from '@/components/shared/PageBackButton';
import { summarizeJourneyProgress } from '../../lib/journey/journey-progress-summary';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JourneyStepProgress } from '../../lib/types/journey';
import { useJourneyProgressLive } from '../../lib/journey/use-journey-progress-live';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  CheckCircle2,
  Lock,
  Play,
  Leaf,
  Droplets,
  ChevronRight,
  Trophy,
  Sun,
  Moon,
  Sunrise,
  Sunset,
  Calendar,
  Target,
  Flame,
} from 'lucide-react';
import type { JourneyStepWithProgress } from '../../lib/types/journey';
import type { JourneyStationGroup } from '../../lib/journey/group-journey-by-station';
import { JourneyStationCard } from './JourneyStationCard';
import { PracticingStepsContext, useStepCredit } from './practicing-context';
import { JourneyNextStepCard, type NextStepCardData } from './JourneyNextStepCard';
import { AlmogAvatarChip } from './AlmogPresence';
import { AlmogAssignmentsSection, AlmogCompletedSection } from './AlmogAssignmentsSection';
import { stationCoverAlt } from '../../lib/a11y/alt-text';
import { getIsraelTimeOfDay } from '../../lib/time/greeting';
import { palette as tokens } from '../../lib/theme/tokens';
import { Button } from '../ui';

interface JourneyPageProps {
  groups: JourneyStationGroup[];
  /** נשמר לתאימות עם הקריאה הקיימת ב-page.tsx; בתצוגה החדשה תמיד פותחים בגלריה */
  initialExpandedKey?: string;
  userId: string;
  firstName: string;
  foundationComplete?: boolean;
  hasFoundationStation?: boolean;
  /** deterministic next-step card content from the server (AI text enriches it later) */
  initialNextStep?: NextStepCardData | null;
  /** steps whose task the user is actively practicing (unified task model) — half credit until the step is completed */
  practicingStepIds?: string[];
  /** כל הצעדים המפורסמים — בסיס "X מתוך Y" אחיד בכל האתר (summarizeJourneyProgress) */
  publishedStepIds?: string[];
  completedStepIds?: string[];
}

export function JourneyPage({
  groups,
  userId,
  firstName,
  foundationComplete = true,
  hasFoundationStation = false,
  initialNextStep = null,
  practicingStepIds = [],
  publishedStepIds,
  completedStepIds = [],
}: JourneyPageProps) {
  const [liveProgressByStep, setLiveProgressByStep] = useState<
    Record<string, JourneyStepProgress>
  >({});

  const handleLiveProgress = useCallback((remote: JourneyStepProgress) => {
    setLiveProgressByStep((prev) => ({
      ...prev,
      [remote.step_id]: { ...prev[remote.step_id], ...remote },
    }));
  }, []);

  useJourneyProgressLive(userId, handleLiveProgress);

  const mergedGroups = useMemo(() => {
    if (Object.keys(liveProgressByStep).length === 0) return groups;
    return groups.map((g) => ({
      ...g,
      steps: g.steps.map((s) => {
        const live = liveProgressByStep[s.id];
        if (!live) return s;
        return { ...s, progress: { ...(s.progress ?? {}), ...live } as JourneyStepProgress };
      }),
    }));
  }, [groups, liveProgressByStep]);

  // null = stations gallery view, string = inside a specific station
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const activeGroup = useMemo(
    () => (selectedKey ? mergedGroups.find((g) => g.key === selectedKey) ?? null : null),
    [mergedGroups, selectedKey]
  );

  const practicingSet = useMemo(() => new Set(practicingStepIds), [practicingStepIds]);
  // אגרגציה כללית לכל המסע (תמיד מחושב, לתצוגת ה-HERO)
  const totalAcrossAll = useMemo(
    () =>
      mergedGroups.reduce(
        (acc, g) => ({
          done: acc.done + g.steps.filter((s) => s.progress?.is_completed).length,
          credit:
            acc.credit +
            g.steps.reduce(
              (n, s) => n + (s.progress?.is_completed ? 1 : practicingSet.has(s.id) ? 0.5 : 0),
              0
            ),
          all: acc.all + g.steps.length,
          stations: acc.stations + 1,
          stationsDone:
            acc.stationsDone +
            (g.steps.length > 0 && g.steps.every((s) => s.progress?.is_completed) ? 1 : 0),
        }),
        { done: 0, credit: 0, all: 0, stations: 0, stationsDone: 0 }
      ),
    [mergedGroups, practicingSet]
  );

  /** מספרי ה-HERO מהמקור האחיד (כל הצעדים המפורסמים) — זהים לעמודי התקדמות/תוכנית. */
  const journeySummary = useMemo(() => {
    if (!publishedStepIds?.length) return null;
    const rows = completedStepIds.map((id) => ({ step_id: id, is_completed: true }));
    for (const g of mergedGroups) for (const st of g.steps) if (st.progress?.is_completed) rows.push({ step_id: st.id, is_completed: true });
    return summarizeJourneyProgress(publishedStepIds, rows);
  }, [publishedStepIds, completedStepIds, mergedGroups]);

  const overallPct = journeySummary
    ? journeySummary.pct
    : totalAcrossAll.all
      ? Math.round((totalAcrossAll.credit / totalAcrossAll.all) * 100)
      : 0;

  // ⤵ ימים מאז תחילת המסע — חישוב פר-משתמש (אם יש progress כלשהו)
  const daysInJourney = useMemo(() => computeDaysInJourney(mergedGroups), [mergedGroups]);

  /**
   * גלילה לראש העמוד — תומך גם בדפדפן רגיל (window) וגם בלייאאוט
   * הדסקטופ של הדאשבורד שבו `main#main-content` הוא הקונטיינר
   * הגוללת (עם `overflow-y: auto` ו-`height: calc(100dvh - 80px)`).
   */
  const scrollToTop = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.scrollTo({ top: 0, behavior: 'auto' });
    const main = document.getElementById('main-content');
    if (main) main.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const handleBack = useCallback(() => {
    setSelectedKey(null);
    scrollToTop();
  }, [scrollToTop]);

  /**
   * בכל פעם שמתבצעת כניסה לתחנה — מקפיצים את העמוד לראש,
   * כדי שה-HERO של התחנה (כותרת + כפתור חזרה) יהיה גלוי מיד.
   * שימוש ב-`auto` במקום `smooth` מונע "תזוזה ארוכה" בזמן שהאנימציית
   * shared-element כבר רצה ויוצרת תחושה חלקה.
   */
  const handleSelect = useCallback((key: string) => {
    setSelectedKey(key);
    scrollToTop();
  }, [scrollToTop]);

  // לחיצה על Escape חוזרת לתצוגת הגלריה
  useEffect(() => {
    if (!selectedKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedKey, handleBack]);

  return (
    <PracticingStepsContext.Provider value={practicingSet}>
    <div className="relative pb-10">
      <AnimatePresence mode="wait" initial={false}>
        {selectedKey && activeGroup ? (
          <StationDetailView
            key={`detail-${activeGroup.key}`}
            group={activeGroup}
            onBack={handleBack}
          />
        ) : (
          <GalleryView
            key="gallery"
            firstName={firstName}
            groups={mergedGroups}
            overall={{
              done: journeySummary?.done ?? totalAcrossAll.done,
              all: journeySummary?.total ?? totalAcrossAll.all,
              pct: overallPct,
              stations: totalAcrossAll.stations,
              stationsDone: totalAcrossAll.stationsDone,
            }}
            daysInJourney={daysInJourney}
            onSelect={handleSelect}
            foundationComplete={foundationComplete}
            hasFoundationStation={hasFoundationStation}
            initialNextStep={initialNextStep}
          />
        )}
      </AnimatePresence>
    </div>
    </PracticingStepsContext.Provider>
  );
}

/* ════════════════════════════════════════════════════════════════
   STAGE 1 — GALLERY VIEW
   ════════════════════════════════════════════════════════════════ */

function GalleryView({
  firstName,
  groups,
  overall,
  daysInJourney,
  onSelect,
  foundationComplete,
  hasFoundationStation,
  initialNextStep,
}: {
  firstName: string;
  groups: JourneyStationGroup[];
  overall: { done: number; all: number; pct: number; stations: number; stationsDone: number };
  daysInJourney: number;
  onSelect: (key: string) => void;
  foundationComplete: boolean;
  hasFoundationStation: boolean;
  initialNextStep: NextStepCardData | null;
}) {
  const reduced = useReducedMotion();

  const { activeGroups, completedGroups } = useMemo(() => {
    const active: JourneyStationGroup[] = [];
    const completed: JourneyStationGroup[] = [];
    for (const g of groups) {
      const total = g.steps.length;
      const done = g.steps.filter((s) => s.progress?.is_completed).length;
      if (total > 0 && done === total) completed.push(g);
      else active.push(g);
    }
    return { activeGroups: active, completedGroups: completed };
  }, [groups]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      {/* ═══ HERO ═══ */}
      <HeroSection
        firstName={firstName}
        overall={overall}
        daysInJourney={daysInJourney}
        reduced={!!reduced}
      />

      {/* ═══ BODY ═══ */}
      <div
        style={{
          background: tokens.mint,
          borderRadius: '28px 28px 0 0',
          marginTop: '-22px',
          padding: '26px 16px 32px',
          position: 'relative',
          zIndex: 3,
          minHeight: '50vh',
        }}
      >
        {groups.length === 0 ? (
          <EmptyState firstName={firstName} />
        ) : (
          <>
            {/* 1. הצעד הבא — אלמוג ממליץ מה לעשות עכשיו */}
            <JourneyNextStepCard initial={initialNextStep} />

            {hasFoundationStation &&
            !foundationComplete &&
            !completedGroups.some((g) => g.isFoundation) ? (
              <p className="mb-4 rounded-2xl border border-primary-200/60 bg-primary-50/80 px-4 py-3 text-sm text-primary-900">
                קודם נשלים את <strong>תחנת החובה</strong> — אחר כך אלמוג יפתח שיעורים מותאמים אישית
                בקצב שלך.
              </p>
            ) : null}

            {/* 2. התחנות במסלול — תחנות פעילות */}
            {activeGroups.length > 0 ? (
              <>
                <SectionHeader
                  count={activeGroups.length}
                  completed={0}
                  variant="active"
                />
                <div className="mb-6 space-y-5">
                  {activeGroups.map((g, idx) => (
                    <JourneyStationCard
                      key={g.key}
                      group={g}
                      index={idx}
                      onSelect={() => onSelect(g.key)}
                    />
                  ))}
                </div>
              </>
            ) : null}

            {/* 3. הושלמו — תחנות שסיימת */}
            {completedGroups.length > 0 ? (
              <CompletedSection
                groups={completedGroups}
                onSelect={onSelect}
                stationOffset={activeGroups.length}
              />
            ) : null}

            {/* 4. פאנל אלמוג + באנר אישי */}
            <AlmogAssignmentsSection />
            <AlmogTouchBanner firstName={firstName} overall={overall} />

            {/* 5. משימות אישיות שהושלמו — בתחתית */}
            <AlmogCompletedSection />
          </>
        )}
      </div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════
   HERO — מסך פתיחה מושקע עם הפרטה
   ════════════════════════════════════════════════════════════════ */

function HeroSection({
  firstName,
  overall,
  daysInJourney,
  reduced,
}: {
  firstName: string;
  overall: { done: number; all: number; pct: number; stations: number; stationsDone: number };
  daysInJourney: number;
  reduced: boolean;
}) {
  // ⤵ ברכת זמן יום נחשבת בטעינה — כדי שלא תיווצר אי-התאמה בין SSR וקליינט,
  //   נשמור אותה במצב ונחשב רק אחרי mount.
  const [tod, setTod] = useState<TimeOfDay | null>(null);
  useEffect(() => {
    setTod(getTimeOfDay());
  }, []);

  const intro = useMemo(
    () => buildIntroText(firstName, overall, tod),
    [firstName, overall, tod]
  );

  return (
    <div
      className="-mt-16 pt-16 relative overflow-hidden"
      style={{
        background:
          `linear-gradient(160deg, ${tokens.primary[950]} 0%, ${tokens.primary[900]} 35%, ${tokens.primary[700]} 65%, ${tokens.primary[500]} 92%, ${tokens.primary[400]} 100%)`,
      }}
    >
      {/* ✦ Aurora — מעטה אורות זוהר מונפש שזורם ברקע ה-HERO */}
      <AuroraField reduced={reduced} />

      {/* ✦ Shooting star — חולף מדי כמה שניות, מוסיף תחושת קסם */}
      {!reduced ? <ShootingStar /> : null}

      {/* ✦ Light beam — קרן אור דיאגונלית שעוברת על ה-Hero אחת לפרק זמן ארוך */}
      {!reduced ? <SweepingLightBeam /> : null}

      {!reduced ? <FloatingSparkles /> : null}

      <div className="relative z-10 px-4 pb-14 pt-3 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as const }}
          className="mx-auto max-w-xl"
        >
          {/* ╔═ Eyebrow chips — "המסע שלי" + יום במסע ═╗ */}
          <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.45, delay: 0.12 }}
              className="flex w-fit items-center gap-2 rounded-full px-3.5 py-1.5"
              style={{
                background: 'rgba(255,255,255,0.16)',
                border: '1px solid rgba(255,255,255,0.28)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
              }}
            >
              <Leaf className="h-3.5 w-3.5 shrink-0 text-accent-300" />
              <span className="text-[13px] font-bold text-on-dark">המסע שלי</span>
            </motion.div>

            {daysInJourney > 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.45, delay: 0.2 }}
                className="flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(251,191,36,0.22), rgba(245,158,11,0.18))',
                  border: '1px solid rgba(251,191,36,0.5)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                }}
              >
                <Calendar className="h-3.5 w-3.5 shrink-0 text-accent-200" />
                <span className="text-[12px] font-bold text-accent-50">
                  יום {daysInJourney} במסע
                </span>
              </motion.div>
            ) : null}
          </div>

          {/* ╔═ HEADLINE BLOCK — preamble + NAME + message ═╗
              שלוש שורות עם רווח אחיד ביניהן, ופרופורציה ויזואלית מדורגת:
              ~16px → 56–72px → 22–30px (יחס 1 : 4 : 1.7) */}
          <div className="flex flex-col items-center text-center">
            {/* Preamble — קטן, אלגנטי, מקדים את השם */}
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.18 }}
              className="flex items-center justify-center gap-1.5 text-[15px] font-bold tracking-wide text-primary-100/95 sm:text-[16px]"
              style={{
                textShadow: '0 2px 10px rgba(2,44,34,0.45)',
                fontFamily: "'Rubik','Heebo',sans-serif",
              }}
            >
              {tod ? <TimeOfDayIcon tod={tod} /> : null}
              <span>{intro.preamble}</span>
            </motion.p>

            {/* NAME — הזרקור: שם המשתמש בענק עם הילה זוהבת נושמת מאחור */}
            <div className="relative my-1 sm:my-1.5">
              {/* ✦ הילה זוהבת נושמת מאחורי השם — wow factor */}
              <motion.div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 -z-10"
                style={{
                  width: 'min(520px, 94vw)',
                  height: 'min(220px, 44vw)',
                  transform: 'translate(-50%, -50%)',
                  background:
                    'radial-gradient(ellipse at center, rgba(252,211,77,0.42) 0%, rgba(251,191,36,0.18) 30%, rgba(167,243,208,0.10) 55%, transparent 72%)',
                  filter: 'blur(34px)',
                  mixBlendMode: 'screen',
                }}
                initial={{ scale: 0.85, opacity: 0 }}
                animate={
                  reduced
                    ? { scale: 1, opacity: 0.7 }
                    : { scale: [1, 1.1, 1], opacity: [0.6, 1, 0.6] }
                }
                transition={
                  reduced
                    ? { duration: 0.6, delay: 0.2 }
                    : { duration: 5.5, repeat: Infinity, ease: 'easeInOut' as const }
                }
              />

              <motion.h1
                initial={{ opacity: 0, y: 12, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.7, delay: 0.24, ease: [0.22, 1, 0.36, 1] as const }}
                className="relative text-[56px] font-black leading-[0.98] sm:text-[72px]"
                style={{
                  fontFamily: "'Rubik','Heebo',sans-serif",
                  letterSpacing: '-0.03em',
                  filter:
                    'drop-shadow(0 2px 14px rgba(2,44,34,0.6)) drop-shadow(0 0 32px rgba(252,211,77,0.32))',
                }}
              >
                <ShimmerText reduced={reduced}>{firstName}</ShimmerText>
              </motion.h1>
            </div>

            {/* MESSAGE — משפט הקשרי דינמי, יורש את הקצב של הברכה */}
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.36 }}
              className="flex items-center justify-center gap-2 text-[22px] font-black leading-[1.15] text-on-dark sm:text-[30px]"
              style={{
                fontFamily: "'Rubik','Heebo',sans-serif",
                textShadow: '0 2px 18px rgba(2,44,34,0.55)',
                letterSpacing: '-0.015em',
              }}
            >
              <span>{intro.message}</span>
              <AnimatedSparkle char={intro.sparkle} reduced={reduced} />
            </motion.p>
          </div>

          {/* ╔═ Sub-line — מרווח גדול יותר כדי לסמן "מעבר לבלוק הבא" ═╗ */}
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.46 }}
            className="mx-auto mt-4 max-w-md text-center text-[14px] leading-relaxed text-primary-50/85 sm:mt-5 sm:text-[15px]"
          >
            {intro.subline}
          </motion.p>

          {/* Progress ring + stats */}
          {overall.all > 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.42 }}
              className="mx-auto mt-6 flex max-w-md items-center gap-4 rounded-3xl px-4 py-3.5"
              style={{
                background:
                  'linear-gradient(135deg, rgba(255,255,255,0.16), rgba(255,255,255,0.08))',
                border: '1px solid rgba(255,255,255,0.22)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 22px rgba(2,44,34,0.25)',
              }}
            >
              <ProgressRing pct={overall.pct} reduced={reduced} />
              <div className="min-w-0 flex-1 text-start">
                <p className="text-[11px] font-bold uppercase tracking-wide text-primary-100/85">
                  ככה זה נראה אצלי
                </p>
                <p
                  className="mt-0.5 text-[18px] font-black text-on-dark"
                  style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
                >
                  <CountUp value={overall.done} reduced={reduced} /> מתוך{' '}
                  <CountUp value={overall.all} reduced={reduced} /> צעדים
                </p>
                <p className="mt-0.5 text-[12px] text-primary-50/85">
                  {overall.stationsDone > 0
                    ? `כבר סגרנו ${overall.stationsDone} תחנ${overall.stationsDone === 1 ? 'ה' : 'ות'} — יפה מאוד`
                    : 'כל צעד מקרב אותך — אני איתך'}
                </p>
              </div>
            </motion.div>
          ) : null}

          {/* (צ׳יפים סטטיסטיים הוסרו: כפלו את כרטיס ההתקדמות ואת צ׳יפ "יום N במסע") */}
        </motion.div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   TIME OF DAY — ברכה אישית לפי שעה
   ════════════════════════════════════════════════════════════════ */

type TimeOfDay = {
  greeting: string;
  bucket: 'morning' | 'noon' | 'evening' | 'night';
};

function getTimeOfDay(): TimeOfDay {
  // SSOT: אותה לוגיקת שעון ישראל כמו בדף הבית / תוכנית.
  const tod = getIsraelTimeOfDay();
  return { greeting: tod.greeting, bucket: tod.bucket };
}

function TimeOfDayIcon({ tod }: { tod: TimeOfDay }) {
  if (tod.bucket === 'morning') return <Sunrise className="h-3.5 w-3.5 text-accent-200" />;
  if (tod.bucket === 'noon') return <Sun className="h-3.5 w-3.5 text-accent-200" />;
  if (tod.bucket === 'evening') return <Sunset className="h-3.5 w-3.5 text-energy-200" />;
  return <Moon className="h-3.5 w-3.5 text-iris-200" />;
}

/**
 * בונה את ארבעת מחרוזות ה-HERO לפי שלב במסע ושעת היום:
 *  • preamble — "בוקר טוב," / "צהריים טובים," וכו׳ (אם אין tod, בלי פסיק)
 *  • message  — המשפט ההקשרי הגדול שאחרי השם ("זה הרגע להתחיל", "ממשיכים את המסע" וכו׳)
 *  • sparkle  — סימן/אימוג'י זוהר בסוף המשפט (✿ ✦ 🏆)
 *  • subline  — טקסט המעודד מתחת
 */
function buildIntroText(
  _firstName: string,
  overall: { done: number; all: number; pct: number; stations: number; stationsDone: number },
  tod: TimeOfDay | null
): { preamble: string; message: string; sparkle: string; subline: string } {
  const preamble = tod ? `${tod.greeting},` : 'שלום,';

  if (overall.all === 0) {
    return {
      preamble,
      message: 'אני מחכה לך כאן',
      sparkle: '✿',
      subline:
        'כשתרצה נצא לדרך — אני אכין לך תחנות, צעדים והרגלים שמתאימים לחיים שלך.',
    };
  }
  if (overall.done === 0) {
    return {
      preamble,
      message: 'בוא נתחיל ביחד',
      sparkle: '✿',
      subline:
        tod?.bucket === 'morning'
          ? 'יש לי תחנה שמחכה לך. ניכנס אליה בקצב שלך — אני איתך.'
          : tod?.bucket === 'night'
            ? 'גם עכשיו זה זמן טוב. תבחר תחנה ואני אהיה פה איתך.'
            : 'תבחר תחנה ונצא לדרך — צעד אחד, בלי למהר.',
    };
  }
  if (overall.pct >= 100) {
    return {
      preamble,
      message: 'סיימת הכל!',
      sparkle: '🏆',
      subline:
        'אני באמת גאה בך. אפשר לחזור ולהתבונן, או פשוט לשמור על מה שבנית.',
    };
  }
  if (overall.pct >= 60) {
    return {
      preamble,
      message: 'אנחנו כבר שם כמעט',
      sparkle: '✿',
      subline:
        'ראיתי כמה השקעת — עברת יותר ממחצית. עוד צעד קטן ואנחנו שם.',
    };
  }
  if (overall.pct >= 30) {
    return {
      preamble,
      message: 'אתה בדרך הנכונה',
      sparkle: '✿',
      subline: 'אני רואה שזה מתחיל להתיישב. נמשיך בקצב שלך — אני פה.',
    };
  }
  return {
    preamble,
    message: 'נמשיך מכאן',
    sparkle: '✿',
    subline:
      tod?.bucket === 'morning'
        ? 'בוקר טוב. תבחר תחנה ונמשיך — אני איתך.'
        : 'תבחר תחנה ונמשיך יחד. אני פה אם משהו יעלה.',
  };
}

/* ════════════════════════════════════════════════════════════════
   SHIMMER TEXT — טקסט עם שיפוע זהב מונפש (השימוש: השם של המשתמש)
   ════════════════════════════════════════════════════════════════ */

function ShimmerText({
  children,
  reduced,
}: {
  children: React.ReactNode;
  reduced: boolean;
}) {
  return (
    <motion.span
      className="inline-block"
      style={{
        backgroundImage:
          `linear-gradient(110deg, ${tokens.backgroundCard} 0%, ${tokens.accent[100]} 22%, ${tokens.accent[200]} 38%, ${tokens.backgroundCard} 50%, ${tokens.warmLight} 62%, ${tokens.backgroundCard} 100%)`,
        backgroundSize: '300% 100%',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        color: 'transparent',
      }}
      animate={reduced ? {} : { backgroundPositionX: ['200%', '0%'] }}
      transition={{ duration: 6.5, repeat: Infinity, ease: 'linear' as const }}
    >
      {children}
    </motion.span>
  );
}

/* ════════════════════════════════════════════════════════════════
   ANIMATED SPARKLE — תו זוהר ליד המשפט שמסתובב ונושם בעדינות
   ════════════════════════════════════════════════════════════════ */

function AnimatedSparkle({ char, reduced }: { char: string; reduced: boolean }) {
  return (
    <motion.span
      className="inline-block"
      style={{
        textShadow:
          '0 0 14px rgba(252,211,77,0.7), 0 0 4px rgba(242,242,246,0.85)',
      }}
      animate={
        reduced
          ? {}
          : {
              rotate: [0, 12, -8, 0],
              scale: [1, 1.18, 0.95, 1],
            }
      }
      transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' as const }}
    >
      {char}
    </motion.span>
  );
}

/* ════════════════════════════════════════════════════════════════
   HELPERS — חישובי מצב אישיים
   ════════════════════════════════════════════════════════════════ */

/** מחשב כמה ימים עברו מאז שהמשתמש פתח את הצעד הראשון שלו (לפי created_at של progress) */
function computeDaysInJourney(groups: JourneyStationGroup[]): number {
  let earliest: number | null = null;
  for (const g of groups) {
    for (const s of g.steps) {
      const ts = s.progress?.created_at;
      if (!ts) continue;
      const t = new Date(ts).getTime();
      if (!Number.isFinite(t)) continue;
      if (earliest === null || t < earliest) earliest = t;
    }
  }
  if (earliest === null) return 0;
  const diffMs = Date.now() - earliest;
  if (diffMs < 0) return 1;
  return Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1);
}

/** טבעת התקדמות מונפשת (SVG) — wow factor עדין ב-HERO */
function ProgressRing({ pct, reduced }: { pct: number; reduced: boolean }) {
  const size = 64;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={tokens.primary[200]} />
            <stop offset="60%" stopColor={tokens.primary[400]} />
            <stop offset="100%" stopColor={tokens.accent[400]} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          initial={reduced ? false : { strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] as const }}
          style={{
            strokeDasharray: circumference,
            filter: 'drop-shadow(0 0 6px rgba(207,208,214,0.6))',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="text-[15px] font-black text-on-dark"
          style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
        >
          <CountUp value={pct} reduced={reduced} duration={1.1} />%
        </span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   COUNT-UP — מספר שמתנפח מ-0 ליעד עם easing עדין (delight קטן)
   ════════════════════════════════════════════════════════════════ */

function CountUp({
  value,
  duration = 1.2,
  reduced,
}: {
  value: number;
  duration?: number;
  reduced?: boolean;
}) {
  const [display, setDisplay] = useState(reduced ? value : 0);

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      return;
    }
    if (value === 0) {
      setDisplay(0);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const elapsed = (now - start) / 1000;
      const t = Math.min(1, elapsed / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(value * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduced]);

  return <>{display}</>;
}

/* ════════════════════════════════════════════════════════════════
   AURORA FIELD — שכבת אור מונפשת שזורמת ברקע (THE wow factor)
   ════════════════════════════════════════════════════════════════ */

function AuroraField({ reduced }: { reduced: boolean }) {
  // אם המשתמש מבקש פחות תנועה — נשמור מראה סטטי (לא מהבהב, לא זז).
  const orbs = useMemo(
    () => [
      {
        c: 'rgba(207,208,214,0.55)',
        size: 380,
        left: '-8%',
        top: '4%',
        dur: 18,
        delay: 0,
        x: [0, 36, -18, 0],
        y: [0, -28, 22, 0],
      },
      {
        c: 'rgba(251,191,36,0.32)',
        size: 320,
        left: '58%',
        top: '38%',
        dur: 22,
        delay: 2.5,
        x: [0, -30, 24, 0],
        y: [0, 22, -20, 0],
      },
      {
        c: 'rgba(110,231,183,0.42)',
        size: 360,
        left: '24%',
        top: '62%',
        dur: 26,
        delay: 5,
        x: [0, 28, -32, 0],
        y: [0, -22, 18, 0],
      },
      {
        c: 'rgba(56,189,248,0.22)',
        size: 280,
        left: '70%',
        top: '-10%',
        dur: 20,
        delay: 3.5,
        x: [0, -22, 18, 0],
        y: [0, 26, -14, 0],
      },
    ],
    []
  );

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ mixBlendMode: 'screen' }}
    >
      {orbs.map((o, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: o.size,
            height: o.size,
            left: o.left,
            top: o.top,
            background: `radial-gradient(circle, ${o.c} 0%, transparent 65%)`,
            filter: 'blur(48px)',
            willChange: 'transform',
          }}
          initial={false}
          animate={
            reduced
              ? {}
              : {
                  x: o.x,
                  y: o.y,
                  scale: [1, 1.12, 0.95, 1],
                }
          }
          transition={{
            duration: o.dur,
            delay: o.delay,
            repeat: Infinity,
            ease: 'easeInOut' as const,
          }}
        />
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   SWEEPING LIGHT BEAM — קרן אור דיאגונלית שסורקת את ה-Hero
   ════════════════════════════════════════════════════════════════ */

function SweepingLightBeam() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute -top-1/4 h-[150%] w-[180px]"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 25%, rgba(167,243,208,0.18) 48%, rgba(252,211,77,0.16) 55%, rgba(255,255,255,0.06) 75%, transparent 100%)',
          filter: 'blur(10px)',
          transform: 'skewX(-14deg)',
          mixBlendMode: 'screen',
        }}
        initial={{ left: '-25%' }}
        animate={{ left: ['-25%', '120%'] }}
        transition={{
          duration: 4.5,
          ease: [0.45, 0, 0.55, 1] as const,
          repeat: Infinity,
          repeatDelay: 9,
        }}
      />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   SHOOTING STAR — כוכב נופל שחולף באלכסון מדי כמה שניות
   ════════════════════════════════════════════════════════════════ */

function ShootingStar() {
  // שלוש "תחנות זמן" אקראיות-ידניות שיוצרות תחושה לא מחזורית של כוכב נופל.
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute"
        style={{
          top: '22%',
          left: '110%',
          width: 140,
          height: 2,
          background:
            'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(242,242,246,0.95) 60%, rgba(207,208,214,0.95) 100%)',
          borderRadius: 9999,
          filter: 'drop-shadow(0 0 6px rgba(242,242,246,0.95)) drop-shadow(0 0 14px rgba(207,208,214,0.7))',
          transform: 'rotate(-18deg)',
        }}
        initial={{ x: 0, opacity: 0 }}
        animate={{
          x: ['-0%', '-130%', '-130%'],
          opacity: [0, 1, 0],
        }}
        transition={{
          duration: 1.6,
          times: [0, 0.6, 1],
          repeat: Infinity,
          repeatDelay: 7,
          ease: 'easeOut' as const,
        }}
      />
      <motion.div
        className="absolute"
        style={{
          top: '52%',
          left: '110%',
          width: 110,
          height: 2,
          background:
            'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(242,242,246,0.85) 60%, rgba(251,191,36,0.9) 100%)',
          borderRadius: 9999,
          filter: 'drop-shadow(0 0 6px rgba(242,242,246,0.9)) drop-shadow(0 0 14px rgba(251,191,36,0.6))',
          transform: 'rotate(-12deg)',
        }}
        initial={{ x: 0, opacity: 0 }}
        animate={{
          x: ['-0%', '-140%', '-140%'],
          opacity: [0, 1, 0],
        }}
        transition={{
          duration: 1.8,
          times: [0, 0.55, 1],
          repeat: Infinity,
          repeatDelay: 11,
          delay: 4,
          ease: 'easeOut' as const,
        }}
      />
    </div>
  );
}

/** ניצוצות זוהרים שצפים ברקע ה-HERO */
function FloatingSparkles() {
  const sparkles = useMemo(
    () =>
      Array.from({ length: 14 }).map((_, i) => ({
        id: i,
        left: `${(i * 73) % 100}%`,
        top: `${(i * 41) % 90}%`,
        size: 3 + (i % 4),
        delay: (i % 7) * 0.4,
        duration: 4 + (i % 5),
      })),
    []
  );

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {sparkles.map((s) => (
        <motion.span
          key={s.id}
          className="absolute rounded-full"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            background: 'rgba(242,242,246,0.9)',
            boxShadow:
              '0 0 8px rgba(207,208,214,0.85), 0 0 14px rgba(110,231,183,0.6)',
          }}
          initial={{ opacity: 0.15, y: 0, scale: 0.7 }}
          animate={{
            opacity: [0.15, 0.95, 0.15],
            y: [-3, -18, -3],
            scale: [0.7, 1.2, 0.7],
          }}
          transition={{
            duration: s.duration,
            delay: s.delay,
            repeat: Infinity,
            ease: 'easeInOut' as const,
          }}
        />
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   SECTION HEADER + EMPTY STATE
   ════════════════════════════════════════════════════════════════ */

function SectionHeader({
  count,
  completed,
  variant = 'all',
}: {
  count: number;
  completed: number;
  variant?: 'active' | 'all';
}) {
  return (
    <div className="mb-5 flex items-center gap-3 px-1">
      <div
        className="h-7 w-1.5 shrink-0 rounded-full"
        style={{ background: `linear-gradient(to bottom, ${tokens.primary[300]}, ${tokens.primary[700]})` }}
      />
      <div className="flex-1 text-start">
        <p
          className="text-[17px] font-black"
          style={{ color: tokens.ink, fontFamily: "'Rubik','Heebo',sans-serif" }}
        >
          התחנות שמחכות לך
        </p>
        <p className="mt-0.5 text-xs text-primary-800/70">
          {variant === 'active'
            ? count === 1
              ? 'יש תחנה אחת — בוא ניכנס אליה'
              : `יש לך ${count} תחנות פתוחות — תבחר ונמשיך`
            : `${count} תחנות · ${completed} הושלמו`}
        </p>
      </div>
    </div>
  );
}

function CompletedSection({
  groups,
  onSelect,
  stationOffset,
}: {
  groups: JourneyStationGroup[];
  onSelect: (key: string) => void;
  stationOffset: number;
}) {
  const [expanded, setExpanded] = useState(groups.length <= 2);

  if (groups.length === 0) return null;

  const shown = expanded ? groups : groups.slice(0, 2);

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center gap-3 px-1">
        <div
          className="h-7 w-1.5 shrink-0 rounded-full"
          style={{ background: `linear-gradient(to bottom, ${tokens.primary[200]}, ${tokens.primary[400]})` }}
        />
        <div className="flex-1 text-start">
          <p
            className="text-[17px] font-black"
            style={{ color: tokens.ink, fontFamily: "'Rubik','Heebo',sans-serif" }}
          >
            כבר סגרנו את אלה
          </p>
          <p className="mt-0.5 text-xs text-primary-800/70">
            {groups.length === 1
              ? 'תחנה אחת מאחוריך — כל הכבוד'
              : `${groups.length} תחנות מאחוריך — אני גאה בך`}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {shown.map((g, idx) => (
          <JourneyStationCard
            key={g.key}
            group={g}
            index={stationOffset + idx}
            onSelect={() => onSelect(g.key)}
          />
        ))}
      </div>

      {!expanded && groups.length > 2 ? (
        <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => setExpanded(true)}>
          הצג עוד ({groups.length - 2} תחנות)
        </Button>
      ) : null}
    </div>
  );
}

function EmptyState({ firstName }: { firstName: string }) {
  return (
    <div className="glass-surface rounded-3xl px-6 py-16 text-center">
      <Droplets className="mx-auto mb-4 h-12 w-12 text-primary-300" />
      <h3 className="mb-2 text-xl font-black" style={{ color: tokens.ink }}>
        {firstName}, אני מחכה לך כאן
      </h3>
      <p className="text-sm text-ink-500">
        כשיצטרפו תחנות — אני אדאג שיופיעו פה בדיוק בשבילך
      </p>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   ALMOG TOUCH BANNER — באנר זכוכית כהה, אישי ואנושי
   ════════════════════════════════════════════════════════════════ */

function AlmogTouchBanner({
  firstName,
  overall,
}: {
  firstName: string;
  overall: { done: number; all: number; pct: number; stations: number; stationsDone: number };
}) {
  const message = useMemo(() => buildAlmogMessage(firstName, overall), [firstName, overall]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.18, ease: [0.22, 1, 0.36, 1] as const }}
      className="relative mt-7 overflow-hidden rounded-[28px]"
      style={{
        // זכוכית ירוקה כהה — שקופה, עם blur ו-saturate כדי לקבל אפקט "tinted glass"
        background:
          'linear-gradient(135deg, rgba(6,78,59,0.92) 0%, rgba(4,120,87,0.88) 50%, rgba(2,44,34,0.94) 100%)',
        backdropFilter: 'blur(18px) saturate(150%)',
        WebkitBackdropFilter: 'blur(18px) saturate(150%)',
        border: '1px solid rgba(167,243,208,0.32)',
        boxShadow:
          '0 16px 38px rgba(2,44,34,0.28), 0 2px 10px rgba(2,44,34,0.10), inset 0 1px 0 rgba(255,255,255,0.18)',
      }}
    >
      {/* ✦ זוהר זהב עדין מאחורי האווטאר */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-s-10 -top-10 h-40 w-40 rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(251,191,36,0.35) 0%, rgba(251,191,36,0.10) 40%, transparent 70%)',
          filter: 'blur(22px)',
        }}
      />
      {/* ✦ זוהר ירוק עדין בצד שני */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-e-12 -bottom-12 h-44 w-44 rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(110,231,183,0.30) 0%, transparent 70%)',
          filter: 'blur(28px)',
        }}
      />

      <div
        dir="rtl"
        className="relative flex items-center gap-4 px-4 py-4 sm:px-5 sm:py-5"
      >
        <AlmogAvatarChip size={52} />
        <div className="min-w-0 flex-1">
          <p
            className="text-[10.5px] font-black uppercase tracking-[0.14em] text-primary-200/90"
            style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
          >
            ממני, אלמוג
          </p>
          <p
            className="mt-1.5 text-[14.5px] font-bold leading-relaxed text-on-dark"
            style={{
              fontFamily: "'Rubik','Heebo',sans-serif",
              textShadow: '0 1px 6px rgba(2,44,34,0.45)',
            }}
          >
            {message}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * הודעת אלמוג — אנושית, בגוף ראשון, בלי קלישאות שיווקיות.
 * אורך קצר, נימה חמה ולא לחוצה.
 */
function buildAlmogMessage(
  firstName: string,
  overall: { done: number; all: number; pct: number; stations: number; stationsDone: number }
): string {
  if (overall.all === 0) {
    return `${firstName}, אין פה מירוץ. תגיד לי מתי אתה מוכן ונצא יחד.`;
  }
  if (overall.done === 0) {
    return `${firstName}, הצעד הראשון תמיד הכי קשה — אני פה איתך, באמת.`;
  }
  if (overall.pct >= 100) {
    return `${firstName}, סיימת הכל. אני גאה בך — עכשיו רק לשמור על מה שבנית.`;
  }
  if (overall.pct >= 60) {
    return `${firstName}, אני רואה כמה השקעת. נמשיך יחד, בקצב שלך.`;
  }
  if (overall.pct >= 30) {
    return `היי ${firstName}, זה מתחיל להתיישב יפה. אני פה אם משהו יעלה.`;
  }
  return `${firstName}, צעד אחד בכל פעם. אני לא הולך לשום מקום.`;
}

/* ════════════════════════════════════════════════════════════════
   STAGE 2 — STATION DETAIL VIEW (cover header + steps list)
   ════════════════════════════════════════════════════════════════ */

function StationDetailView({
  group,
  onBack,
}: {
  group: JourneyStationGroup;
  onBack: () => void;
}) {
  const steps = group.steps;
  const credit = useStepCredit();
  const completedCount = steps.filter((s) => s.progress?.is_completed).length;
  const totalCount = steps.length;
  const pct = totalCount ? Math.round((steps.reduce((n, s) => n + credit(s), 0) / totalCount) * 100) : 0;
  const allDone = totalCount > 0 && completedCount === totalCount;

  // אינדקס הצעד הבא הפעיל (הראשון שלא הושלם)
  const activeIndex = useMemo(() => steps.findIndex((s) => !s.progress?.is_completed), [steps]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <StationHeader group={group} onBack={onBack} pct={pct} allDone={allDone} />

      <div
        style={{
          background: tokens.mint,
          borderRadius: '28px 28px 0 0',
          marginTop: '-22px',
          padding: '24px 16px 40px',
          position: 'relative',
          zIndex: 3,
          minHeight: '50vh',
        }}
      >
        <motion.div
          dir="rtl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="glass-surface relative mb-5 overflow-hidden rounded-[22px]"
        >
          {/* ✦ קו אור עליון — specular highlight */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-4 top-px h-px"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(242,242,246,0.85), transparent)',
            }}
          />

          <div className="relative flex items-center justify-between gap-3 px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <div
                className="h-8 w-1.5 rounded-full"
                style={{
                  background: `linear-gradient(to bottom, ${tokens.primary[400]}, ${tokens.primary[700]})`,
                  boxShadow: '0 0 8px rgba(52,211,153,0.55)',
                }}
              />
              <div className="text-start">
                <p
                  className="text-[11px] font-black uppercase tracking-[0.12em] text-primary-700"
                  style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
                >
                  הצעדים בתחנה
                </p>
                <p
                  className="mt-0.5 text-[15px] font-black text-primary-950"
                  style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
                >
                  {completedCount} מתוך {totalCount} הושלמו
                </p>
              </div>
            </div>

            {allDone ? (
              <div
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black text-on-dark"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(245,158,11,0.95), rgba(251,191,36,0.95))',
                  boxShadow:
                    '0 6px 16px rgba(245,158,11,0.4), inset 0 1px 0 rgba(255,255,255,0.35)',
                }}
              >
                <Trophy className="h-3.5 w-3.5" />
                תחנה הושלמה
              </div>
            ) : (
              <div className="glass-pill flex items-center gap-2 rounded-full px-3 py-1.5">
                <span
                  className="text-[13px] font-black text-primary-700 tabular-nums"
                  style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
                >
                  {pct}%
                </span>
              </div>
            )}
          </div>
        </motion.div>

        {totalCount === 0 ? (
          <p
            className="glass-inset rounded-2xl py-6 text-center text-sm text-ink-500"
            style={{ borderStyle: 'dashed', borderColor: 'rgba(110,231,183,0.55)' }}
          >
            בתחנה הזו עדיין אין צעדים — זה יתעדכן מיד כשהתוכן יתפרסם.
          </p>
        ) : (
          <StepsTimeline
            steps={steps}
            activeIndex={activeIndex}
            linearLock={group.isFoundation}
          />
        )}
      </div>
    </motion.div>
  );
}

function StationHeader({
  group,
  onBack,
  pct,
  allDone,
}: {
  group: JourneyStationGroup;
  onBack: () => void;
  pct: number;
  allDone: boolean;
}) {
  const [scrollY, setScrollY] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [reduced]);

  const parallax = Math.min(60, scrollY * 0.25);

  return (
    <>
      {/* ╔═ FIXED Top bar — כפתור חזרה זכוכיתי שגולל יחד עם המסך ═╗
          ממוקם מחוץ ל-motion.div של ה-layoutId כדי ש:
          1) האנימציית shared-element לא תפגע בהופעתו
          2) `position: fixed` יישאר ביחס ל-viewport גם כשגוללים למטה
          רקע עדין מאחורי הבר עוזר לקריאות כשגוללים מעל גוף הדף הבהיר. */}
      <div
        className="fixed inset-x-0 top-0 z-50 flex items-center justify-between px-4 sm:px-6"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)', paddingBottom: 10 }}
      >
        {/* scrim — חזק רק מעל גוף הדף הבהיר; מעל התמונה הכהה כמעט בלתי-מורגש */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10"
          style={{
            height: 'calc(env(safe-area-inset-top) + 64px)',
            background:
              'linear-gradient(180deg, rgba(2,44,34,0.30) 0%, rgba(2,44,34,0.10) 60%, rgba(2,44,34,0) 100%)',
          }}
        />

        <PageBackButton onClick={onBack} label="חזרה למסע" ariaLabel="חזרה לרשימת התחנות" />

        {allDone ? (
          <div
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-black text-on-dark shadow-sm"
            style={{
              background:
                'linear-gradient(135deg, rgba(245,158,11,0.95), rgba(251,191,36,0.95))',
            }}
          >
            <Trophy className="h-3 w-3" />
            הושלם
          </div>
        ) : null}
      </div>

      <div className="relative -mt-16 overflow-hidden">
      <motion.div
        layoutId={`station-cover-${group.key}`}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] as const }}
        className="relative w-full overflow-hidden"
        style={{ height: 'min(58vh, 420px)', minHeight: 300 }}
      >
        {group.coverImageUrl ? (
          <img
            src={group.coverImageUrl}
            alt={stationCoverAlt(group.title)}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ transform: `translate3d(0, ${parallax}px, 0) scale(1.08)` }}
            loading="eager"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background:
                `linear-gradient(135deg, ${tokens.primary[950]} 0%, ${tokens.primary[900]} 45%, ${tokens.primary[700]} 80%, ${tokens.primary[500]} 100%)`,
            }}
          />
        )}

        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(2,44,34,0.55) 0%, rgba(2,44,34,0.35) 35%, rgba(6,15,23,0.85) 100%)',
          }}
        />

        {/* Title block at bottom */}
        <div className="absolute bottom-0 inset-e-0 inset-s-0 z-10 px-4 pb-8 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.15 }}
            className="mx-auto max-w-xl text-start"
          >
            <div className="mb-2 flex items-center gap-2">
              <div
                className="flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-bold text-on-dark"
                style={{
                  background: 'rgba(255,255,255,0.18)',
                  border: '1px solid rgba(255,255,255,0.28)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                }}
              >
                <Leaf className="h-3 w-3 text-accent-300" />
                תחנה במסע
              </div>
            </div>
            <h1
              className="text-start text-[28px] font-black leading-tight text-on-dark drop-shadow-lg sm:text-[34px]"
              style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
            >
              {group.title}
            </h1>
            {group.description ? (
              <p className="mt-2 line-clamp-3 text-start text-sm leading-relaxed text-on-dark/90 sm:text-base">
                {group.description}
              </p>
            ) : null}

            <div className="mt-4">
              <div
                className="h-2 overflow-hidden rounded-full"
                style={{ background: 'rgba(255,255,255,0.22)' }}
              >
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] as const }}
                  className="h-full rounded-full"
                  style={{
                    background: `linear-gradient(90deg, ${tokens.primary[200]}, ${tokens.primary[400]} 60%, ${tokens.accent[400]})`,
                    boxShadow: '0 0 10px rgba(207,208,214,0.6)',
                  }}
                />
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>
      </div>
    </>
  );
}

/* ════════════════════════════════════════════════════════════════
   STEPS TIMELINE — נשמר הקונספט הקיים, רק מרענן ויזואלית
   ════════════════════════════════════════════════════════════════ */

function StepsTimeline({
  steps,
  activeIndex,
  linearLock = true,
}: {
  steps: JourneyStepWithProgress[];
  activeIndex: number;
  linearLock?: boolean;
}) {
  const [expandedDesc, setExpandedDesc] = useState<Record<string, boolean>>({});

  return (
    <div className="relative">
      <div
        className="absolute inset-s-[23px] top-0 bottom-0 w-0.5"
        style={{ background: `linear-gradient(to bottom, ${tokens.primary[500]}, ${tokens.primary[100]}, transparent)` }}
      />

      <div className="space-y-4">
        {steps.map((step, index) => {
          const isCompleted = Boolean(step.progress?.is_completed);
          const isActive = index === activeIndex;
          const isLocked = linearLock ? !isCompleted && !isActive : false;
          const descExpanded = Boolean(expandedDesc[step.id]);

          return (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.1 + index * 0.06 }}
            >
              <Link
                href={isLocked ? '#' : `/journey/${step.id}`}
                className={`block relative ps-14 ${isLocked ? 'pointer-events-none opacity-60' : ''}`}
                aria-disabled={isLocked}
              >
                <div className="absolute inset-s-[12px] top-5 z-10">
                  <div
                    className="flex h-[22px] w-[22px] items-center justify-center rounded-full"
                    style={{
                      background: isCompleted ? tokens.primary[500] : isActive ? tokens.backgroundCard : tokens.neutral[300],
                      border: isCompleted
                        ? `3px solid ${tokens.primary[500]}`
                        : isActive
                          ? `3px solid ${tokens.primary[500]}`
                          : `3px solid ${tokens.neutral[300]}`,
                      boxShadow: isActive ? '0 0 14px rgba(16,185,129,0.55)' : 'none',
                    }}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-3 w-3 text-on-dark" />
                    ) : isActive ? (
                      <motion.div
                        className="h-2 w-2 rounded-full bg-primary-500"
                        animate={{ scale: [1, 1.4, 1] }}
                        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' as const }}
                      />
                    ) : (
                      <Lock className="h-2.5 w-2.5 text-ink-400" />
                    )}
                  </div>
                </div>

                <div
                  className="glass-surface overflow-hidden rounded-2xl transition-all duration-200 hover:scale-[1.01] active:scale-[0.98]"
                  style={
                    isActive
                      ? {
                          border: '1.5px solid rgba(16,185,129,0.45)',
                          boxShadow:
                            '0 10px 28px rgba(16,185,129,0.22), inset 0 1px 0 rgba(242,242,246,0.65), inset 0 -1px 0 rgba(255,255,255,0.10), 0 0 0 4px rgba(16,185,129,0.08)',
                        }
                      : undefined
                  }
                >
                  <div className="p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span
                        className="rounded-full px-2.5 py-1 text-xs font-bold"
                        style={{
                          background: isCompleted
                            ? 'rgba(16,185,129,0.12)'
                            : isActive
                              ? 'rgba(16,185,129,0.12)'
                              : 'rgba(0,0,0,0.04)',
                          color: isCompleted ? tokens.primary[600] : isActive ? tokens.primary[700] : tokens.neutral[400],
                        }}
                      >
                        שלב {step.step_number}
                      </span>
                      {step.duration_minutes ? (
                        <span className="text-xs text-ink-400">
                          {step.duration_minutes} דקות
                        </span>
                      ) : null}
                      {isCompleted ? (
                        <span className="ms-auto flex items-center gap-1 text-xs font-bold text-primary-600">
                          <CheckCircle2 className="h-3 w-3" /> הושלם ✨
                        </span>
                      ) : null}
                    </div>

                    <h3
                      className="mb-1.5 text-[17px] font-black leading-snug"
                      style={{ color: tokens.ink, fontFamily: "'Rubik','Heebo',sans-serif" }}
                    >
                      {step.title}
                    </h3>

                    {step.description ? (
                      <div>
                        <p
                          className={[
                            'text-sm leading-relaxed text-ink-500',
                            descExpanded ? '' : 'line-clamp-2',
                          ].join(' ')}
                        >
                          {step.description}
                        </p>
                        {step.description.trim().length > 90 ? (
                          <button
                            type="button"
                            className="mt-1 text-xs font-bold text-primary-700 underline-offset-2 hover:underline"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setExpandedDesc((prev) => ({
                                ...prev,
                                [step.id]: !prev[step.id],
                              }));
                            }}
                            aria-expanded={descExpanded}
                          >
                            {descExpanded ? 'הצג פחות' : 'הצג במלואו'}
                          </button>
                        ) : null}
                      </div>
                    ) : null}

                    {isActive ? (
                      <div className="mt-3 flex items-center gap-2">
                        <div
                          className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-on-dark"
                          style={{
                            background: `linear-gradient(135deg, ${tokens.primary[700]}, ${tokens.primary[500]})`,
                            boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
                          }}
                        >
                          <Play className="h-3.5 w-3.5" fill="#f2f2f6" />
                          <span>בוא נתחיל!</span>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {step.progress && !isCompleted ? (
                    <div style={{ height: 3, background: 'rgba(16,185,129,0.1)' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${getSectionProgress(step.progress)}%`,
                          background: `linear-gradient(90deg, ${tokens.primary[700]}, ${tokens.primary[500]})`,
                          borderRadius: '0 4px 4px 0',
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function getSectionProgress(progress: JourneyStepWithProgress['progress']): number {
  if (!progress) return 0;
  const sections = ['video', 'quiz', 'game', 'commitment', 'summary'];
  const currentIndex = sections.indexOf(progress.last_section);
  return Math.round(((currentIndex + 1) / sections.length) * 100);
}
