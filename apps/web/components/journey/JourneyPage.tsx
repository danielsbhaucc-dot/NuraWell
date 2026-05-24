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
} from 'lucide-react';
import type { JourneyStepWithProgress } from '../../lib/types/journey';
import type { JourneyStationGroup } from '../../lib/journey/group-journey-by-station';
import { JourneyStationCard } from './JourneyStationCard';

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

  const handleBack = useCallback(() => setSelectedKey(null), []);

  // לחיצה על Escape חוזרת לתצוגת הגלריה
  useEffect(() => {
    if (!selectedKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedKey(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedKey]);

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
            onSelect={(key) => setSelectedKey(key)}
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
  onSelect,
}: {
  firstName: string;
  groups: JourneyStationGroup[];
  overall: { done: number; all: number; pct: number; stations: number; stationsDone: number };
  onSelect: (key: string) => void;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      {/* ═══ HERO ═══ */}
      <HeroSection firstName={firstName} overall={overall} reduced={!!reduced} />

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
          <EmptyState />
        ) : (
          <>
            <SectionHeader
              count={groups.length}
              completed={overall.stationsDone}
            />

            <div className="space-y-5">
              {groups.map((g, idx) => (
                <JourneyStationCard
                  key={g.key}
                  group={g}
                  index={idx}
                  onSelect={() => onSelect(g.key)}
                />
              ))}
            </div>
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
  reduced,
}: {
  firstName: string;
  overall: { done: number; all: number; pct: number; stations: number; stationsDone: number };
  reduced: boolean;
}) {
  const intro = useMemo(() => buildIntroText(firstName, overall), [firstName, overall]);

  return (
    <div
      className="-mt-16 pt-16 relative overflow-hidden"
      style={{
        background:
          'linear-gradient(160deg, #022c22 0%, #064e3b 35%, #047857 65%, #10b981 92%, #34d399 100%)',
      }}
    >
      {/* ✦ Background blobs */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: '260px',
          height: '260px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(52,211,153,0.55) 0%, transparent 70%)',
          top: '-60px',
          right: '-60px',
          filter: 'blur(38px)',
        }}
      />
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: '220px',
          height: '220px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(251,191,36,0.30) 0%, transparent 70%)',
          bottom: '-40px',
          left: '-50px',
          filter: 'blur(46px)',
        }}
      />

      {!reduced ? <FloatingSparkles /> : null}

      <div className="relative z-10 px-4 pb-14 pt-3 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto max-w-xl"
        >
          {/* Eyebrow */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, delay: 0.15 }}
            className="mx-auto mb-4 flex w-fit items-center gap-2 rounded-full px-4 py-2"
            style={{
              background: 'rgba(255,255,255,0.16)',
              border: '1px solid rgba(255,255,255,0.28)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
          >
            <Sparkles className="h-4 w-4 shrink-0 text-amber-300" />
            <span className="text-sm font-bold text-white">המסע שלי</span>
          </motion.div>

          {/* Personal greeting */}
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.22 }}
            className="text-center text-[26px] font-black leading-tight text-white sm:text-[32px]"
            style={{ fontFamily: "'Rubik','Heebo',sans-serif", textShadow: '0 2px 18px rgba(2,44,34,0.45)' }}
          >
            {intro.headline}
          </motion.h1>

          {/* Sub-line */}
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.32 }}
            className="mx-auto mt-3 max-w-md text-center text-[15px] leading-relaxed text-emerald-50/90 sm:text-base"
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
                  ההתקדמות שלך עד עכשיו
                </p>
                <p
                  className="mt-0.5 text-[18px] font-black text-white"
                  style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
                >
                  {overall.done} מתוך {overall.all} צעדים
                </p>
                <p className="mt-0.5 text-[12px] text-emerald-50/85">
                  {overall.stationsDone > 0
                    ? `כבר השלמת ${overall.stationsDone} תחנ${overall.stationsDone === 1 ? 'ה' : 'ות'} ✦`
                    : 'כל צעד מקרב אותך ליעד שלך'}
                </p>
              </div>
            </motion.div>
          ) : null}
        </motion.div>
      </div>
    </div>
  );
}

