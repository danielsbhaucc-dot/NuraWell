'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JourneyStepProgress } from '../../lib/types/journey';
import { useJourneyProgressLive } from '../../lib/journey/use-journey-progress-live';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  CheckCircle2,
  Lock,
  Play,
  Sparkles,
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
import { JourneyNextStepCard } from './JourneyNextStepCard';
import { AlmogAvatarChip } from './AlmogPresence';
import { AlmogAssignmentsSection, AlmogCompletedSection } from './AlmogAssignmentsSection';
import { stationCoverAlt } from '../../lib/a11y/alt-text';

interface JourneyPageProps {
  groups: JourneyStationGroup[];
  /** נשמר לתאימות עם הקריאה הקיימת ב-page.tsx; בתצוגה החדשה תמיד פותחים בגלריה */
  initialExpandedKey?: string;
  userId: string;
  firstName: string;
}

export function JourneyPage({ groups, userId, firstName }: JourneyPageProps) {
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

  // אגרגציה כללית לכל המסע (תמיד מחושב, לתצוגת ה-HERO)
  const totalAcrossAll = useMemo(
    () =>
      mergedGroups.reduce(
        (acc, g) => ({
          done: acc.done + g.steps.filter((s) => s.progress?.is_completed).length,
          all: acc.all + g.steps.length,
          stations: acc.stations + 1,
          stationsDone:
            acc.stationsDone +
            (g.steps.length > 0 && g.steps.every((s) => s.progress?.is_completed) ? 1 : 0),
        }),
        { done: 0, all: 0, stations: 0, stationsDone: 0 }
      ),
    [mergedGroups]
  );

  const overallPct = totalAcrossAll.all
    ? Math.round((totalAcrossAll.done / totalAcrossAll.all) * 100)
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
              done: totalAcrossAll.done,
              all: totalAcrossAll.all,
              pct: overallPct,
              stations: totalAcrossAll.stations,
              stationsDone: totalAcrossAll.stationsDone,
            }}
            daysInJourney={daysInJourney}
            onSelect={handleSelect}
          />
        )}
      </AnimatePresence>
    </div>
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
}: {
  firstName: string;
  groups: JourneyStationGroup[];
  overall: { done: number; all: number; pct: number; stations: number; stationsDone: number };
  daysInJourney: number;
  onSelect: (key: string) => void;
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
          background: '#EDF5F0',
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
            <JourneyNextStepCard />

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

            {/* 3. הושלמו — תחנות ומשימות אישיות שסיימת */}
            {completedGroups.length > 0 ? (
              <CompletedSection
                groups={completedGroups}
                onSelect={onSelect}
                stationOffset={activeGroups.length}
              />
            ) : null}
            <AlmogCompletedSection />

            {/* 4. שאר העמוד — פאנל אלמוג בתחתית + באנר אישי */}
            <AlmogAssignmentsSection />
            <AlmogTouchBanner firstName={firstName} overall={overall} />
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
          'linear-gradient(160deg, #022c22 0%, #064e3b 35%, #047857 65%, #10b981 92%, #34d399 100%)',
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
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
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
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-300" />
              <span className="text-[13px] font-bold text-white">המסע שלי</span>
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
                <Calendar className="h-3.5 w-3.5 shrink-0 text-amber-200" />
                <span className="text-[12px] font-bold text-amber-50">
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
              className="flex items-center justify-center gap-1.5 text-[15px] font-bold tracking-wide text-emerald-100/95 sm:text-[16px]"
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
                    : { duration: 5.5, repeat: Infinity, ease: 'easeInOut' }
                }
              />

              <motion.h1
                initial={{ opacity: 0, y: 12, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.7, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
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
              className="flex items-center justify-center gap-2 text-[22px] font-black leading-[1.15] text-white sm:text-[30px]"
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
            className="mx-auto mt-4 max-w-md text-center text-[14px] leading-relaxed text-emerald-50/85 sm:mt-5 sm:text-[15px]"
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
              <div className="min-w-0 flex-1 text-right">
                <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-100/85">
                  כך נראית ההתקדמות שלך
                </p>
                <p
                  className="mt-0.5 text-[18px] font-black text-white"
                  style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
                >
                  <CountUp value={overall.done} reduced={reduced} /> מתוך{' '}
                  <CountUp value={overall.all} reduced={reduced} /> צעדים
                </p>
                <p className="mt-0.5 text-[12px] text-emerald-50/85">
                  {overall.stationsDone > 0
                    ? `כבר סיימת ${overall.stationsDone} תחנ${overall.stationsDone === 1 ? 'ה' : 'ות'} — אני רואה את זה ✦`
                    : 'כל צעד מקרב אותך — אני איתך'}
                </p>
              </div>
            </motion.div>
          ) : null}

          {/* צ׳יפים סטטיסטיים אישיים */}
          {overall.all > 0 ? (
            <StatChips overall={overall} daysInJourney={daysInJourney} />
          ) : null}
        </motion.div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   STAT CHIPS — שורת הישגים אישיים מתחת ל-progress card
   ════════════════════════════════════════════════════════════════ */

