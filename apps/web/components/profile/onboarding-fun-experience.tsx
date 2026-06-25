'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, Zap } from 'lucide-react';

export const FUN_TYPING_LINES = [
  'אלמוג מחפש את הבדיחה המושלמת…',
  'אלמוג מקליד בחיוך…',
  'רגע, זה טוב מדי…',
  'אלמוג שואל את עצמו אם זה מצחיק…',
  'אלמוג מכין פאנץ…',
] as const;

const FLOAT_EMOJIS = ['✨', '🎉', '😅', '🍕', '💫', '🎭', '🔥', '🌈'] as const;

const CONFETTI_COLORS = ['#fbbf24', '#34d399', '#fb923c', '#38bdf8', '#f472b6', '#a3e635'];

type Particle = { id: number; x: number; y: number; emoji: string; delay: number; duration: number };

export function HeaderTypingDots({ className = '' }: { className?: string }) {
  const [dots, setDots] = useState(1);

  useEffect(() => {
    const t = window.setInterval(() => {
      setDots((d) => (d % 3) + 1);
    }, 420);
    return () => window.clearInterval(t);
  }, []);

  return (
    <span className={className} aria-live="polite">
      מקליד{'.'.repeat(dots)}
    </span>
  );
}

export function FunFloatingAmbience() {
  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        id: i,
        x: 8 + Math.random() * 84,
        y: 10 + Math.random() * 80,
        emoji: FLOAT_EMOJIS[i % FLOAT_EMOJIS.length],
        delay: Math.random() * 2.5,
        duration: 4.5 + Math.random() * 3,
      })),
    []
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className="absolute text-lg select-none"
          style={{ left: `${p.x}%`, top: `${p.y}%` }}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{
            opacity: [0, 0.55, 0.35, 0.6, 0],
            y: [0, -18, -8, -28, -40],
            rotate: [0, 12, -8, 16, 0],
            scale: [0.7, 1.05, 0.95, 1.1, 0.8],
          }}
          transition={{ duration: p.duration, repeat: Infinity, delay: p.delay, ease: 'easeInOut' }}
        >
          {p.emoji}
        </motion.span>
      ))}
      <motion.div
        className="absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.32) 0%, transparent 70%)' }}
        animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.75, 0.5] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -bottom-16 -right-10 h-48 w-48 rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(20,184,166,0.28) 0%, transparent 70%)' }}
        animate={{ scale: [1.1, 0.95, 1.1], opacity: [0.4, 0.65, 0.4] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
      />
    </div>
  );
}

export function FunConfettiBurst({ active }: { active: boolean }) {
  const [pieces, setPieces] = useState<{ id: number; x: number; color: string; rotate: number }[]>([]);

  useEffect(() => {
    if (!active) return;
    setPieces(
      Array.from({ length: 36 }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 280,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotate: Math.random() * 720 - 360,
      }))
    );
    const t = window.setTimeout(() => setPieces([]), 1400);
    return () => window.clearTimeout(t);
  }, [active]);

  if (!pieces.length) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-28 z-30 flex justify-center" aria-hidden>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute h-2.5 w-1.5 rounded-sm"
          style={{ backgroundColor: p.color }}
          initial={{ opacity: 1, y: 0, x: 0, rotate: 0 }}
          animate={{ opacity: 0, y: 120 + Math.random() * 80, x: p.x, rotate: p.rotate }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}

export function FunPathSelectHero({ onSelect }: { onSelect: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      className="relative w-full overflow-hidden rounded-[32px] text-right active:scale-[0.98]"
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.08 }}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
    >
      <motion.div
        className="absolute -inset-[2px] rounded-[32px]"
        style={{
          background:
            'conic-gradient(from 0deg, #fbbf24, #34d399, #fb923c, #38bdf8, #fbbf24)',
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
      />
      <div
        className="relative m-[2px] overflow-hidden rounded-[30px] px-5 py-5"
        style={{
          background:
            'linear-gradient(145deg, rgba(13,148,136,0.96) 0%, rgba(5,150,105,0.94) 42%, rgba(234,88,12,0.9) 100%)',
        }}
      >
        <FunFloatingAmbience />
        <div className="relative z-10">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-black text-white backdrop-blur-sm">
              <Sparkles className="h-3 w-3" />
              הכי כיף
            </span>
            <motion.span
              className="text-2xl"
              animate={{ rotate: [0, -12, 12, 0], scale: [1, 1.15, 1] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            >
              🎉
            </motion.span>
          </div>
          <p className="text-[20px] font-black leading-tight text-white">מסלול הכייפי</p>
          <p className="mt-1.5 text-[13px] font-semibold leading-relaxed text-white/90">
            אלמוג בלי פילטרים (כמעט) — בדיחות, פאנץ&apos; ושאלות שלא ציפית להן
          </p>
          <p className="mt-3 text-[11px] font-bold text-amber-100/90">
            לחץ ותקבל קונפטי. ברצינות.
          </p>
        </div>
      </div>
    </motion.button>
  );
}

export function QuickPathSelectCard({ onSelect }: { onSelect: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      className="relative w-full overflow-hidden rounded-[28px] text-right active:scale-[0.98]"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 280, damping: 24, delay: 0.14 }}
      whileTap={{ scale: 0.98 }}
    >
      <div
        className="absolute -inset-[1px] rounded-[28px] opacity-90"
        style={{
          background: 'linear-gradient(135deg, rgba(56,189,248,0.7), rgba(16,185,129,0.75))',
        }}
      />
      <div
        className="relative m-[1px] flex items-center gap-3 rounded-[27px] px-4 py-4"
        style={{
          background: 'linear-gradient(135deg, rgba(8,145,178,0.95) 0%, rgba(5,150,105,0.92) 100%)',
          boxShadow: '0 10px 28px rgba(14,165,233,0.22)',
        }}
      >
        <Zap className="h-6 w-6 text-sky-100 shrink-0" />
        <span className="text-right">
          <span className="block text-white font-black text-sm">מסלול מהיר</span>
          <span className="block text-emerald-100/90 text-xs mt-0.5">ישיר, רציני, בלי בדיחות</span>
        </span>
      </div>
    </motion.button>
  );
}

export function FunTypingLine() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => {
      setIdx((i) => (i + 1) % FUN_TYPING_LINES.length);
    }, 2200);
    return () => window.clearInterval(t);
  }, []);

  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={idx}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.25 }}
        className="text-[11px] font-bold text-amber-100/90 px-0.5"
      >
        {FUN_TYPING_LINES[idx]}
      </motion.span>
    </AnimatePresence>
  );
}

export const FUN_CHAT_BG =
  'linear-gradient(180deg, rgba(13,148,136,0.38) 0%, rgba(234,88,12,0.18) 38%, rgba(12,18,34,0.96) 72%, #0c1222 100%)';

export const FUN_HEADER_BG =
  'linear-gradient(160deg, #0f766e 0%, #059669 45%, #ea580c 100%)';

export const FUN_ASSISTANT_BUBBLE = {
  background: 'linear-gradient(145deg, #0d9488 0%, #14b8a6 42%, #f59e0b 100%)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.22)',
  boxShadow: '0 8px 28px rgba(20,184,166,0.32)',
};

export const FUN_USER_BUBBLE = {
  background: 'rgba(255,255,255,0.13)',
  color: '#f0fdfa',
  border: '1px solid rgba(52,211,153,0.28)',
};

export const FUN_AVATAR_RING =
  'conic-gradient(from 0deg, #34d399, #fbbf24, #fb923c, #38bdf8, #34d399)';
