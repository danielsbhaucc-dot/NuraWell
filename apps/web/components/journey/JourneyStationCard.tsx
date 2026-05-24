'use client';

import { motion } from 'framer-motion';
import { MapPin, ArrowLeft, CheckCircle2, Sparkles } from 'lucide-react';
import type { JourneyStationGroup } from '../../lib/journey/group-journey-by-station';
import { cn } from '../../lib/cn';

type JourneyStationCardProps = {
  group: JourneyStationGroup;
  index: number;
  onSelect: () => void;
};

/**
 * תחנה בתצוגת הגלריה (Stage 1) — כרטיס גדול עם תמונה, כותרת,
 * סטטוס התקדמות וכפתור "כניסה לתחנה". מוכן ל-layoutId לאנימציית
 * shared-element בין הגלריה לתצוגת הפירוט.
 */
export function JourneyStationCard({ group, index, onSelect }: JourneyStationCardProps) {
  const done = group.steps.filter((s) => s.progress?.is_completed).length;
  const total = group.steps.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const isEmpty = total === 0;
  const isCompleted = total > 0 && done === total;
  const hasCover = Boolean(group.coverImageUrl);

  const layoutId = `station-cover-${group.key}`;

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.985 }}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'group relative block w-full overflow-hidden rounded-[28px] text-right',
        'transition-shadow duration-300',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#EDF5F0]'
      )}
      style={{
        boxShadow:
          '0 10px 28px rgba(6, 78, 59, 0.14), 0 2px 8px rgba(15, 23, 42, 0.06), inset 0 1px 0 rgba(255,255,255,0.6)',
      }}
      aria-label={`כניסה לתחנה ${index + 1}: ${group.title}`}
    >
      <motion.div
        layoutId={layoutId}
        className="relative w-full overflow-hidden rounded-[28px]"
        style={{ aspectRatio: '16 / 11', minHeight: 220 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        {hasCover ? (
          <img
            src={group.coverImageUrl!}
            alt=""
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.06]"
            loading="lazy"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(135deg, #047857 0%, #0f766e 45%, #14b8a6 100%)',
            }}
          />
        )}

        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(6,78,59,0.10) 0%, rgba(6,78,59,0.35) 45%, rgba(6,15,23,0.82) 100%)',
          }}
        />

        <div
          className="absolute -top-12 -left-12 h-40 w-40 rounded-full opacity-60"
          style={{
            background:
              'radial-gradient(circle, rgba(167,243,208,0.55) 0%, transparent 70%)',
            filter: 'blur(22px)',
          }}
        />

        <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-2xl text-base font-black text-white shadow-lg"
            style={{
              background: 'linear-gradient(135deg, #047857, #10b981)',
              boxShadow: '0 6px 16px rgba(4,120,87,0.45), inset 0 1px 0 rgba(255,255,255,0.35)',
            }}
          >
            {index + 1}
          </div>
          {isCompleted ? (
            <div
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black text-white"
              style={{
                background: 'linear-gradient(135deg, rgba(16,185,129,0.95), rgba(52,211,153,0.95))',
                boxShadow: '0 4px 12px rgba(16,185,129,0.45)',
              }}
            >
              <CheckCircle2 className="h-3 w-3" /> הושלם
            </div>
          ) : null}
        </div>

        <div className="absolute top-3 left-3 z-10">
          <div
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-md"
            style={{
              background: 'rgba(255,255,255,0.18)',
              border: '1px solid rgba(255,255,255,0.28)',
            }}
          >
            <MapPin className="h-3 w-3" aria-hidden />
            תחנה
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-10 p-4 sm:p-5">
          <h3
            className="mb-1.5 line-clamp-2 text-right text-xl font-black leading-tight text-white drop-shadow-md sm:text-2xl"
            style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
          >
            {group.title}
          </h3>
          {group.description ? (
            <p className="mb-3 line-clamp-2 text-right text-[13px] leading-relaxed text-white/85">
              {group.description}
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div
                className="h-2 overflow-hidden rounded-full"
                style={{ background: 'rgba(255,255,255,0.22)' }}
              >
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${isEmpty ? 0 : pct}%` }}
                  transition={{ duration: 0.9, delay: 0.25 + index * 0.06, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full rounded-full"
                  style={{
                    background:
                      'linear-gradient(90deg, #a7f3d0, #34d399 60%, #fbbf24)',
                    boxShadow: '0 0 10px rgba(167,243,208,0.6)',
                  }}
                />
              </div>
              <p className="mt-1.5 text-right text-[11px] font-bold text-white/90">
                {isEmpty ? 'בקרוב' : `${done}/${total} צעדים · ${pct}%`}
              </p>
            </div>

            <div
              className="flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-black text-emerald-900 shadow-md transition-transform group-hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, #ffffff, #ecfdf5)',
                boxShadow: '0 6px 14px rgba(0,0,0,0.18)',
              }}
            >
              {isCompleted ? (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  הצג שוב
                </>
              ) : (
                <>
                  כניסה
                  <ArrowLeft className="h-3.5 w-3.5" />
                </>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.button>
  );
}