function StatChips({
  overall,
  daysInJourney,
}: {
  overall: { done: number; all: number; pct: number; stations: number; stationsDone: number };
  daysInJourney: number;
}) {
  const chips: Array<{
    icon: React.ReactNode;
    label: string;
    value: string;
    tone: 'emerald' | 'amber' | 'rose';
  }> = [];

  if (overall.stationsDone > 0) {
    chips.push({
      icon: <Trophy className="h-3.5 w-3.5" strokeWidth={2.4} />,
      label: 'תחנות',
      value: `${overall.stationsDone}/${overall.stations}`,
      tone: 'amber',
    });
  }
  if (overall.done > 0) {
    chips.push({
      icon: <Target className="h-3.5 w-3.5" strokeWidth={2.4} />,
      label: 'צעדים',
      value: `${overall.done}`,
      tone: 'emerald',
    });
  }
  if (daysInJourney > 1) {
    chips.push({
      icon: <Flame className="h-3.5 w-3.5" strokeWidth={2.4} fill="rgba(254,215,170,0.45)" />,
      label: 'ימי מסע',
      value: `${daysInJourney}`,
      tone: 'rose',
    });
  }

  if (chips.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.55 }}
      className="mx-auto mt-3.5 flex max-w-md flex-wrap items-center justify-center gap-2"
    >
      {chips.map((c, i) => {
        /**
         * צ'יפים על ה-HERO (רקע ירוק כהה) — זכוכית-iOS-כהה אמיתית.
         * רקע נייטרלי-לבן-שקוף + רמז צבע מאוד עדין דרך ה-iconBg + הגלואו.
         */
        const palette = {
          emerald: {
            glow: 'rgba(167,243,208,0.45)',
            iconBg: 'linear-gradient(135deg, rgba(167,243,208,0.95), rgba(52,211,153,0.85))',
            iconColor: '#022c22',
          },
          amber: {
            glow: 'rgba(252,211,77,0.55)',
            iconBg: 'linear-gradient(135deg, rgba(253,224,71,0.98), rgba(245,158,11,0.92))',
            iconColor: '#451a03',
          },
          rose: {
            glow: 'rgba(253,164,175,0.55)',
            iconBg: 'linear-gradient(135deg, rgba(254,202,202,0.95), rgba(251,113,133,0.92))',
            iconColor: '#7f1d1d',
          },
        }[c.tone];

        return (
          <motion.div
            key={i}
            dir="rtl"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.6 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ y: -2, scale: 1.03 }}
            className="glass-pill-dark relative flex items-center gap-2 rounded-full py-1.5 pl-3.5 pr-1.5 overflow-hidden"
          >
            {/* ✦ הילה רכה מאחורי האייקון (מרמזת את הגוון מבלי לצבוע את הזכוכית) */}
            <span
              aria-hidden
              className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full"
              style={{
                background: `radial-gradient(circle, ${palette.glow} 0%, transparent 70%)`,
                filter: 'blur(8px)',
              }}
            />
            {/* ✦ קו אור עליון — specular highlight */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-2 top-px h-px"
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgba(255,255,255,0.7), transparent)',
              }}
            />

            {/* ─── כיפת אייקון משלה — כאן יש את הצבע ─── */}
            <span
              className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
              style={{
                background: palette.iconBg,
                color: palette.iconColor,
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,0.6), 0 2px 6px rgba(2,44,34,0.25)',
              }}
            >
              {c.icon}
            </span>

            <span
              className="relative text-[11px] font-bold tracking-wide"
              style={{ color: 'rgba(255,255,255,0.92)' }}
            >
              {c.label}
            </span>

            <span
              className="relative text-[14px] font-black tabular-nums text-white"
              style={{
                fontFamily: "'Rubik','Heebo',sans-serif",
                textShadow: '0 1px 4px rgba(2,44,34,0.45)',
              }}
            >
              {c.value}
            </span>
          </motion.div>
        );
      })}
    </motion.div>
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
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return { greeting: 'בוקר טוב', bucket: 'morning' };
  if (h >= 11 && h < 16) return { greeting: 'צהריים טובים', bucket: 'noon' };
  if (h >= 16 && h < 20) return { greeting: 'אחר הצהריים נעימים', bucket: 'evening' };
  if (h >= 20 && h < 24) return { greeting: 'ערב טוב', bucket: 'night' };
  return { greeting: 'לילה שקט', bucket: 'night' };
}