/** מסך אישי לפי שלב במסע: בלי צעדים, בתחילת הדרך, באמצע, או הושלם */
function buildIntroText(
  firstName: string,
  overall: { done: number; all: number; pct: number; stations: number; stationsDone: number }
): { headline: string; subline: string } {
  if (overall.all === 0) {
    return {
      headline: `${firstName}, המסע שלך מחכה ✦`,
      subline:
        'תחנות בדרך, צעדים אישיים והרגלים שמשתלבים בחיים — הכל מוכן להופיע ברגע שתפרוץ קדימה.',
    };
  }
  if (overall.done === 0) {
    return {
      headline: `${firstName}, זה הרגע להתחיל ✿`,
      subline:
        'בחר תחנה במסלול, ובוא נצא לדרך — צעד אחד בכל פעם, בקצב שלך.',
    };
  }
  if (overall.pct >= 100) {
    return {
      headline: `${firstName}, עשית את כל הדרך! 🏆`,
      subline:
        'השלמת את כל הצעדים. אתה יכול לחזור בכל רגע ולהתבונן שוב במה שלמדת.',
    };
  }
  if (overall.pct >= 60) {
    return {
      headline: `${firstName}, הקו כבר נראה באופק ✦`,
      subline:
        'עברת יותר ממחצית הדרך. כל צעד נוסף מקבע את ההרגלים שאתה בונה לעצמך.',
    };
  }
  return {
    headline: `${firstName}, ממשיכים את המסע ✿`,
    subline:
      'אני גאה בכל צעד שאתה עושה. בחר את התחנה הבאה ובוא נמשיך יחד.',
  };
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
          {pct}%
        </span>
      </div>
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

function SectionHeader({ count, completed }: { count: number; completed: number }) {
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
          {count} תחנות · {completed} הושלמו
        </p>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl bg-white/70 px-6 py-16 text-center backdrop-blur">
      <Droplets className="mx-auto mb-4 h-12 w-12 text-emerald-300" />
      <h3 className="mb-2 text-xl font-black" style={{ color: '#1A1730' }}>
        עוד לא התחלת את המסע
      </h3>
      <p className="text-sm text-gray-500">כשיצטרפו תחנות וצעדים — הם יופיעו כאן</p>
    </div>
  );
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
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-emerald-100/80 bg-white/95 px-4 py-3 shadow-sm"
        >
          <div className="flex items-center gap-2">
            <div
              className="h-7 w-1.5 rounded-full"
              style={{ background: 'linear-gradient(to bottom, #34d399, #047857)' }}
            />
            <div className="text-right">
              <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700/80">
                הצעדים בתחנה
              </p>
              <p
                className="mt-0.5 text-[15px] font-black"
                style={{ color: '#1A1730', fontFamily: "'Rubik','Heebo',sans-serif" }}
              >
                {completedCount} מתוך {totalCount} הושלמו
              </p>
            </div>
          </div>
          {allDone ? (
            <div
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black text-white"
              style={{
                background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
                boxShadow: '0 6px 16px rgba(245,158,11,0.4)',
              }}
            >
              <Trophy className="h-3.5 w-3.5" />
              תחנה הושלמה
            </div>
          ) : (
            <span className="text-[13px] font-black text-emerald-700">{pct}%</span>
          )}
        </motion.div>

        {totalCount === 0 ? (
          <p className="rounded-2xl border border-dashed border-emerald-200/80 bg-white/60 py-6 text-center text-sm text-gray-500">
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
            alt=""
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

        {/* Top bar with back button */}
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),16px)] sm:px-6">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold text-white shadow-lg backdrop-blur-md transition-transform active:scale-95"
            style={{
              background: 'rgba(255,255,255,0.18)',
              border: '1px solid rgba(255,255,255,0.32)',
            }}
            aria-label="חזרה לרשימת התחנות"
          >
            <ChevronRight className="h-4 w-4" />
            חזרה למסע
          </button>
          {allDone ? (
            <div
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-black text-white shadow"
              style={{
                background: 'linear-gradient(135deg, rgba(245,158,11,0.95), rgba(251,191,36,0.95))',
              }}
            >
              <Trophy className="h-3 w-3" />
              הושלם
            </div>
          ) : null}
        </div>

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
                  className="overflow-hidden rounded-2xl transition-all duration-200 hover:scale-[1.01] active:scale-[0.98]"
                  style={{
                    background: isActive
                      ? 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(236,253,245,0.95) 100%)'
                      : 'rgba(255,255,255,0.92)',
                    border: isActive
                      ? '1.5px solid rgba(16,185,129,0.35)'
                      : '1px solid rgba(255,255,255,0.8)',
                    boxShadow: isActive
                      ? '0 8px 28px rgba(16,185,129,0.18), 0 2px 8px rgba(6,78,59,0.06)'
                      : '0 2px 12px rgba(6,78,59,0.06)',
                  }}
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
                          <span>בואו נתחיל!</span>
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
