'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Play, Repeat, Volume2, VolumeX } from 'lucide-react';

/* ============================================================
 * מילות השיר — מתוזמנות ל-30 שניות (מתכווצות/נמתחות אוטומטית
 * לפי אורך הקובץ בפועל). drop = שורת NuraWell עם פיצוץ אפקטים.
 * ============================================================ */
type LyricLine = {
  t: number;
  text: string;
  tag?: string;
  drop?: boolean;
  mega?: boolean;
};

const LYRICS: LyricLine[] = [
  { t: 0.4, text: 'הלילה נצבע באור חדש' },
  { t: 4.2, text: 'הלב נפתח, אין בו חשש' },
  { t: 8.0, text: 'לרקוד איתך עד אינסוף' },
  { t: 11.8, text: 'לגלות את כל היופי שוב' },
  { t: 15.6, text: 'NuraWell', tag: 'כן!', drop: true },
  { t: 19.6, text: 'NuraWell', drop: true },
  { t: 22.2, text: 'מרגיש הכי חזק שיש' },
  { t: 26.2, text: 'NuraWell!!!', drop: true, mega: true },
];
const LYRICS_REF_DURATION = 30;
const LYRICS_END_REF = 30;

const REVOLUTION_LINES = [
  'הגוף שלך מקשיב לכל מילה שאתה אומר לעצמך.',
  'שינוי אמיתי לא מתחיל בדיאטה — הוא מתחיל בראש.',
  'NuraWell היא לא עוד אפליקציה. זו מהפכה בדרך שבה אתה רואה את עצמך.',
  'כל בחירה קטנה היום היא ההשקעה הכי חכמה במי שתהיה מחר.',
  'אתה לא צריך כוח רצון אינסופי — אתה צריך מערכת שמבינה אותך.',
  'הביטחון שחיפשת תמיד נמצא בצד השני של ההרגלים החדשים שלך.',
  'אנחנו לא מודדים רק קילוגרמים. אנחנו מודדים את ההערכה העצמית שחוזרת.',
  'המוח שלך אוהב ניצחונות קטנים — וכאן תקבל אותם כל יום.',
  'התשוקה לשינוי כבר בתוכך. אנחנו רק מציתים אותה.',
  'בקרוב מאוד — המסע שישנה לך את החיים מתחיל.',
];

const CONFETTI_COLORS = ['#a855f7', '#ec4899', '#22d3ee', '#fbbf24', '#34d399', '#ffffff', '#818cf8'];

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

type Spark = {
  x: number;
  y: number;
  r: number;
  speed: number;
  drift: number;
  tw: number;
  hue: number;
};