function TimeOfDayIcon({ tod }: { tod: TimeOfDay }) {
  if (tod.bucket === 'morning') return <Sunrise className="h-3.5 w-3.5 text-amber-200" />;
  if (tod.bucket === 'noon') return <Sun className="h-3.5 w-3.5 text-amber-200" />;
  if (tod.bucket === 'evening') return <Sunset className="h-3.5 w-3.5 text-orange-200" />;
  return <Moon className="h-3.5 w-3.5 text-indigo-200" />;
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
      message: 'המסע שלך מחכה',
      sparkle: '✦',
      subline:
        'אני מכין לך תחנות, צעדים והרגלים שמשתלבים בחיים — ברגע שתרצה, נצא לדרך יחד.',
    };
  }
  if (overall.done === 0) {
    return {
      preamble,
      message: 'זה הרגע שלנו להתחיל',
      sparkle: '✿',
      subline:
        tod?.bucket === 'morning'
          ? 'בוקר טוב להתחלה חדשה. בחר תחנה ואני איתך — צעד אחד בכל פעם, בקצב שלך.'
          : tod?.bucket === 'night'
            ? 'גם רגע שקט בלילה מתאים להתחלה. בחר תחנה ואני אהיה כאן.'
            : 'בחר תחנה במסלול ונצא לדרך — אני איתך בכל צעד.',
    };
  }
  if (overall.pct >= 100) {
    return {
      preamble,
      message: 'עשית את כל הדרך!',
      sparkle: '🏆',
      subline:
        'סיימת את כל הצעדים — אני באמת גאה. אפשר לחזור ולהתבונן, או להמשיך לחזק את מה שבנית.',
    };
  }
  if (overall.pct >= 60) {
    return {
      preamble,
      message: 'אנחנו כבר קרובים',
      sparkle: '✦',
      subline:
        'עברת יותר ממחצית הדרך. כל צעד נוסף מחזק את מה שאתה בונה — אני רואה את זה.',
    };
  }
  if (overall.pct >= 30) {
    return {
      preamble,
      message: 'אתה תופס מומנטום',
      sparkle: '✿',
      subline: 'התחלת לבנות שגרה שמתאימה לך. ממשיכים בקצב שלך — אני כאן לאורך כל הדרך.',
    };
  }
  return {
    preamble,
    message: 'ממשיכים יחד',
    sparkle: '✿',
    subline:
      tod?.bucket === 'morning'
        ? 'בוקר חדש, צעד חדש. אני גאה בך — בחר את התחנה הבאה ונמשיך.'
        : 'אני גאה בכל צעד שאתה עושה. בחר את התחנה הבאה ונמשיך יחד.',
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
          'linear-gradient(110deg, #ffffff 0%, #fef3c7 22%, #fde68a 38%, #ffffff 50%, #fef9c3 62%, #ffffff 100%)',
        backgroundSize: '300% 100%',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        color: 'transparent',
      }}
      animate={reduced ? {} : { backgroundPositionX: ['200%', '0%'] }}
      transition={{ duration: 6.5, repeat: Infinity, ease: 'linear' }}
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
          '0 0 14px rgba(252,211,77,0.7), 0 0 4px rgba(255,255,255,0.85)',
      }}
      animate={
        reduced
          ? {}
          : {
              rotate: [0, 12, -8, 0],
              scale: [1, 1.18, 0.95, 1],
            }
      }
      transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
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
            <stop offset="0%" stopColor="#a7f3d0" />
            <stop offset="60%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#fbbf24" />
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
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          style={{
            strokeDasharray: circumference,
            filter: 'drop-shadow(0 0 6px rgba(167,243,208,0.6))',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="text-[15px] font-black text-white"
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
        c: 'rgba(167,243,208,0.55)',
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
            ease: 'easeInOut',
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
          ease: [0.45, 0, 0.55, 1],
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
            'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.95) 60%, rgba(167,243,208,0.95) 100%)',
          borderRadius: 9999,
          filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.95)) drop-shadow(0 0 14px rgba(167,243,208,0.7))',
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
          ease: 'easeOut',
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
            'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.85) 60%, rgba(251,191,36,0.9) 100%)',
          borderRadius: 9999,
          filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.9)) drop-shadow(0 0 14px rgba(251,191,36,0.6))',
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
          ease: 'easeOut',
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
            background: 'rgba(255, 255, 255, 0.9)',
            boxShadow:
              '0 0 8px rgba(167,243,208,0.85), 0 0 14px rgba(110,231,183,0.6)',
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
            ease: 'easeInOut',
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
        style={{ background: 'linear-gradient(to bottom, #6ee7b7, #047857)' }}
      />
      <div className="flex-1 text-right">
        <p
          className="text-[17px] font-black"
          style={{ color: '#1A1730', fontFamily: "'Rubik','Heebo',sans-serif" }}
        >
          התחנות במסלול
        </p>
        <p className="mt-0.5 text-xs text-emerald-800/70">
          {variant === 'active'
            ? count === 1
              ? 'יש לך תחנה אחת שמחכה — בוא ניכנס'
              : `${count} תחנות מחכות לך — בחר תחנה ונמשיך`
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
          style={{ background: 'linear-gradient(to bottom, #a7f3d0, #34d399)' }}
        />
        <div className="flex-1 text-right">
          <p
            className="text-[17px] font-black"
            style={{ color: '#1A1730', fontFamily: "'Rubik','Heebo',sans-serif" }}
          >
            הושלמו
          </p>
          <p className="mt-0.5 text-xs text-emerald-800/70">
            {groups.length === 1
              ? 'סיימת תחנה אחת — אני גאה בך'
              : `סיימת ${groups.length} תחנות — כל הכבוד`}
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
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-3 w-full rounded-xl py-2.5 text-[13px] font-bold text-emerald-800 transition active:scale-[0.98]"
          style={{
            background: 'rgba(16,185,129,0.10)',
            border: '1px solid rgba(110,231,183,0.35)',
          }}
        >
          הצג עוד ({groups.length - 2} תחנות)
        </button>
      ) : null}
    </div>
  );
}

