'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { AlmogAvatarChip } from './AlmogPresence';
import {
  dispatchOpenAlmogChatWithPrefill,
} from '../../lib/notifications/open-almog-chat';

type AdaptiveNextStep = {
  step_id: string | null;
  step_number: number | null;
  step_title: string | null;
  headline: string;
  why: string;
  nudge: string;
  commitment_suggestion: string | null;
  pace: 'start' | 'continue' | 'return' | 'complete';
};

export function JourneyNextStepCard() {
  const [rec, setRec] = useState<AdaptiveNextStep | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/v1/ai/journey-next-step', { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as { recommendation?: AdaptiveNextStep };
        if (alive && json.recommendation) setRec(json.recommendation);
      } catch {
        /* silent */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div
        dir="rtl"
        className="glass-surface relative mb-5 overflow-hidden p-4"
        style={{ borderRadius: '22px' }}
      >
        <div className="h-3 w-32 rounded-full bg-emerald-200/60 animate-pulse mb-3" />
        <div className="h-3 w-full rounded-full bg-emerald-100/70 animate-pulse mb-2" />
        <div className="h-3 w-4/5 rounded-full bg-emerald-100/70 animate-pulse" />
      </div>
    );
  }

  if (!rec) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      dir="rtl"
      className="glass-surface relative mb-5 overflow-hidden p-4"
      style={{
        borderRadius: '22px',
        border: '1px solid rgba(16,185,129,0.28)',
        boxShadow:
          '0 10px 28px rgba(4,120,87,0.14), inset 0 1px 0 rgba(255,255,255,0.55)',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-4 top-px h-px"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent)',
        }}
      />

      <div className="flex items-center gap-2.5 mb-3">
        <AlmogAvatarChip size={32} />
        <div className="text-right">
          <span
            style={{
              fontSize: '13px',
              fontWeight: 800,
              color: '#022c22',
              fontFamily: "'Rubik','Heebo',sans-serif",
            }}
          >
            {rec.pace === 'return' ? 'בוא נחזור בעדינות' : 'חשבתי עליך — הצעד הבא'}
          </span>
          <p className="text-[11.5px] text-emerald-800/65 leading-snug">
            זה מה שהייתי ממליץ לך עכשיו
          </p>
        </div>
      </div>

      <p
        className="text-[15px] font-black leading-snug mb-1.5"
        style={{ color: '#0f3d2e', fontFamily: "'Rubik','Heebo',sans-serif" }}
      >
        {rec.headline}
      </p>

      <p style={{ fontSize: '13.5px', lineHeight: 1.6, color: '#065f46', margin: '0 0 6px' }}>
        {rec.why}
      </p>
      <p style={{ fontSize: '12.5px', lineHeight: 1.55, color: '#047857', margin: '0 0 12px', opacity: 0.9 }}>
        {rec.nudge}
      </p>

      {rec.commitment_suggestion ? (
        <div
          className="mb-3 flex items-start gap-2 rounded-xl p-2.5"
          style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.2)' }}
        >
          <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden />
          <span style={{ fontSize: '12.5px', color: '#065f46', lineHeight: 1.5 }}>
            אני מציע: {rec.commitment_suggestion}
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {rec.step_id ? (
          <Link
            href={`/journey/${rec.step_id}`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white active:scale-[0.98] transition"
            style={{
              background: 'linear-gradient(145deg, #047857, #10b981)',
              boxShadow: '0 6px 16px rgba(16,185,129,0.25)',
            }}
          >
            {rec.pace === 'return' ? 'בוא נחזור בעדינות' : rec.pace === 'start' ? 'בוא נתחיל' : 'קדימה לצעד'}
            <ArrowLeft className="w-4 h-4" aria-hidden />
          </Link>
        ) : null}
        <button
          type="button"
          onClick={() =>
            dispatchOpenAlmogChatWithPrefill(
              rec.step_title
                ? `אלמוג, בוא נדבר על "${rec.step_title}" — מה הכי כדאי לי לשים עליו דגש?`
                : 'אלמוג, מה הצעד הבא שהכי מתאים לי עכשיו?'
            )
          }
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition active:scale-[0.98]"
          style={{
            background: 'rgba(16,185,129,0.10)',
            color: '#047857',
            border: '1px solid rgba(16,185,129,0.25)',
          }}
        >
          יש לי שאלה
        </button>
      </div>
    </motion.div>
  );
}
