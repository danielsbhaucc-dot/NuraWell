'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, MapPin, Sparkles, Sunrise, X } from 'lucide-react';
import { slotLabel } from '../../lib/journey/task-schedule';
import type { JourneyTaskSlot } from '../../lib/types/journey';

export interface DayExecRow {
  task_id: string;
  task_title: string;
  task_emoji: string;
  step_number: number;
  step_title: string;
  slot: string;
  completed_at: string;
  source: 'manual' | 'chat' | 'reminder';
}

interface Props {
  open: boolean;
  dateKey: string | null;
  todayKey: string;
  rows: DayExecRow[];
  onClose: () => void;
}

function friendlyDate(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return 'היום';
  const today = new Date(`${todayKey}T12:00:00`);
  const target = new Date(`${dateKey}T12:00:00`);
  const diff = Math.round((today.getTime() - target.getTime()) / 86400000);
  if (diff === 1) return 'אתמול';
  if (diff > 1 && diff <= 6) return `לפני ${diff} ימים`;
  return target.toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function timeOnly(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const sourceLabel: Record<DayExecRow['source'], string> = {
  manual: 'ידני',
  chat: 'אלמוג',
  reminder: 'תזכורת',
};

/**
 * Popup ידידותי שמראה את כל המשימות שבוצעו ביום מסוים.
 *
 * עיצוב:
 *  - שכבת glass עם רקע ירוק-קרם, ללא #FFF.
 *  - כרטיס פר-משימה: אמוג'י, שם, צעד, סלוט (בוקר/ארוחה/...) ושעה.
 *  - אם אין רשומות + זה היום → "היום עוד פתוח לפנינו" (עידוד, לא פספוס).
 *  - אם אין רשומות + זה בעבר → טקסט עדין "לא תועד ביצוע" — לא דרמטי.
 */
export function DayDetailPopup({ open, dateKey, todayKey, rows, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  const isToday = dateKey === todayKey;
  const isFuture = Boolean(dateKey && todayKey && dateKey > todayKey);
  const sortedRows = [...rows].sort((a, b) =>
    a.completed_at.localeCompare(b.completed_at)
  );

  return (
    <AnimatePresence>
      {open && dateKey ? (
        <motion.div
          key="day-popup"
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center px-3 pb-4 sm:pb-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="סגירה"
            onClick={onClose}
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(6,78,59,0.55) 0%, rgba(6,40,32,0.7) 100%)',
              backdropFilter: 'blur(6px)',
            }}
          />
          <motion.div
            className="relative w-full max-w-sm rounded-[26px] overflow-hidden"
            initial={{ y: 30, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            style={{
              background:
                'linear-gradient(170deg, rgba(236,253,245,0.92) 0%, rgba(220,252,231,0.85) 50%, rgba(254,252,232,0.85) 100%)',
              border: '1px solid rgba(167,243,208,0.6)',
              boxShadow:
                '0 30px 70px rgba(6,78,59,0.32), 0 0 0 1px rgba(255,255,255,0.4) inset, inset 0 1px 1px rgba(236,253,245,0.95)',
              backdropFilter: 'blur(28px) saturate(1.3)',
              WebkitBackdropFilter: 'blur(28px) saturate(1.3)',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3 left-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-emerald-900/80 hover:text-emerald-900"
              style={{
                background: 'rgba(220,252,231,0.6)',
                border: '1px solid rgba(167,243,208,0.6)',
              }}
              aria-label="סגירה"
            >
              <X className="w-4 h-4" />
            </button>

            <div
              className="px-5 pt-5 pb-4 text-right"
              style={{
                background:
                  'linear-gradient(150deg, rgba(167,243,208,0.55) 0%, rgba(204,251,241,0.35) 70%)',
                borderBottom: '1px solid rgba(167,243,208,0.45)',
              }}
            >
              <p className="text-[11px] font-bold text-emerald-900/75 mb-0.5">
                פירוט יום
              </p>
              <h2
                className="text-lg font-black text-emerald-950"
                style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
              >
                {friendlyDate(dateKey, todayKey)}
              </h2>
              <p className="text-[11px] text-emerald-900/75 font-semibold tabular-nums mt-0.5">
                {dateKey}
              </p>
            </div>

            <div className="p-4 space-y-2.5 max-h-[60vh] overflow-y-auto">
              {sortedRows.length === 0 ? (
                <div
                  className="rounded-2xl p-4 text-right"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(204,251,241,0.45) 0%, rgba(254,252,232,0.4) 100%)',
                    border: '1px solid rgba(167,243,208,0.4)',
                  }}
                >
                  {isFuture ? (
                    <>
                      <div className="flex items-center gap-2 justify-end mb-1">
                        <p className="text-sm font-black text-emerald-900">
                          יום עתידי
                        </p>
                        <Sparkles className="w-4 h-4 text-emerald-700" />
                      </div>
                      <p className="text-xs text-emerald-900/80 leading-relaxed">
                        עוד לא הגענו לכאן — נמשיך צעד אחד בכל פעם.
                      </p>
                    </>
                  ) : isToday ? (
                    <>
                      <div className="flex items-center gap-2 justify-end mb-1">
                        <p className="text-sm font-black text-emerald-900">
                          היום עוד פתוח
                        </p>
                        <Sunrise className="w-4 h-4 text-amber-600" />
                      </div>
                      <p className="text-xs text-emerald-900/80 leading-relaxed">
                        אפשר לסמן ביצוע מהמסע — בכל שלב במהלך היום.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-black text-emerald-900 mb-1">
                        לא תועד ביצוע ביום זה
                      </p>
                      <p className="text-xs text-emerald-900/80 leading-relaxed">
                        זה לא משנה את הכיוון — מחר הזדמנות חדשה.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                sortedRows.map((row, i) => (
                  <article
                    key={`${row.task_id}-${row.slot}-${row.completed_at}-${i}`}
                    className="rounded-2xl p-3"
                    style={{
                      background:
                        'linear-gradient(170deg, rgba(236,253,245,0.75) 0%, rgba(209,250,229,0.5) 100%)',
                      border: '1px solid rgba(167,243,208,0.5)',
                      boxShadow:
                        '0 6px 18px rgba(6,78,59,0.06), inset 0 1px 0 rgba(236,253,245,0.85)',
                    }}
                  >
                    <div className="flex items-start gap-2.5 flex-row-reverse">
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl"
                        style={{
                          background:
                            'linear-gradient(145deg, rgba(220,252,231,0.85), rgba(254,252,232,0.65))',
                          border: '1px solid rgba(167,243,208,0.6)',
                        }}
                      >
                        {row.task_emoji}
                      </div>
                      <div className="min-w-0 flex-1 text-right">
                        <p className="text-sm font-black text-emerald-950 leading-snug line-clamp-2">
                          {row.task_title}
                        </p>
                        <p className="text-[10px] font-semibold text-emerald-900/70 mt-0.5 flex items-center gap-1 justify-end flex-wrap">
                          <span>
                            צעד {row.step_number}
                            {row.step_title ? `: ${row.step_title}` : ''}
                          </span>
                          <MapPin className="w-3 h-3" />
                        </p>
                        <div className="flex flex-wrap gap-1.5 justify-end mt-2">
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full text-emerald-900 inline-flex items-center gap-1"
                            style={{
                              background: 'rgba(167,243,208,0.55)',
                              border: '1px solid rgba(110,231,183,0.45)',
                            }}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            {slotLabel(row.slot as JourneyTaskSlot)}
                          </span>
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full text-emerald-900/85 tabular-nums"
                            style={{
                              background: 'rgba(254,252,232,0.7)',
                              border: '1px solid rgba(254,240,138,0.55)',
                            }}
                          >
                            {timeOnly(row.completed_at)}
                          </span>
                          {row.source !== 'manual' ? (
                            <span
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full text-violet-900"
                              style={{
                                background: 'rgba(237,233,254,0.7)',
                                border: '1px solid rgba(196,181,253,0.55)',
                              }}
                            >
                              {sourceLabel[row.source]}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>

            {sortedRows.length > 0 ? (
              <div
                className="px-4 py-3 text-center text-[11px] font-semibold text-emerald-900/85"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(204,251,241,0.4) 0%, rgba(220,252,231,0.55) 100%)',
                  borderTop: '1px solid rgba(167,243,208,0.45)',
                }}
              >
                {sortedRows.length === 1
                  ? 'ביצוע אחד תועד — צעד הוא צעד 🌱'
                  : `${sortedRows.length} ביצועים תועדו — יום פעיל ✨`}
              </div>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