function EmptyState({ firstName }: { firstName: string }) {
  return (
    <div className="glass-surface rounded-3xl px-6 py-16 text-center">
      <Droplets className="mx-auto mb-4 h-12 w-12 text-emerald-300" />
      <h3 className="mb-2 text-xl font-black" style={{ color: '#1A1730' }}>
        {firstName}, המסע שלך מחכה
      </h3>
      <p className="text-sm text-gray-500">
        כשיצטרפו תחנות וצעדים — אני אדאג שיופיעו כאן בדיוק בשבילך
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
      transition={{ duration: 0.55, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
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
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(251,191,36,0.35) 0%, rgba(251,191,36,0.10) 40%, transparent 70%)',
          filter: 'blur(22px)',
        }}
      />
      {/* ✦ זוהר ירוק עדין בצד שני */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-12 -bottom-12 h-44 w-44 rounded-full"
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
            className="text-[10.5px] font-black uppercase tracking-[0.14em] text-emerald-200/90"
            style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
          >
            אלמוג · המנטור שלך
          </p>
          <p
            className="mt-1.5 text-[14.5px] font-bold leading-relaxed text-white"
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
    return `${firstName}, אין שום מירוץ. תגיד לי מתי, ויוצאים יחד.`;
  }
  if (overall.done === 0) {
    return `${firstName}, אני זוכר את הצעד הראשון של כל אחד. אני פה איתך.`;
  }
  if (overall.pct >= 100) {
    return `${firstName}, אני באמת גאה. עכשיו פשוט לשמר את מה שבנית.`;
  }
  if (overall.pct >= 60) {
    return `${firstName}, אני רואה כמה אתה משקיע. ממשיכים יחד, בקצב שלך.`;
  }
  if (overall.pct >= 30) {
    return `יפה לך, ${firstName}. בלי לחץ — אני פה אם יעלה משהו.`;
  }
  return `${firstName}, צעד אחד בכל פעם. אני פה לאורך כל הדרך.`;
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
  const completedCount = steps.filter((s) => s.progress?.is_completed).length;
  const totalCount = steps.length;
  const pct = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;
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
          background: '#EDF5F0',
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
                'linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent)',
            }}
          />

          <div className="relative flex items-center justify-between gap-3 px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <div
                className="h-8 w-1.5 rounded-full"
                style={{
                  background: 'linear-gradient(to bottom, #34d399, #047857)',
                  boxShadow: '0 0 8px rgba(52,211,153,0.55)',
                }}
              />
              <div className="text-right">
                <p
                  className="text-[11px] font-black uppercase tracking-[0.12em] text-emerald-700"
                  style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
                >
                  הצעדים בתחנה
                </p>
                <p
                  className="mt-0.5 text-[15px] font-black text-emerald-950"
                  style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
                >
                  {completedCount} מתוך {totalCount} הושלמו
                </p>
              </div>
            </div>

            {allDone ? (
              <div
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black text-white"
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
                  className="text-[13px] font-black text-emerald-700 tabular-nums"
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
            className="glass-inset rounded-2xl py-6 text-center text-sm text-gray-500"
            style={{ borderStyle: 'dashed', borderColor: 'rgba(110,231,183,0.55)' }}
          >
            בתחנה הזו עדיין אין צעדים — זה יתעדכן מיד כשהתוכן יתפרסם.
          </p>
        ) : (
          <StepsTimeline steps={steps} activeIndex={activeIndex} />
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

        <button
          type="button"
          onClick={onBack}
          className="group relative flex shrink-0 items-center gap-2 overflow-hidden rounded-full px-4 py-2.5 text-[13.5px] font-black text-white transition-transform duration-200 hover:scale-[1.04] active:scale-95"
          style={{
            background:
              'linear-gradient(135deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0.10) 100%)',
            backdropFilter: 'blur(18px) saturate(180%)',
            WebkitBackdropFilter: 'blur(18px) saturate(180%)',
            border: '1px solid rgba(255,255,255,0.48)',
            boxShadow:
              '0 10px 28px rgba(2,44,34,0.42), 0 2px 6px rgba(2,44,34,0.20), inset 0 1px 0 rgba(255,255,255,0.40), inset 0 -1px 0 rgba(255,255,255,0.10)',
            textShadow: '0 1px 6px rgba(2,44,34,0.65)',
            fontFamily: "'Rubik','Heebo',sans-serif",
          }}
          aria-label="חזרה לרשימת התחנות"
        >
          {/* ✦ specular highlight — קו אור עליון עדין */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-3 top-px h-px"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(255,255,255,0.75), transparent)',
            }}
          />
          <ChevronRight
            className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-0.5"
            strokeWidth={2.5}
          />
          <span>חזרה למסע</span>
        </button>

        {allDone ? (
          <div
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-black text-white shadow"
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
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
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
                'linear-gradient(135deg, #022c22 0%, #064e3b 45%, #047857 80%, #10b981 100%)',
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
        <div className="absolute bottom-0 left-0 right-0 z-10 px-4 pb-8 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.15 }}
            className="mx-auto max-w-xl text-right"
          >
            <div className="mb-2 flex items-center gap-2">
              <div
                className="flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-bold text-white"
                style={{
                  background: 'rgba(255,255,255,0.18)',
                  border: '1px solid rgba(255,255,255,0.28)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                }}
              >
                <Sparkles className="h-3 w-3 text-amber-300" />
                תחנה במסע
              </div>
            </div>
            <h1
              className="text-right text-[28px] font-black leading-tight text-white drop-shadow-lg sm:text-[34px]"
              style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
            >
              {group.title}
            </h1>
            {group.description ? (
              <p className="mt-2 line-clamp-3 text-right text-sm leading-relaxed text-white/90 sm:text-base">
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
                  transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full rounded-full"
                  style={{
                    background: 'linear-gradient(90deg, #a7f3d0, #34d399 60%, #fbbf24)',
                    boxShadow: '0 0 10px rgba(167,243,208,0.6)',
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
}: {
  steps: JourneyStepWithProgress[];
  activeIndex: number;
}) {
  return (
    <div className="relative">
      <div
        className="absolute right-[23px] top-0 bottom-0 w-0.5"
        style={{ background: 'linear-gradient(to bottom, #10b981, #d1fae5, transparent)' }}
      />

      <div className="space-y-4">
        {steps.map((step, index) => {
          const isCompleted = Boolean(step.progress?.is_completed);
          const isActive = index === activeIndex;
          const isLocked = !isCompleted && !isActive;

          return (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.1 + index * 0.06 }}
            >
              <Link
                href={isLocked ? '#' : `/journey/${step.id}`}
                className={`block relative pr-14 ${isLocked ? 'pointer-events-none opacity-60' : ''}`}
                aria-disabled={isLocked}
              >
                <div className="absolute right-[12px] top-5 z-10">
                  <div
                    className="flex h-[22px] w-[22px] items-center justify-center rounded-full"
                    style={{
                      background: isCompleted ? '#10b981' : isActive ? '#fff' : '#d1d5db',
                      border: isCompleted
                        ? '3px solid #10b981'
                        : isActive
                          ? '3px solid #10b981'
                          : '3px solid #d1d5db',
                      boxShadow: isActive ? '0 0 14px rgba(16,185,129,0.55)' : 'none',
                    }}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-3 w-3 text-white" />
                    ) : isActive ? (
                      <motion.div
                        className="h-2 w-2 rounded-full bg-emerald-500"
                        animate={{ scale: [1, 1.4, 1] }}
                        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                      />
                    ) : (
                      <Lock className="h-2.5 w-2.5 text-gray-400" />
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
                            '0 10px 28px rgba(16,185,129,0.22), inset 0 1px 0 rgba(255,255,255,0.65), inset 0 -1px 0 rgba(255,255,255,0.10), 0 0 0 4px rgba(16,185,129,0.08)',
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
                          color: isCompleted ? '#059669' : isActive ? '#047857' : '#9ca3af',
                        }}
                      >
                        שלב {step.step_number}
                      </span>
                      {step.duration_minutes ? (
                        <span className="text-xs text-gray-400">
                          {step.duration_minutes} דקות
                        </span>
                      ) : null}
                      {isCompleted ? (
                        <span className="mr-auto flex items-center gap-1 text-xs font-bold text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" /> הושלם ✨
                        </span>
                      ) : null}
                    </div>

                    <h3
                      className="mb-1.5 text-[17px] font-black leading-snug"
                      style={{ color: '#1A1730', fontFamily: "'Rubik','Heebo',sans-serif" }}
                    >
                      {step.title}
                    </h3>

                    {step.description ? (
                      <p className="line-clamp-2 text-sm leading-relaxed text-gray-500">
                        {step.description}
                      </p>
                    ) : null}

                    {isActive ? (
                      <div className="mt-3 flex items-center gap-2">
                        <div
                          className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white"
                          style={{
                            background: 'linear-gradient(135deg, #047857, #10b981)',
                            boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
                          }}
                        >
                          <Play className="h-3.5 w-3.5" fill="white" />
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
                          background: 'linear-gradient(90deg, #047857, #10b981)',
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