export function ComingSoonExperience({
  songUrl,
  songTitle,
}: {
  songUrl: string | null;
  songTitle: string | null;
}) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [activeLine, setActiveLine] = useState(-1);
  const [muted, setMuted] = useState(false);
  const [revIndex, setRevIndex] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const orbRef = useRef<HTMLDivElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  const energyRef = useRef(0.35);
  const phaseRef = useRef<Phase>('intro');
  const startMsRef = useRef(0);
  const confettiRef = useRef<Confetti[]>([]);
  const sparksRef = useRef<Spark[]>([]);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const lastDropRef = useRef(-1);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const scaledLyrics = useCallback(() => {
    const dur = audioRef.current?.duration;
    const scale = dur && Number.isFinite(dur) && dur > 5 ? dur / LYRICS_REF_DURATION : 1;
    return { scale };
  }, []);

  const spawnConfetti = useCallback((amount: number, power: number) => {
    const { w, h } = sizeRef.current;
    const cx = w / 2;
    const cy = h * 0.46;
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
        size: 4 + Math.random() * 8,
        color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
        life: 0,
        maxLife: 70 + Math.random() * 60,
      });
    }
    if (confettiRef.current.length > 1400) {
      confettiRef.current.splice(0, confettiRef.current.length - 1400);
    }
  }, []);

  /* ---------- Canvas: particles + radial visualizer + confetti ---------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      sizeRef.current = { w, h, dpr };
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.min(120, Math.floor((w * h) / 14000));
      sparksRef.current = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.6 + Math.random() * 2.2,
        speed: 0.15 + Math.random() * 0.7,
        drift: (Math.random() - 0.5) * 0.4,
        tw: Math.random() * Math.PI * 2,
        hue: 250 + Math.random() * 90,
      }));
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = (now: number) => {
      const { w, h } = sizeRef.current;
      const t = now / 1000;
      const energy = energyRef.current;
      ctx.clearRect(0, 0, w, h);

      // ambient rising sparks
      ctx.globalCompositeOperation = 'lighter';
      for (const s of sparksRef.current) {
        s.y -= s.speed * (0.6 + energy * 1.6);
        s.x += s.drift + Math.sin(t + s.tw) * 0.3;
        if (s.y < -10) {
          s.y = h + 10;
          s.x = Math.random() * w;
        }
        const tw = 0.5 + 0.5 * Math.sin(t * 2 + s.tw);
        const alpha = 0.18 + tw * 0.5 * (0.5 + energy);
        ctx.beginPath();
        ctx.fillStyle = `hsla(${s.hue}, 90%, ${65 + tw * 20}%, ${alpha})`;
        ctx.shadowBlur = 12;
        ctx.shadowColor = `hsla(${s.hue}, 90%, 70%, ${alpha})`;
        ctx.arc(s.x, s.y, s.r * (0.8 + energy * 0.8), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // radial visualizer (only during lyrics / loop)
      if (phaseRef.current !== 'intro') {
        const cx = w / 2;
        const cy = h * (phaseRef.current === 'lyrics' ? 0.46 : 0.5);
        const N = 84;
        const baseR = Math.min(w, h) * (phaseRef.current === 'lyrics' ? 0.16 : 0.2);
        for (let i = 0; i < N; i++) {
          const a = (i / N) * Math.PI * 2;
          const wobble = 0.5 + 0.5 * Math.sin(i * 0.6 + t * 3.2);
          const len = baseR * (0.18 + energy * 0.9 * wobble);
          const hue = (t * 50 + i * 4.2) % 360;
          const x1 = cx + Math.cos(a) * baseR;
          const y1 = cy + Math.sin(a) * baseR;
          const x2 = cx + Math.cos(a) * (baseR + len);
          const y2 = cy + Math.sin(a) * (baseR + len);
          ctx.beginPath();
          ctx.strokeStyle = `hsla(${hue}, 95%, ${60 + energy * 20}%, ${0.35 + energy * 0.45})`;
          ctx.lineWidth = 2.4;
          ctx.shadowBlur = 14;
          ctx.shadowColor = `hsla(${hue}, 95%, 65%, 0.8)`;
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;

        // glowing core
        const coreR = baseR * (0.7 + energy * 0.5);
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
        grad.addColorStop(0, `rgba(168,85,247,${0.18 + energy * 0.22})`);
        grad.addColorStop(0.5, `rgba(34,211,238,${0.08 + energy * 0.12})`);
        grad.addColorStop(1, 'rgba(5,1,15,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
        ctx.fill();
      }

      // confetti
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
        ctx.shadowBlur = 10;
        ctx.shadowColor = c.color;
        ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size * 0.6);
        ctx.restore();
      }
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'source-over';

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  /* ---------- Main timing loop: energy + lyric sync ---------- */
  useEffect(() => {
    let raf = 0;
    const beatInterval = 0.46; // ~130 BPM simulated

    const loop = (now: number) => {
      const tSec = (now - startMsRef.current) / 1000;
      const beat = (tSec % beatInterval) / beatInterval;
      const env = Math.pow(1 - beat, 2.4);
      let energy = 0.32 + 0.5 * env + 0.12 * Math.sin(tSec * 1.3);

      const audio = audioRef.current;
      if (phaseRef.current === 'lyrics' && audio) {
        const { scale } = scaledLyrics();
        const ct = audio.currentTime;
        const dur = audio.duration && Number.isFinite(audio.duration) ? audio.duration : LYRICS_END_REF * scale;
        if (progressBarRef.current) {
          progressBarRef.current.style.width = `${(dur > 0 ? Math.min(1, ct / dur) : 0) * 100}%`;
        }

        let idx = -1;
        for (let i = 0; i < LYRICS.length; i++) {
          if (ct >= LYRICS[i].t * scale) idx = i;
        }
        setActiveLine((prev) => (prev === idx ? prev : idx));

        if (idx >= 0 && LYRICS[idx].drop) energy = Math.min(1.4, energy + 0.4 + env * 0.4);

        // end of lyric video → loop phase
        if (ct >= LYRICS_END_REF * scale - 0.05 || (audio.ended && phaseRef.current === 'lyrics')) {
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

  // confetti on drop lines
  useEffect(() => {
    if (phase !== 'lyrics' || activeLine < 0) return;
    const line = LYRICS[activeLine];
    if (line?.drop && lastDropRef.current !== activeLine) {
      lastDropRef.current = activeLine;
      spawnConfetti(line.mega ? 260 : 150, line.mega ? 1.5 : 1.1);
    }
  }, [activeLine, phase, spawnConfetti]);

  // cycle revolution lines in loop phase
  useEffect(() => {
    if (phase !== 'loop') return;
    const id = setInterval(() => setRevIndex((i) => (i + 1) % REVOLUTION_LINES.length), 5000);
    return () => clearInterval(id);
  }, [phase]);

  const goToLoop = useCallback(() => {
    if (phaseRef.current === 'loop') return;
    phaseRef.current = 'loop';
    setPhase('loop');
    setActiveLine(-1);
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
      // no song configured — go straight to the reveal
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

  const current = activeLine >= 0 ? LYRICS[activeLine] : null;

  return (
    <main
      dir="rtl"
      className="fixed inset-0 z-0 overflow-hidden bg-[#05010f] text-white"
      style={{ fontFamily: 'Rubik, Heebo, system-ui, sans-serif' }}
    >
      {/* aurora background */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="cs-aurora cs-aurora-1" />
        <div className="cs-aurora cs-aurora-2" />
        <div className="cs-aurora cs-aurora-3" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_30%,_rgba(5,1,15,0.85)_100%)]" />
      </div>

      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />

      {songUrl ? <audio ref={audioRef} src={songUrl} preload="auto" playsInline /> : null}

      {/* top controls */}
      {phase !== 'intro' && (
        <div className="absolute left-0 right-0 top-0 z-30 flex items-center justify-between p-4 sm:p-6">
          <button
            type="button"
            onClick={toggleMute}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur-md transition hover:bg-white/20"
            aria-label={muted ? 'בטל השתקה' : 'השתק'}
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          {phase === 'lyrics' && (
            <button
              type="button"
              onClick={goToLoop}
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white/80 backdrop-blur-md transition hover:bg-white/20"
            >
              דלג ←
            </button>
          )}
        </div>
      )}

      {/* progress bar during lyrics */}
      {phase === 'lyrics' && (
        <div className="absolute bottom-0 left-0 right-0 z-30 h-1.5 bg-white/10">
          <div
            ref={progressBarRef}
            className="h-full bg-gradient-to-l from-fuchsia-400 via-violet-400 to-cyan-300 shadow-[0_0_18px_rgba(192,132,252,0.9)]"
            style={{ width: '0%' }}
          />
        </div>
      )}

      <div className="relative z-20 flex h-full w-full items-center justify-center px-5">
        {/* pulsing orb anchor for CSS energy variable */}
        <div ref={orbRef} className="absolute inset-0" style={{ '--e': '0.35' } as React.CSSProperties} aria-hidden>
          <div className="cs-orb" />
        </div>

        <AnimatePresence mode="wait">
          {/* ----------------- INTRO ----------------- */}
          {phase === 'intro' && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1, filter: 'blur(8px)' }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="relative z-20 flex flex-col items-center text-center"
            >
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.7 }}
                className="mb-6 flex h-24 w-24 items-center justify-center rounded-[2rem] bg-gradient-to-br from-fuchsia-500 via-violet-500 to-cyan-400 text-5xl font-black text-white shadow-[0_0_60px_rgba(168,85,247,0.8)] sm:h-28 sm:w-28"
              >
                N
              </motion.div>
              <motion.h1
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.35, duration: 0.7 }}
                className="cs-gradient-text text-5xl font-black tracking-tight sm:text-7xl"
              >
                NuraWell
              </motion.h1>
              <motion.p
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.7 }}
                className="mt-3 text-lg font-light tracking-[0.3em] text-white/70 sm:text-2xl"
              >
                ב ק ר ו ב
              </motion.p>

              <motion.button
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.8, duration: 0.6, type: 'spring' }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.97 }}
                onClick={startExperience}
                className="cs-cta group mt-10 flex items-center gap-3 rounded-full bg-gradient-to-l from-fuchsia-500 via-violet-500 to-cyan-400 px-9 py-4 text-lg font-black text-white shadow-[0_0_40px_rgba(168,85,247,0.7)]"
              >
                <Play className="h-6 w-6 fill-white" />
                {songUrl ? 'התחל את החוויה' : 'כניסה'}
              </motion.button>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.1, duration: 0.6 }}
                className="mt-5 text-sm text-white/50"
              >
                {songUrl ? 'מומלץ לחוות עם קול 🔊' : 'השיר טרם הוגדר בלוח הבקרה'}
              </motion.p>
            </motion.div>
          )}

          {/* ----------------- LYRICS ----------------- */}
          {phase === 'lyrics' && (
            <motion.div
              key="lyrics"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative z-20 flex w-full max-w-4xl flex-col items-center text-center"
            >
              <AnimatePresence mode="wait">
                {current && (
                  <motion.div
                    key={activeLine}
                    initial={{ opacity: 0, y: 40, scale: 0.8, filter: 'blur(10px)' }}
                    animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -30, scale: 1.15, filter: 'blur(8px)' }}
                    transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                    className="flex flex-col items-center"
                  >
                    {current.drop ? (
                      <motion.div
                        animate={{ scale: [1, 1.08, 1] }}
                        transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}
                        className="flex flex-col items-center"
                      >
                        <span
                          className={`cs-drop-text font-black leading-none ${
                            current.mega
                              ? 'text-[20vw] sm:text-[12rem]'
                              : 'text-[16vw] sm:text-[9rem]'
                          }`}
                        >
                          {current.text}
                        </span>
                        {current.tag && (
                          <motion.span
                            initial={{ scale: 0, rotate: -20 }}
                            animate={{ scale: 1, rotate: -8 }}
                            transition={{ type: 'spring', stiffness: 300, delay: 0.1 }}
                            className="mt-2 rounded-full bg-amber-400 px-5 py-1.5 text-2xl font-black text-black shadow-[0_0_30px_rgba(251,191,36,0.9)] sm:text-3xl"
                          >
                            {current.tag}
                          </motion.span>
                        )}
                      </motion.div>
                    ) : (
                      <span className="cs-lyric-text px-2 text-4xl font-black leading-tight sm:text-7xl">
                        {current.text}
                      </span>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ----------------- LOOP / REVEAL ----------------- */}
          {phase === 'loop' && (
            <motion.div
              key="loop"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
              className="relative z-20 flex w-full max-w-3xl flex-col items-center text-center"
            >
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.8 }}
                className="mb-2 flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-bold tracking-[0.25em] text-white/70 backdrop-blur-md"
              >
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                ה מ ה פ כ ה  מ ת ח י ל ה
              </motion.div>

              <motion.h1
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.35, duration: 0.8 }}
                className="cs-gradient-text text-6xl font-black tracking-tight sm:text-8xl"
              >
                NuraWell
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.55, duration: 0.8 }}
                className="mt-2 text-xl font-light tracking-[0.45em] text-white/60 sm:text-3xl"
              >
                ב ק ר ו ב
              </motion.p>

              <div className="mt-12 flex min-h-[6.5rem] items-center justify-center sm:min-h-[7rem]">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={revIndex}
                    initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -24, filter: 'blur(8px)' }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                    className="max-w-2xl text-balance text-2xl font-medium leading-relaxed text-white/90 sm:text-4xl"
                  >
                    {REVOLUTION_LINES[revIndex]}
                  </motion.p>
                </AnimatePresence>
              </div>

              {songUrl && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1, duration: 0.6 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={replay}
                  className="mt-14 flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-6 py-3 text-sm font-bold text-white/85 backdrop-blur-md transition hover:bg-white/20"
                >
                  <Repeat className="h-4 w-4" />
                  צפה שוב בפתיח
                </motion.button>
              )}

              {songTitle && <p className="mt-6 text-xs text-white/30">♪ {songTitle}</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <style>{`
        .cs-aurora {
          position: absolute;
          border-radius: 9999px;
          filter: blur(90px);
          opacity: 0.6;
          mix-blend-mode: screen;
        }
        .cs-aurora-1 {
          width: 60vw; height: 60vw; top: -15vw; right: -10vw;
          background: radial-gradient(circle, rgba(168,85,247,0.8), transparent 60%);
          animation: csFloat1 16s ease-in-out infinite;
        }
        .cs-aurora-2 {
          width: 55vw; height: 55vw; bottom: -18vw; left: -12vw;
          background: radial-gradient(circle, rgba(34,211,238,0.7), transparent 60%);
          animation: csFloat2 19s ease-in-out infinite;
        }
        .cs-aurora-3 {
          width: 45vw; height: 45vw; top: 30%; left: 30%;
          background: radial-gradient(circle, rgba(236,72,153,0.6), transparent 60%);
          animation: csFloat3 22s ease-in-out infinite;
        }
        @keyframes csFloat1 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-6vw,5vw) scale(1.15)} }
        @keyframes csFloat2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(7vw,-4vw) scale(1.2)} }
        @keyframes csFloat3 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-5vw,-6vw) scale(0.85)} }

        .cs-orb {
          position: absolute;
          top: 46%; left: 50%;
          width: 40vmin; height: 40vmin;
          transform: translate(-50%, -50%) scale(calc(0.8 + var(--e) * 0.5));
          border-radius: 9999px;
          background: radial-gradient(circle, rgba(168,85,247,calc(0.18 + var(--e) * 0.22)), transparent 65%);
          filter: blur(20px);
          transition: transform 0.06s linear;
        }

        .cs-gradient-text {
          background: linear-gradient(100deg, #f0abfc, #a78bfa, #67e8f9, #f0abfc);
          background-size: 300% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: csShimmer 6s linear infinite;
          text-shadow: 0 0 60px rgba(168,85,247,0.45);
        }
        @keyframes csShimmer { to { background-position: 300% 0; } }

        .cs-lyric-text {
          background: linear-gradient(180deg, #ffffff, #e9d5ff);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          text-shadow: 0 0 40px rgba(217,180,255,0.5);
        }

        .cs-drop-text {
          background: linear-gradient(120deg, #f0abfc, #818cf8, #22d3ee, #fbbf24, #f0abfc);
          background-size: 300% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: csShimmer 2.5s linear infinite;
          filter: drop-shadow(0 0 40px rgba(168,85,247,0.7));
          letter-spacing: -0.02em;
        }

        .cs-cta { position: relative; }
        .cs-cta::after {
          content: '';
          position: absolute; inset: -3px;
          border-radius: 9999px;
          background: linear-gradient(90deg, #f0abfc, #67e8f9, #f0abfc);
          background-size: 200% 100%;
          z-index: -1;
          filter: blur(14px);
          opacity: 0.7;
          animation: csShimmer 3s linear infinite;
        }

        .text-balance { text-wrap: balance; }

        @media (prefers-reduced-motion: reduce) {
          .cs-aurora, .cs-gradient-text, .cs-drop-text, .cs-cta::after { animation: none !important; }
        }
      `}</style>
    </main>
  );
}
