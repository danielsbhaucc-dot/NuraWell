'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  BookOpen,
  ChevronLeft,
  ClipboardCheck,
  GraduationCap,
  Route,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { AlmogHeroHeader } from './DolevHeroHeader';
import {
  countAcceptedTaskExecution,
  type JourneyReportStepShape,
} from '../../lib/journey/journey-report-parse';
import { useProgressReport } from '../progress-report/ProgressReportProvider';
import { useActionHub } from '../action-hub/ActionHubProvider';

type JourneyReportResponse = { steps: JourneyReportStepShape[] };

export type HomeStats = {
  activeCoursesCount: number;
  avgProgress: number;
  totalLessonsCompleted: number;
};

interface HomeClientProps {
  firstName: string;
  stats: HomeStats;
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
};

export function HomeClient({ firstName, stats }: HomeClientProps) {
  const progressReport = useProgressReport();
  const actionHub = useActionHub();
  const [taskLoading, setTaskLoading] = useState(true);
  const [taskCounts, setTaskCounts] = useState({ accepted: 0, done: 0, pending: 0 });

  const refreshTasks = useCallback(async () => {
    setTaskLoading(true);
    try {
      const res = await fetch('/api/v1/journey-report', { cache: 'no-store' });
      const json = (await res.json()) as JourneyReportResponse & { error?: string };
      if (!res.ok) return;
      setTaskCounts(countAcceptedTaskExecution(json.steps ?? []));
    } finally {
      setTaskLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshTasks();
  }, [refreshTasks]);

  const bubbleContent = useMemo(() => {
    if (taskLoading) {
      return <>רגע, אני מסתכל על המסע שלך…</>;
    }
    if (taskCounts.accepted === 0) {
      return (
        <>
          {firstName ? `${firstName}, ` : ''}שמח שאתה כאן 🌿
          <br />
          <strong style={{ color: '#FFD97D', fontWeight: 700 }}>
            כשנוח — תכתוב לי במשפט מה הכי חשוב היום.
          </strong>
        </>
      );
    }
    if (taskCounts.pending > 0) {
      return (
        <>
          יש לך {taskCounts.pending} משימות שקיבלת ועדיין לא סגרת.
          <br />
          <strong style={{ color: '#FFD97D', fontWeight: 700 }}>
            ספר לי בצ&apos;אט כשעשית — בלי לחפש כפתורים.
          </strong>
        </>
      );
    }
    return (
      <>
        יופי — סגרת את מה שהתחייבת אליו היום ✦
        <br />
        <strong style={{ color: '#FFD97D', fontWeight: 700 }}>מה הכי מרגיש לך עכשיו?</strong>
      </>
    );
  }, [taskCounts, taskLoading, firstName]);

  return (
    <div>
      <div
        className="-mt-16 pt-16 relative overflow-hidden"
        style={{
          background: 'linear-gradient(160deg, #047857 0%, #059669 50%, #10b981 80%, #34d399 100%)',
        }}
      >
        <div
          className="absolute pointer-events-none"
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(245,166,35,0.3) 0%, transparent 70%)',
            bottom: '20px',
            left: '50%',
            filter: 'blur(12px)',
          }}
        />
        <div className="relative z-10" style={{ padding: '12px 20px 40px' }}>
          <AlmogHeroHeader firstName={firstName} bubbleContent={bubbleContent} />
        </div>
      </div>

      <div
        style={{
          background: '#EDF5F0',
          borderRadius: '26px 26px 0 0',
          marginTop: '-18px',
          padding: '22px 16px 20px',
          position: 'relative',
          zIndex: 3,
          minHeight: '55vh',
        }}
      >
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-3.5">
          {/* משימות */}
          <motion.div variants={item}>
            <button
              type="button"
              onClick={() => progressReport.open('task_execution')}
              className="w-full text-right"
            >
              <motion.div
                className="flex gap-3.5 items-center p-4"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(240,253,250,0.9) 100%)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255,255,255,0.8)',
                  borderRadius: '22px',
                  boxShadow: '0 4px 24px rgba(6,78,59,0.10), 0 1px 4px rgba(6,78,59,0.06), inset 0 1px 0 rgba(255,255,255,1)',
                }}
              >
                <div
                  className="flex-shrink-0 flex flex-col items-center justify-center"
                  style={{
                    width: '58px',
                    height: '58px',
                    background: 'linear-gradient(145deg, #047857, #10b981)',
                    borderRadius: '18px',
                    boxShadow: '0 4px 12px rgba(4,120,87,0.2)',
                  }}
                >
                  <span style={{ fontSize: '22px', fontWeight: 900, color: '#fff', lineHeight: 1 }}>
                    {taskLoading ? '…' : taskCounts.done}
                  </span>
                  <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>
                    מתוך {taskLoading ? '…' : taskCounts.accepted || '—'}
                  </span>
                </div>
                <div style={{ flex: 1 }}>
                  <p
                    style={{
                      fontSize: '15px',
                      fontWeight: 800,
                      color: '#1A1730',
                      fontFamily: "'Rubik','Heebo',sans-serif",
                    }}
                  >
                    המשימות שלי
                  </p>
                  <p style={{ fontSize: '12px', color: '#9896B8', margin: '2px 0 8px' }}>
                    {taskLoading
                      ? 'טוען…'
                      : taskCounts.accepted === 0
                        ? 'עדיין לא לקחתם משימות במסע — בואו נתחיל'
                        : taskCounts.pending > 0
                          ? `${taskCounts.pending} משימות ממתינות לסימון ביצוע`
                          : 'כל המשימות שסימנתם — בוצעו!'}
                  </p>
                  {taskCounts.accepted > 0 && (
                    <div className="flex gap-1">
                      {Array.from({ length: Math.min(taskCounts.accepted, 8) }).map((_, i) => (
                        <div
                          key={i}
                          style={{
                            height: '6px',
                            flex: 1,
                            borderRadius: '10px',
                            background:
                              i < taskCounts.done
                                ? 'linear-gradient(90deg, #14b8a6, #5eead4)'
                                : 'rgba(0,0,0,0.08)',
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <ChevronLeft className="w-5 h-5 text-emerald-800/35 shrink-0" aria-hidden />
              </motion.div>
            </button>
          </motion.div>

          {/* קורסים */}
          {stats.activeCoursesCount > 0 && (
            <motion.div variants={item}>
              <Link href="/courses" prefetch className="block">
                <div
                  className="flex gap-3.5 items-center p-4"
                  style={{
                    background: 'linear-gradient(135deg, #FFF8E7 0%, #FFFBF0 100%)',
                    border: '1.5px solid rgba(245,166,35,0.35)',
                    borderRadius: '20px',
                    boxShadow: '0 4px 20px rgba(245,166,35,0.12), inset 0 1px 0 rgba(255,255,255,0.9)',
                  }}
                >
                  <div
                    className="flex-shrink-0 flex flex-col items-center justify-center"
                    style={{
                      width: '50px',
                      height: '50px',
                      background: 'linear-gradient(145deg, #F5A623, #FBBF24)',
                      borderRadius: '16px',
                      boxShadow: '0 4px 14px rgba(245,166,35,0.45)',
                    }}
                  >
                    <span style={{ fontSize: '18px', fontWeight: 900, color: 'white', lineHeight: 1 }}>
                      {stats.avgProgress}%
                    </span>
                  </div>
                  <div>
                    <p
                      style={{
                        fontSize: '14px',
                        fontWeight: 800,
                        color: '#78350F',
                        fontFamily: "'Rubik','Heebo',sans-serif",
                      }}
                    >
                      {stats.activeCoursesCount} קורסים פעילים
                    </p>
                    <p style={{ fontSize: '12px', color: '#B45309', marginTop: '2px' }}>
                      {stats.totalLessonsCompleted} שיעורים הושלמו — המשיכו ללמוד
                    </p>
                  </div>
                  <ChevronLeft className="w-5 h-5 text-amber-800/35 shrink-0 mr-auto" aria-hidden />
                </div>
              </Link>
            </motion.div>
          )}

          <motion.div variants={item}>
            <p
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: '#9896B8',
                letterSpacing: '1.2px',
                textTransform: 'uppercase',
                margin: '8px 0 10px 2px',
              }}
            >
              המשך מהר
            </p>
            <div className="grid grid-cols-2 gap-3">
              <QuickLink href="/journey" icon={Route} label="המסע שלי" accent="#10b981" />
              <QuickLink href="/courses" icon={BookOpen} label="הקורסים" accent="#14b8a6" />
              <QuickLink
                href="#"
                icon={ClipboardCheck}
                label="עדכון משימות"
                accent="#047857"
                onClick={(e) => {
                  e.preventDefault();
                  actionHub.open();
                }}
              />
              <QuickLink href="/progress" icon={TrendingUp} label="התקדמות" accent="#f59e0b" />
            </div>
          </motion.div>

          {stats.activeCoursesCount === 0 && (
            <motion.div variants={item} className="text-center py-10">
              <div className="relative w-20 h-20 mx-auto mb-5">
                <div
                  className="absolute inset-0 rounded-3xl"
                  style={{
                    background: 'linear-gradient(145deg, #047857, #10b981)',
                    boxShadow: '0 8px 32px rgba(4,120,87,0.25)',
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <GraduationCap className="w-9 h-9 text-white" />
                </div>
              </div>
              <h3
                className="text-xl font-black mb-2"
                style={{ color: '#1A1730', fontFamily: "'Rubik','Heebo',sans-serif" }}
              >
                מתחילים את המסע
              </h3>
              <p className="text-sm max-w-[240px] mx-auto leading-relaxed mb-4" style={{ color: '#9896B8' }}>
                עברו למסע שלכם או לקורסים כשהם ייפתחו עבורכם
              </p>
              <Link
                href="/journey"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white"
                style={{ background: 'linear-gradient(145deg, #047857, #10b981)' }}
              >
                <Sparkles className="w-4 h-4" />
                למסע שלי
              </Link>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
  accent,
  onClick,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  accent: string;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  const inner = (
    <div
      className="flex flex-col items-center gap-2 p-4 rounded-[20px] transition active:scale-[0.98]"
      style={{
        background: 'rgba(255,255,255,0.92)',
        border: '1px solid rgba(255,255,255,0.85)',
        boxShadow: '0 4px 16px rgba(6,78,59,0.08)',
      }}
    >
      <div
        className="w-11 h-11 rounded-2xl flex items-center justify-center"
        style={{ background: `${accent}18`, border: `1px solid ${accent}30` }}
      >
        <Icon className="w-5 h-5" style={{ color: accent }} strokeWidth={2.2} />
      </div>
      <span className="text-[12px] font-bold text-[#1A1730]">{label}</span>
    </div>
  );

  if (onClick) {
    return (
      <a href={href} onClick={onClick} className="block no-tap-highlight">
        {inner}
      </a>
    );
  }

  return (
    <Link href={href} prefetch className="block no-tap-highlight">
      {inner}
    </Link>
  );
}
