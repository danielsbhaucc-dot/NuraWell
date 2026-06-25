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

const CONFETTI_COLORS = ['#c9a962', '#5a9a8a', '#8fb5a8', '#a8c4b8', '#d4c4a0', '#6b9080'];

type BubbleStyle = {
  background: string;
  color: string;
  border: string;
  boxShadow?: string;
};

/** מסלול מהיר — יער עמוק, זכוכית מט, מקצועי */
export const QUICK_CHAT_BG =
  'linear-gradient(180deg, rgba(7,20,31,0.5) 0%, rgba(15,35,30,0.72) 48%, #07141f 100%)';

export const QUICK_HEADER_BG =
  'linear-gradient(165deg, #0c1f1a 0%, #152e28 48%, #0a141c 100%)';

export const QUICK_PATH_SELECT_BORDER =
  'linear-gradient(135deg, rgba(100,149,137,0.42), rgba(45,212,191,0.22))';

export const QUICK_PATH_SELECT_FILL =
  'linear-gradient(148deg, #0f1f1b 0%, #1a332c 55%, #142820 100%)';

export const QUICK_ASSISTANT_BUBBLE: BubbleStyle = {
  background: 'linear-gradient(152deg, #152e28 0%, #1f453c 52%, #285a4d 100%)',
  color: '#ecfdf5',
  border: '1px solid rgba(167, 243, 208, 0.16)',
  boxShadow: '0 8px 24px rgba(4, 44, 34, 0.4), inset 0 1px 0 rgba(255,255,255,0.07)',
};

export const QUICK_USER_BUBBLE: BubbleStyle = {
  background: 'rgba(15, 23, 42, 0.58)',
  color: '#e2e8f0',
  border: '1px solid rgba(100, 116, 139, 0.22)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
};

export const QUICK_SEND_BUTTON =
  'linear-gradient(145deg, #1f453c 0%, #2d5a4a 100%)';

/** מסלול כייפי — ירקן-עמוק עם נגיעת שמפניה, לא קשת */
export const FUN_CHAT_BG =
  'linear-gradient(180deg, rgba(26,64,57,0.32) 0%, rgba(10,16,24,0.94) 68%, #0a1018 100%)';

export const FUN_HEADER_BG =
  'linear-gradient(160deg, #1a4039 0%, #265a50 46%, #2a3830 100%)';

export const FUN_ASSISTANT_BUBBLE: BubbleStyle = {
  background: 'linear-gradient(152deg, #1a4039 0%, #265a50 50%, #2f6759 100%)',
  color: '#f7fdfb',
  border: '1px solid rgba(201, 169, 98, 0.22)',
  boxShadow: '0 10px 28px rgba(26, 64, 57, 0.38), inset 0 1px 0 rgba(255, 248, 235, 0.09)',
};

export const FUN_USER_BUBBLE: BubbleStyle = {
  background: 'rgba(255, 248, 235, 0.07)',
  color: '#f1f5f9',
  border: '1px solid rgba(201, 169, 98, 0.16)',
};

export const FUN_SEND_BUTTON =
  'linear-gradient(145deg, #265a50 0%, #3d7266 100%)';

export const FUN_AVATAR_RING =
  'linear-gradient(135deg, rgba(201,169,98,0.55), rgba(45,212,191,0.35), rgba(201,169,98,0.55))';

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
        style={{ background: 'radial-gradient(circle, rgba(201,169,98,0.14) 0%, transparent 70%)' }}
        animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.75, 0.5] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -bottom-16 -right-10 h-48 w-48 rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(45,212,191,0.12) 0%, transparent 70%)' }}
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
        className="absolute -inset-[1.5px] rounded-[32px]"
        style={{ background: 'linear-gradient(135deg, rgba(201,169,98,0.45), rgba(45,212,191,0.28))' }}
        animate={{ opacity: [0.75, 1, 0.75] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div
        className="relative m-[1.5px] overflow-hidden rounded-[30.5px] px-5 py-5"
        style={{
          background: 'linear-gradient(155deg, #1a4039 0%, #265a50 55%, #223830 100%)',
          boxShadow: '0 16px 40px rgba(26, 64, 57, 0.35)',
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
          <p className="mt-3 text-[11px] font-bold text-stone-200/80">
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
        style={{ background: QUICK_PATH_SELECT_BORDER }}
      />
      <div
        className="relative m-[1px] flex items-center gap-3 rounded-[27px] px-4 py-4"
        style={{
          background: QUICK_PATH_SELECT_FILL,
          boxShadow: '0 12px 32px rgba(7, 20, 31, 0.45)',
        }}
      >
        <Zap className="h-6 w-6 text-emerald-200/90 shrink-0" />
        <span className="text-right">
          <span className="block text-white font-black text-sm">מסלול מהיר</span>
          <span className="block text-slate-300/90 text-xs mt-0.5">ישיר, רציני, בלי בדיחות</span>
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
        className="text-[11px] font-bold text-stone-200/85 px-0.5"
      >
        {FUN_TYPING_LINES[idx]}
      </motion.span>
    </AnimatePresence>
  );
}

