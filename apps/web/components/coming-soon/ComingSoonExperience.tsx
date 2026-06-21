'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Brain, HeartPulse, Leaf, Play, Repeat, ShieldCheck, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { activeWordIndex, resolveLyrics, type ComingSoonLyrics } from '@/lib/coming-soon/lyrics';
import { resolveRevolutionLines } from '@/lib/coming-soon/revolution-lines';

const FEATURES = [
  { icon: Brain, title: 'מנטור AI אישי', desc: 'מלווה חכם שזוכר אותך, מבין אותך ומדבר בגובה העיניים — מתי שתצטרך.' },
  { icon: Leaf, title: 'בלי דיאטות קיצוניות', desc: 'שינוי עדין ובר-קיימא. בלי הרעבה, בלי ספירת קלוריות, בלי אשמה.' },
  { icon: HeartPulse, title: 'הרגלים שנשארים', desc: 'צעדים קטנים שמצטברים לשינוי אמיתי — כזה שמחזיק לאורך זמן.' },
  { icon: ShieldCheck, title: 'שקט וביטחון', desc: 'פחות לחץ, יותר בהירות. בריאות נפש וגוף שמרגישים בכל יום.' },
];

const CONFETTI_COLORS = ['#34d399', '#10b981', '#a3e635', '#5eead4', '#bbf7d0', '#ffffff', '#22d3ee'];

type Phase = 'intro' | 'lyrics' | 'loop';

type Confetti = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
};

type Spark = { x: number; y: number; r: number; speed: number; drift: number; tw: number };

function splitWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** מרנדר משפט עם הדגשות: טקסט עטוף ב-*...* מקבל גרדיאנט */
function renderEmphasis(text: string) {
  return text.split('*').map((part, i) =>
    i % 2 === 1 ? (
      <em key={i} className="cs-em">
        {part}
      </em>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

export function ComingSoonExperience({
  songUrl,
  songTitle,
  lyrics,
  revolutionLines,
}: {
  songUrl: string | null;
  songTitle: string | null;
  lyrics?: ComingSoonLyrics | null;
  revolutionLines?: string[] | null;
}) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [activeLine, setActiveLine] = useState(-1);
  const [activeWord, setActiveWord] = useState(-1);
  const [muted, setMuted] = useState(false);
  const [revIndex, setRevIndex] = useState(0);

  const revolution = useMemo(() => resolveRevolutionLines(revolutionLines), [revolutionLines]);
  const resolved = useMemo(() => resolveLyrics(lyrics), [lyrics]);
  const LINES = resolved.lines;
  const LYRICS_END = resolved.endsAt + 0.4;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const orbRef = useRef<HTMLDivElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  const energyRef = useRef(0.32);
  const phaseRef = useRef<Phase>('intro');
  const startMsRef = useRef(0);
  const confettiRef = useRef<Confetti[]>([]);
  const sparksRef = useRef<Spark[]>([]);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const lastDropRef = useRef(-1);

  // mirror resolved lyrics into refs for the RAF loop (stable deps)
  const linesRef = useRef(resolved.lines);
  const endsAtRef = useRef(LYRICS_END);
  const syncOffsetRef = useRef(resolved.syncOffset);
  useEffect(() => {
    linesRef.current = resolved.lines;
    endsAtRef.current = resolved.endsAt + 0.4;
    syncOffsetRef.current = resolved.syncOffset;
  }, [resolved]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const spawnConfetti = useCallback((amount: number, power: number) => {
    const { w, h } = sizeRef.current;
    const cx = w / 2;
    const cy = h * 0.44;
    for (let i = 0; i < amount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (2 + Math.random() * 6) * power;
      confettiRef.current.push({
        x: cx + (Math.random() - 0.5) * 80,
        y: cy + (Math.random() - 0.5) * 60,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        size: 4 + Math.random() * 9,
        color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
        life: 0,
        maxLife: 70 + Math.random() * 60,
      });
    }
    if (confettiRef.current.length > 900) {
      confettiRef.current.splice(0, confettiRef.current.length - 900);
    }
  }, []);

  /* ---------- Canvas: lightweight particles + visualizer + confetti ---------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = window.innerWidth;
      const h = window.innerHeight;
      sizeRef.current = { w, h, dpr };
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.min(56, Math.floor((w * h) / 26000));
      sparksRef.current = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.6 + Math.random() * 1.8,
        speed: 0.12 + Math.random() * 0.5,
        drift: (Math.random() - 0.5) * 0.3,
        tw: Math.random() * Math.PI * 2,
      }));
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = (now: number) => {
      const { w, h } = sizeRef.current;
      const t = now / 1000;
      const energy = energyRef.current;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';

      // ambient particles — no shadowBlur (cheap)
      for (const s of sparksRef.current) {
        s.y -= s.speed * (0.6 + energy * 1.4);
        s.x += s.drift + Math.sin(t + s.tw) * 0.28;
        if (s.y < -10) {
          s.y = h + 10;
          s.x = Math.random() * w;
        }
        const tw = 0.5 + 0.5 * Math.sin(t * 2 + s.tw);
        ctx.beginPath();
        ctx.fillStyle = `rgba(110,231,183,${(0.1 + tw * 0.32 * (0.5 + energy)).toFixed(3)})`;
        ctx.arc(s.x, s.y, s.r * (0.8 + energy * 0.7), 0, Math.PI * 2);
        ctx.fill();
      }

      // radial visualizer — strokes only, no shadow
      if (phaseRef.current !== 'intro') {
        const cx = w / 2;
        const cy = h * (phaseRef.current === 'lyrics' ? 0.44 : 0.3);
        const N = 56;
        const baseR = Math.min(w, h) * (phaseRef.current === 'lyrics' ? 0.17 : 0.12);
        ctx.lineWidth = 2.2;
        for (let i = 0; i < N; i++) {
          const a = (i / N) * Math.PI * 2;
          const wobble = 0.5 + 0.5 * Math.sin(i * 0.7 + t * 3.2);
          const len = baseR * (0.18 + energy * 0.9 * wobble);
          const hue = 140 + ((t * 24 + i * 2.4) % 60);
          const x1 = cx + Math.cos(a) * baseR;
          const y1 = cy + Math.sin(a) * baseR;
          const x2 = cx + Math.cos(a) * (baseR + len);
          const y2 = cy + Math.sin(a) * (baseR + len);
          ctx.beginPath();
          ctx.strokeStyle = `hsla(${hue}, 88%, ${56 + energy * 18}%, ${(0.28 + energy * 0.4).toFixed(3)})`;
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }

        const coreR = baseR * (0.75 + energy * 0.5);
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
        grad.addColorStop(0, `rgba(16,185,129,${(0.12 + energy * 0.16).toFixed(3)})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
        ctx.fill();
      }

      // confetti — no shadow
      const conf = confettiRef.current;
      for (let i = conf.length - 1; i >= 0; i--) {
        const c = conf[i];
        c.life++;
        c.vy += 0.12;
        c.vx *= 0.99;
        c.x += c.vx;
        c.y += c.vy;
        c.rot += c.vr;
        const lifeRatio = c.life / c.maxLife;
        if (lifeRatio >= 1) {
          conf.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.globalAlpha = 1 - lifeRatio;
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size * 0.6);
        ctx.restore();
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  /* ---------- Timing loop: energy + lyric/word sync ---------- */
  useEffect(() => {
    let raf = 0;
    const beatInterval = 0.46;

    const loop = (now: number) => {
      const tSec = (now - startMsRef.current) / 1000;
      const beat = (tSec % beatInterval) / beatInterval;
      const env = Math.pow(1 - beat, 2.4);
      let energy = 0.3 + 0.48 * env + 0.12 * Math.sin(tSec * 1.3);

      const audio = audioRef.current;
      if (phaseRef.current === 'lyrics' && audio) {
        const lines = linesRef.current;
        const endsAt = endsAtRef.current;
        const ct = audio.currentTime + syncOffsetRef.current;
        const dur = audio.duration && Number.isFinite(audio.duration) ? audio.duration : endsAt;
        if (progressBarRef.current) {
          progressBarRef.current.style.width = `${(dur > 0 ? Math.min(1, audio.currentTime / dur) : 0) * 100}%`;
        }

        let idx = -1;
        for (let i = 0; i < lines.length; i++) {
          if (ct >= lines[i].start && ct < lines[i].end) idx = i;
        }
        if (idx === -1) {
          for (let i = 0; i < lines.length; i++) {
            if (ct >= lines[i].start) idx = i;
          }
        }
        setActiveLine((prev) => (prev === idx ? prev : idx));

        if (idx >= 0) {
          const line = lines[idx];
          const wi = activeWordIndex(line, ct);
          setActiveWord((prev) => (prev === wi ? prev : wi));
          if (line.kind === 'drop' || line.kind === 'mega') {
            energy = Math.min(1.5, energy + 0.45 + env * 0.4);
          }
        }

        if (audio.currentTime >= endsAt - 0.05 || (audio.ended && phaseRef.current === 'lyrics')) {
          goToLoop();
        }
      }

      energyRef.current = energy;
      if (orbRef.current) orbRef.current.style.setProperty('--e', energy.toFixed(3));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- Pause audio when tab/page is hidden, resume when back ---------- */
  useEffect(() => {
    const audioAtMount = audioRef.current;
    const onVis = () => {
      const audio = audioRef.current;
      if (!audio) return;
      if (document.hidden) {
        audio.pause();
      } else if (phaseRef.current !== 'intro') {
        void audio.play().catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      audioAtMount?.pause();
    };
  }, []);

  useEffect(() => {
    if (phase !== 'lyrics' || activeLine < 0) return;
    const line = LINES[activeLine];
    if ((line?.kind === 'drop' || line?.kind === 'mega') && lastDropRef.current !== activeLine) {
      lastDropRef.current = activeLine;
      spawnConfetti(line.kind === 'mega' ? 240 : 130, line.kind === 'mega' ? 1.5 : 1.1);
    }
  }, [activeLine, phase, spawnConfetti, LINES]);

  useEffect(() => {
    if (phase !== 'loop') return;
    const id = setInterval(() => setRevIndex((i) => (i + 1) % revolution.length), 4800);
    return () => clearInterval(id);
  }, [phase, revolution.length]);

  const goToLoop = useCallback(() => {
    if (phaseRef.current === 'loop') return;
    phaseRef.current = 'loop';
    setPhase('loop');
    setActiveLine(-1);
    setActiveWord(-1);
    const audio = audioRef.current;
    if (audio) {
      audio.loop = true;
      if (audio.paused) void audio.play().catch(() => undefined);
    }
    spawnConfetti(200, 1.3);
  }, [spawnConfetti]);

  const startExperience = useCallback(() => {
    startMsRef.current = performance.now();
    lastDropRef.current = -1;
    const audio = audioRef.current;
    if (audio && songUrl) {
      audio.currentTime = 0;
      audio.loop = false;
      audio.muted = muted;
      audio.volume = 1;
      void audio.play().catch(() => undefined);
      setPhase('lyrics');
      phaseRef.current = 'lyrics';
    } else {
      goToLoop();
    }
  }, [songUrl, muted, goToLoop]);

  const replay = useCallback(() => {
    confettiRef.current = [];
    startExperience();
  }, [startExperience]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      if (audioRef.current) audioRef.current.muted = next;
      return next;
    });
  }, []);

  const current = activeLine >= 0 && activeLine < LINES.length ? LINES[activeLine] : null;
  const currentWords = current ? splitWords(current.text) : [];

  return (
    <main
      id="main-content"
      dir="rtl"
      className="fixed inset-0 z-0 overflow-hidden bg-black text-white"
      style={{ fontFamily: 'Rubik, Heebo, system-ui, sans-serif' }}
    >
      {/* subtle dark vignette only — clean black canvas */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(8,20,16,0.6), #000 75%)' }}
        aria-hidden
      />

      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />

      {songUrl ? <audio ref={audioRef} src={songUrl} preload="auto" playsInline /> : null}

      {/* top controls */}
      {phase !== 'intro' && (
        <div className="absolute left-0 right-0 top-0 z-30 flex items-center justify-between p-4 sm:p-6">
          <button
            type="button"
            onClick={toggleMute}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5 backdrop-blur-md transition hover:bg-white/15"
            aria-label={muted ? 'בטל השתקה' : 'השתק'}
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          {phase === 'lyrics' && (
            <button
              type="button"
              onClick={goToLoop}
              className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/75 backdrop-blur-md transition hover:bg-white/15"
            >
              דלג ←
            </button>
          )}
        </div>
      )}

      {phase === 'lyrics' && (
        <div className="absolute bottom-0 left-0 right-0 z-30 h-1.5 bg-white/10">
          <div
            ref={progressBarRef}
            className="h-full bg-gradient-to-l from-emerald-400 via-teal-300 to-lime-300 shadow-[0_0_18px_rgba(52,211,153,0.9)]"
            style={{ width: '0%' }}
          />
        </div>
      )}

      {/* energy orb (subtle) */}
      <div
        ref={orbRef}
        className="pointer-events-none absolute inset-0"
        style={{ '--e': '0.32' } as React.CSSProperties}
        aria-hidden
      >
        <div className="cs-orb" />
      </div>

      {/* ===================== INTRO / LYRICS ===================== */}
      {phase !== 'loop' && (
        <div className="relative z-20 flex h-full w-full items-center justify-center px-5">
          <AnimatePresence mode="wait">
            {phase === 'intro' && (
              <motion.div
                key="intro"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.1, filter: 'blur(8px)' }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
                className="relative z-20 flex flex-col items-center text-center"
              >
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2, duration: 0.6 }}
                  className="mb-6 flex h-24 w-24 items-center justify-center rounded-[2rem] bg-gradient-to-br from-emerald-400 via-teal-500 to-lime-400 text-5xl font-black text-[#04231a] shadow-[0_0_60px_rgba(52,211,153,0.6)] sm:h-28 sm:w-28"
                >
                  N
                </motion.div>
                <motion.h1
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.32, duration: 0.6 }}
                  className="cs-gradient-text text-5xl font-black tracking-tight sm:text-7xl"
                >
                  NuraWell<span className="cs-ai">.AI</span>
                </motion.h1>
                <motion.p
                  initial={{ y: 16, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.46, duration: 0.6 }}
                  className="mt-3 text-lg font-light tracking-[0.32em] text-emerald-100/60 sm:text-2xl"
                >
                  ב ק ר ו ב
                </motion.p>

                <motion.button
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.7, duration: 0.5, type: 'spring' }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={startExperience}
                  className="cs-cta group mt-10 flex items-center gap-3 rounded-full bg-gradient-to-l from-emerald-500 via-teal-500 to-lime-400 px-9 py-4 text-lg font-black text-[#04231a] shadow-[0_0_40px_rgba(52,211,153,0.55)]"
                >
                  <Play className="h-6 w-6 fill-[#04231a]" />
                  {songUrl ? 'התחל את החוויה' : 'כניסה'}
                </motion.button>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1, duration: 0.5 }}
                  className="mt-5 text-sm text-emerald-100/45"
                >
                  {songUrl ? 'מומלץ לחוות עם קול 🔊' : 'השיר טרם הוגדר בלוח הבקרה'}
                </motion.p>
              </motion.div>
            )}

            {phase === 'lyrics' && (
              <motion.div
                key="lyrics"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="relative z-20 flex w-full max-w-5xl flex-col items-center text-center"
              >
                <AnimatePresence mode="wait">
                  {current && (
                    <motion.div
                      key={activeLine}
                      initial={{ opacity: 0, y: 36, scale: 0.86, filter: 'blur(8px)' }}
                      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                      exit={{ opacity: 0, y: -24, scale: 1.1, filter: 'blur(6px)' }}
                      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                      className="flex flex-col items-center"
                    >
                      {current.kind === 'drop' || current.kind === 'mega' ? (
                        <motion.div
                          animate={{ scale: [1, 1.06, 1] }}
                          transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}
                          className="flex flex-col items-center"
                        >
                          <span
                            className={`cs-drop-text font-black leading-none ${
                              current.kind === 'mega'
                                ? 'text-[17vw] sm:text-[12rem]'
                                : 'text-[13vw] sm:text-[9rem]'
                            }`}
                          >
                            {current.text}
                            <span className="cs-ai-drop">.AI</span>
                          </span>
                          {current.tag && (
                            <motion.span
                              initial={{ scale: 0, rotate: -20 }}
                              animate={{ scale: 1, rotate: -8 }}
                              transition={{ type: 'spring', stiffness: 300, delay: 0.1 }}
                              className="mt-3 rounded-full bg-lime-300 px-6 py-1.5 text-2xl font-black text-[#04231a] shadow-[0_0_36px_rgba(163,230,53,0.95)] sm:text-3xl"
                            >
                              {current.tag}
                            </motion.span>
                          )}
                        </motion.div>
                      ) : (
                        <div className="flex max-w-4xl flex-wrap items-center justify-center gap-x-3 gap-y-3 px-2">
                          {currentWords.map((word, i) => (
                            <span
                              key={`${activeLine}-${i}`}
                              className={
                                i === activeWord
                                  ? 'cs-word cs-word-active text-4xl font-black leading-tight sm:text-7xl'
                                  : 'cs-word cs-word-idle text-4xl font-black leading-tight sm:text-7xl'
                              }
                            >
                              {word}
                            </span>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ===================== LOOP / REVEAL + MINI LANDING ===================== */}
      {phase === 'loop' && (
        <div className="relative z-20 h-full w-full overflow-y-auto overflow-x-hidden">
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center px-5 py-16 text-center sm:py-20">
            {/* grand "המהפכה מתחילה" header */}
            <motion.div
              initial={{ y: 16, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, duration: 0.7, ease: 'easeOut' }}
              className="cs-revolution-badge"
            >
              <span className="cs-revolution-dot" />
              <span className="cs-revolution-text">המהפכה מתחילה</span>
              <Sparkles className="h-4 w-4 text-lime-300" />
            </motion.div>

            <motion.h1
              initial={{ y: 28, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.28, duration: 0.7 }}
              className="cs-gradient-text mt-6 text-6xl font-black tracking-tight sm:text-8xl"
            >
              NuraWell<span className="cs-ai">.AI</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.46, duration: 0.7 }}
              className="mt-3 text-lg font-light tracking-[0.18em] text-emerald-100/65 sm:text-2xl"
            >
              הדרך החכמה לחיים בריאים
            </motion.p>

            {/* rotating psychological line — readable glass card, nicer type */}
            <div className="mt-10 w-full max-w-2xl">
              <div className="cs-glass-card relative flex min-h-[9.5rem] items-center justify-center px-6 py-8 sm:min-h-[10rem] sm:px-10">
                <span className="cs-quote" aria-hidden>
                  ”
                </span>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={revIndex}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -14 }}
                    transition={{ duration: 0.55, ease: 'easeOut' }}
                    className="cs-quote-text text-balance text-2xl leading-[1.5] sm:text-[2rem] sm:leading-[1.5]"
                  >
                    {renderEmphasis(revolution[revIndex] ?? '')}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>

            {/* mini landing — feature cards */}
            <div className="mt-12 grid w-full grid-cols-1 gap-4 sm:mt-16 sm:grid-cols-2">
              {FEATURES.map((f, i) => {
                const Icon = f.icon;
                return (
                  <motion.div
                    key={f.title}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{ duration: 0.55, delay: 0.05 * i }}
                    className="cs-glass-card flex flex-col items-center gap-3 px-5 py-6 text-center sm:items-start sm:text-right"
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400/90 to-teal-500/90 text-[#04231a] shadow-[0_0_24px_rgba(45,212,191,0.45)]">
                      <Icon className="h-6 w-6" />
                    </span>
                    <h3 className="text-lg font-black text-white sm:text-xl">{f.title}</h3>
                    <p className="text-sm leading-relaxed text-emerald-50/75 sm:text-[15px]">{f.desc}</p>
                  </motion.div>
                );
              })}
            </div>

            {/* closing CTA */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="cs-glass-card mt-12 flex w-full max-w-2xl flex-col items-center gap-4 px-6 py-9 sm:mt-16"
            >
              <span className="flex items-center gap-2 rounded-full bg-lime-300/90 px-4 py-1.5 text-sm font-black text-[#04231a] shadow-[0_0_28px_rgba(163,230,53,0.55)]">
                <Sparkles className="h-4 w-4" />
                בקרוב מאוד
              </span>
              <p className="cs-headline text-balance text-2xl leading-snug sm:text-4xl">
                המסע שישנה לך את החיים — כבר ממש כאן.
              </p>
              <p className="max-w-md text-balance text-sm leading-relaxed text-emerald-50/70 sm:text-base">
                בלי דיאטות, בלי ספירת קלוריות, בלי הרעבה. רק אתה, מנטור AI שמבין אותך, ודרך חדשה להרגיש טוב בגוף ובנפש.
              </p>

              {songUrl && (
                <button
                  type="button"
                  onClick={replay}
                  className="mt-2 flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-bold text-white/85 backdrop-blur-md transition hover:bg-white/15"
                >
                  <Repeat className="h-4 w-4" />
                  צפה שוב בפתיח
                </button>
              )}
            </motion.div>

            {songTitle && <p className="mt-8 text-xs text-emerald-100/30">♪ {songTitle}</p>}
          </div>
        </div>
      )}

      <style>{`
        .cs-orb {
          position: absolute;
          top: 44%; left: 50%;
          width: 38vmin; height: 38vmin;
          transform: translate(-50%, -50%) scale(calc(0.8 + var(--e) * 0.45));
          border-radius: 9999px;
          background: radial-gradient(circle, rgba(16,185,129,calc(0.1 + var(--e) * 0.16)), transparent 65%);
          filter: blur(26px);
          transition: transform 0.08s linear;
        }

        .cs-gradient-text {
          background: linear-gradient(100deg, #bbf7d0, #34d399, #5eead4, #a3e635, #bbf7d0);
          background-size: 300% 100%;
          -webkit-background-clip: text; background-clip: text; color: transparent;
          animation: csShimmer 6s linear infinite;
          text-shadow: 0 0 50px rgba(52,211,153,0.35);
        }
        @keyframes csShimmer { to { background-position: 300% 0; } }

        .cs-ai {
          background: linear-gradient(120deg, #a3e635, #34d399);
          -webkit-background-clip: text; background-clip: text; color: transparent;
          font-weight: 900;
        }
        .cs-ai-drop {
          font-size: 0.42em; vertical-align: super;
          display: inline-block;
          width: 0;
          margin-inline-start: 0.04em;
          transform: translateY(-0.08em) scale(0.62);
          transform-origin: 0 0;
          background: linear-gradient(120deg, #a3e635, #5eead4);
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        @media (max-width: 640px) {
          .cs-ai-drop {
            transform: translateY(-0.12em) scale(0.5);
            margin-inline-start: 0.02em;
          }
        }

        /* ---- karaoke words ---- */
        .cs-word {
          display: inline-block;
          padding: 0.08em 0.34em;
          border-radius: 0.55em;
          transition: transform 0.16s cubic-bezier(0.22,1,0.36,1), color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
        }
        .cs-word-idle { color: rgba(255,255,255,0.34); }
        .cs-word-active {
          color: #04231a;
          background: linear-gradient(135deg, #a3e635, #34d399);
          transform: translateY(-6px) scale(1.1);
          box-shadow: 0 10px 36px rgba(52,211,153,0.55), 0 0 50px rgba(163,230,53,0.5);
        }

        .cs-drop-text {
          background: linear-gradient(120deg, #bbf7d0, #34d399, #5eead4, #a3e635, #bbf7d0);
          background-size: 300% 100%;
          -webkit-background-clip: text; background-clip: text; color: transparent;
          animation: csShimmer 2.5s linear infinite;
          filter: drop-shadow(0 0 40px rgba(52,211,153,0.6));
          letter-spacing: -0.02em;
        }

        .cs-glass-card {
          border-radius: 1.6rem;
          border: 1px solid rgba(255,255,255,0.14);
          background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(16,185,129,0.05));
          box-shadow: 0 10px 44px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.16);
          backdrop-filter: blur(20px) saturate(135%);
          -webkit-backdrop-filter: blur(20px) saturate(135%);
        }

        /* ---- revolution badge (grand) ---- */
        .cs-revolution-badge {
          position: relative;
          display: inline-flex; align-items: center; gap: 0.6rem;
          padding: 0.6rem 1.4rem;
          border-radius: 9999px;
          font-size: 0.8rem; font-weight: 800; letter-spacing: 0.18em;
          color: #ecfdf5;
          background: rgba(6,20,15,0.6);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
        }
        .cs-revolution-badge::before {
          content: ''; position: absolute; inset: 0;
          border-radius: 9999px; padding: 1.5px;
          background: linear-gradient(90deg, #a3e635, #34d399, #5eead4, #a3e635);
          background-size: 200% 100%;
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude;
          animation: csShimmer 3s linear infinite;
        }
        .cs-revolution-text {
          background: linear-gradient(100deg, #d9f99d, #5eead4);
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        .cs-revolution-dot {
          width: 0.55rem; height: 0.55rem; border-radius: 9999px;
          background: #a3e635; box-shadow: 0 0 14px #a3e635;
          animation: csPulse 1.6s ease-in-out infinite;
        }
        @keyframes csPulse { 0%,100%{opacity:1; transform:scale(1)} 50%{opacity:0.4; transform:scale(0.7)} }

        /* ---- quote / sentences typography ---- */
        .cs-quote {
          position: absolute; top: -0.2rem; right: 1.1rem;
          font-family: var(--font-cormorant), serif;
          font-size: 5rem; line-height: 1; color: rgba(163,230,53,0.35);
          pointer-events: none; user-select: none;
        }
        .cs-quote-text {
          font-weight: 700; color: #f0fdf4;
          letter-spacing: 0.005em;
          text-shadow: 0 2px 18px rgba(0,0,0,0.5);
        }
        .cs-em {
          font-style: normal; font-weight: 900;
          background: linear-gradient(120deg, #a3e635, #5eead4);
          -webkit-background-clip: text; background-clip: text; color: transparent;
          text-shadow: 0 0 24px rgba(163,230,53,0.25);
        }
        .cs-headline {
          font-weight: 900; color: #ffffff;
          letter-spacing: -0.01em;
          text-shadow: 0 2px 22px rgba(0,0,0,0.5);
        }

        .cs-cta { position: relative; }
        .cs-cta::after {
          content: ''; position: absolute; inset: -3px; border-radius: 9999px;
          background: linear-gradient(90deg, #a3e635, #5eead4, #a3e635);
          background-size: 200% 100%;
          z-index: -1; filter: blur(14px); opacity: 0.6;
          animation: csShimmer 3s linear infinite;
        }

        .text-balance { text-wrap: balance; }

        @media (prefers-reduced-motion: reduce) {
          .cs-gradient-text, .cs-drop-text, .cs-cta::after, .cs-revolution-badge::before, .cs-revolution-dot { animation: none !important; }
        }
      `}</style>
    </main>
  );
}
