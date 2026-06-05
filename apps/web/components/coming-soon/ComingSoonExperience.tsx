'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Brain, HeartPulse, Leaf, Play, Repeat, ShieldCheck, Sparkles, Volume2, VolumeX } from 'lucide-react';

/* ============================================================
 * סנכרון מילים לשיר 30 השניות (נוצר ב-Gemini).
 * חשוב: השיר מתחיל לשיר רק אחרי ~3 שניות (אינטרו שקט),
 * לכן הזמנים הם שניות מוחלטות לתוך קובץ האודיו (כולל ה-lead-in).
 * כל שורה מחולקת למילים → המילה שנשמעת כרגע מובלטת (קריוקי).
 * ============================================================ */
const SONG_LEAD_IN = 3; // שניות שקט בתחילת השיר

type LyricKind = 'normal' | 'drop' | 'mega';
type LyricLine = {
  start: number;
  end: number;
  text: string;
  kind?: LyricKind;
  tag?: string;
};

const LYRICS: LyricLine[] = [
  { start: SONG_LEAD_IN + 0.4, end: SONG_LEAD_IN + 4.3, text: 'הלילה נצבע באור חדש' },
  { start: SONG_LEAD_IN + 4.3, end: SONG_LEAD_IN + 8.2, text: 'הלב נפתח, אין בו חשש' },
  { start: SONG_LEAD_IN + 8.2, end: SONG_LEAD_IN + 12.1, text: 'לרקוד איתך עד אינסוף' },
  { start: SONG_LEAD_IN + 12.1, end: SONG_LEAD_IN + 16.0, text: 'לגלות את כל היופי שוב' },
  { start: SONG_LEAD_IN + 16.0, end: SONG_LEAD_IN + 18.6, text: 'NuraWell', kind: 'drop', tag: 'כן!' },
  { start: SONG_LEAD_IN + 18.6, end: SONG_LEAD_IN + 21.0, text: 'NuraWell', kind: 'drop' },
  { start: SONG_LEAD_IN + 21.0, end: SONG_LEAD_IN + 24.4, text: 'מרגיש הכי חזק שיש' },
  { start: SONG_LEAD_IN + 24.4, end: SONG_LEAD_IN + 27.6, text: 'NuraWell!!!', kind: 'mega' },
];
const LYRICS_END = LYRICS[LYRICS.length - 1].end + 0.4;

/* משפטי שיווק פסיכולוגיים — מתחלפים בלופ, בכרטיס זכוכית קריא */
const REVOLUTION_LINES = [
  'השינוי האמיתי לא מתחיל בצלחת — הוא מתחיל במחשבה אחת שאתה מאמין בה.',
  'אתה לא צריך עוד דיאטה. אתה צריך מערכת שמבינה אותך.',
  'כל בחירה קטנה היום בונה את האדם שתהיה מחר.',
  'NuraWell לא סופרת קלוריות — היא בונה מחדש את הביטחון שלך.',
  'הגוף מקשיב לכל מילה שאתה אומר לעצמך. בוא נשנה את השיחה.',
  'מנטור AI שלא שופט ולא לוחץ — רק מלווה אותך קדימה.',
  'לא עוד "מחר אני מתחיל". המחר מתחיל עכשיו.',
  'השלווה שחיפשת נמצאת בצד השני של ההרגלים החדשים.',
  'אתה במרחק החלטה אחת מהגרסה הכי טובה של עצמך.',
  'בריאות היא לא יעד — היא הדרך שבה אתה חי כל יום.',
];

const FEATURES = [
  {
    icon: Brain,
    title: 'מנטור AI אישי',
    desc: 'מלווה חכם שזוכר אותך, מבין אותך ומדבר בגובה העיניים — מתי שתצטרך.',
  },
  {
    icon: Leaf,
    title: 'בלי דיאטות קיצוניות',
    desc: 'שינוי עדין ובר-קיימא. בלי הרעבה, בלי ספירת קלוריות, בלי אשמה.',
  },
  {
    icon: HeartPulse,
    title: 'הרגלים שנשארים',
    desc: 'צעדים קטנים שמצטברים לשינוי אמיתי — כזה שמחזיק לאורך זמן.',
  },
  {
    icon: ShieldCheck,
    title: 'שקט וביטחון',
    desc: 'פחות לחץ, יותר בהירות. בריאות נפש וגוף שמרגישים בכל יום.',
  },
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

type Spark = {
  x: number;
  y: number;
  r: number;
  speed: number;
  drift: number;
  tw: number;
  hue: number;
};

function splitWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

export function ComingSoonExperience({
  songUrl,
  songTitle,
}: {
  songUrl: string | null;
  songTitle: string | null;
}) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [activeLine, setActiveLine] = useState(-1);
  const [activeWord, setActiveWord] = useState(-1);
  const [muted, setMuted] = useState(false);
  const [revIndex, setRevIndex] = useState(0);

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
    if (confettiRef.current.length > 1400) {
      confettiRef.current.splice(0, confettiRef.current.length - 1400);
    }
  }, []);

  /* ---------- Canvas: ambient particles + radial visualizer + confetti ---------- */
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

      const count = Math.min(110, Math.floor((w * h) / 15000));
      sparksRef.current = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.6 + Math.random() * 2.2,
        speed: 0.12 + Math.random() * 0.6,
        drift: (Math.random() - 0.5) * 0.35,
        tw: Math.random() * Math.PI * 2,
        hue: 140 + Math.random() * 50, // green → teal
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
      for (const s of sparksRef.current) {
        s.y -= s.speed * (0.6 + energy * 1.5);
        s.x += s.drift + Math.sin(t + s.tw) * 0.3;
        if (s.y < -10) {
          s.y = h + 10;
          s.x = Math.random() * w;
        }
        const tw = 0.5 + 0.5 * Math.sin(t * 2 + s.tw);
        const alpha = 0.16 + tw * 0.45 * (0.5 + energy);
        ctx.beginPath();
        ctx.fillStyle = `hsla(${s.hue}, 85%, ${62 + tw * 22}%, ${alpha})`;
        ctx.shadowBlur = 12;
        ctx.shadowColor = `hsla(${s.hue}, 85%, 70%, ${alpha})`;
        ctx.arc(s.x, s.y, s.r * (0.8 + energy * 0.8), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      if (phaseRef.current !== 'intro') {
        const cx = w / 2;
        const cy = h * (phaseRef.current === 'lyrics' ? 0.44 : 0.32);
        const N = 88;
        const baseR = Math.min(w, h) * (phaseRef.current === 'lyrics' ? 0.17 : 0.14);
        for (let i = 0; i < N; i++) {
          const a = (i / N) * Math.PI * 2;
          const wobble = 0.5 + 0.5 * Math.sin(i * 0.6 + t * 3.2);
          const len = baseR * (0.18 + energy * 0.9 * wobble);
          const hue = 120 + ((t * 30 + i * 2.2) % 80); // green spectrum
          const x1 = cx + Math.cos(a) * baseR;
          const y1 = cy + Math.sin(a) * baseR;
          const x2 = cx + Math.cos(a) * (baseR + len);
          const y2 = cy + Math.sin(a) * (baseR + len);
          ctx.beginPath();
          ctx.strokeStyle = `hsla(${hue}, 90%, ${58 + energy * 20}%, ${0.32 + energy * 0.42})`;
          ctx.lineWidth = 2.4;
          ctx.shadowBlur = 14;
          ctx.shadowColor = `hsla(${hue}, 90%, 62%, 0.8)`;
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;

        const coreR = baseR * (0.7 + energy * 0.5);
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
        grad.addColorStop(0, `rgba(16,185,129,${0.16 + energy * 0.2})`);
        grad.addColorStop(0.5, `rgba(45,212,191,${0.07 + energy * 0.1})`);
        grad.addColorStop(1, 'rgba(2,15,12,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
        ctx.fill();
      }

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
        const ct = audio.currentTime;
        const dur = audio.duration && Number.isFinite(audio.duration) ? audio.duration : LYRICS_END;
        if (progressBarRef.current) {
          progressBarRef.current.style.width = `${(dur > 0 ? Math.min(1, ct / dur) : 0) * 100}%`;
        }

        let idx = -1;
        for (let i = 0; i < LYRICS.length; i++) {
          if (ct >= LYRICS[i].start && ct < LYRICS[i].end) idx = i;
        }
        if (idx === -1) {
          for (let i = 0; i < LYRICS.length; i++) {
            if (ct >= LYRICS[i].start) idx = i;
          }
        }
        setActiveLine((prev) => (prev === idx ? prev : idx));

        if (idx >= 0) {
          const line = LYRICS[idx];
          const words = splitWords(line.text);
          const frac = (ct - line.start) / Math.max(0.001, line.end - line.start);
          const wi = Math.max(0, Math.min(words.length - 1, Math.floor(frac * words.length)));
          setActiveWord((prev) => (prev === wi ? prev : wi));
          if (line.kind === 'drop' || line.kind === 'mega') {
            energy = Math.min(1.5, energy + 0.45 + env * 0.4);
          }
        }

        if (ct >= LYRICS_END - 0.05 || (audio.ended && phaseRef.current === 'lyrics')) {
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

  useEffect(() => {
    if (phase !== 'lyrics' || activeLine < 0) return;
    const line = LYRICS[activeLine];
    if ((line?.kind === 'drop' || line?.kind === 'mega') && lastDropRef.current !== activeLine) {
      lastDropRef.current = activeLine;
      spawnConfetti(line.kind === 'mega' ? 280 : 150, line.kind === 'mega' ? 1.5 : 1.1);
    }
  }, [activeLine, phase, spawnConfetti]);

  useEffect(() => {
    if (phase !== 'loop') return;
    const id = setInterval(() => setRevIndex((i) => (i + 1) % REVOLUTION_LINES.length), 4800);
    return () => clearInterval(id);
  }, [phase]);

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
    spawnConfetti(220, 1.3);
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

  const current = activeLine >= 0 ? LYRICS[activeLine] : null;
  const currentWords = current ? splitWords(current.text) : [];

  return (
    <main
      dir="rtl"
      className="fixed inset-0 z-0 overflow-hidden bg-[#02100c] text-white"
      style={{ fontFamily: 'Rubik, Heebo, system-ui, sans-serif' }}
    >
      {/* aurora / calm background */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="cs-aurora cs-aurora-1" />
        <div className="cs-aurora cs-aurora-2" />
        <div className="cs-aurora cs-aurora-3" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_30%,_rgba(2,16,12,0.88)_100%)]" />
      </div>

      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />

      {/* floating calm icons */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <Leaf className="cs-leaf cs-leaf-1 text-emerald-300/20" />
        <Leaf className="cs-leaf cs-leaf-2 text-teal-300/15" />
        <Sparkles className="cs-leaf cs-leaf-3 text-lime-300/15" />
      </div>

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

      {phase === 'lyrics' && (
        <div className="absolute bottom-0 left-0 right-0 z-30 h-1.5 bg-white/10">
          <div
            ref={progressBarRef}
            className="h-full bg-gradient-to-l from-emerald-400 via-teal-300 to-lime-300 shadow-[0_0_18px_rgba(52,211,153,0.9)]"
            style={{ width: '0%' }}
          />
        </div>
      )}

      {/* energy orb */}
      <div
        ref={orbRef}
        className="pointer-events-none absolute inset-0"
        style={{ '--e': '0.32' } as React.CSSProperties}
        aria-hidden
      >
        <div className="cs-orb" />
      </div>

      {/* ===================== INTRO / LYRICS (centered) ===================== */}
      {phase !== 'loop' && (
        <div className="relative z-20 flex h-full w-full items-center justify-center px-5">
          <AnimatePresence mode="wait">
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
                  className="mb-6 flex h-24 w-24 items-center justify-center rounded-[2rem] bg-gradient-to-br from-emerald-400 via-teal-500 to-lime-400 text-5xl font-black text-[#04231a] shadow-[0_0_60px_rgba(52,211,153,0.75)] sm:h-28 sm:w-28"
                >
                  N
                </motion.div>
                <motion.h1
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.35, duration: 0.7 }}
                  className="cs-gradient-text text-5xl font-black tracking-tight sm:text-7xl"
                >
                  NuraWell<span className="cs-ai">.AI</span>
                </motion.h1>
                <motion.p
                  initial={{ y: 16, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.5, duration: 0.7 }}
                  className="mt-3 text-lg font-light tracking-[0.32em] text-emerald-100/70 sm:text-2xl"
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
                  className="cs-cta group mt-10 flex items-center gap-3 rounded-full bg-gradient-to-l from-emerald-500 via-teal-500 to-lime-400 px-9 py-4 text-lg font-black text-[#04231a] shadow-[0_0_40px_rgba(52,211,153,0.65)]"
                >
                  <Play className="h-6 w-6 fill-[#04231a]" />
                  {songUrl ? 'התחל את החוויה' : 'כניסה'}
                </motion.button>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.1, duration: 0.6 }}
                  className="mt-5 text-sm text-emerald-100/50"
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
                      initial={{ opacity: 0, y: 40, scale: 0.85, filter: 'blur(10px)' }}
                      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                      exit={{ opacity: 0, y: -28, scale: 1.12, filter: 'blur(8px)' }}
                      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
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
                              current.kind === 'mega' ? 'text-[20vw] sm:text-[12rem]' : 'text-[16vw] sm:text-[9rem]'
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
                        <div className="flex max-w-4xl flex-wrap items-center justify-center gap-x-4 gap-y-2 px-2">
                          {currentWords.map((word, i) => (
                            <span
                              key={`${activeLine}-${i}`}
                              className={
                                i === activeWord
                                  ? 'cs-word cs-word-active text-4xl font-black leading-tight sm:text-7xl'
                                  : 'cs-word text-4xl font-black leading-tight text-white/35 sm:text-7xl'
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
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.8 }}
              className="mb-3 flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-4 py-1.5 text-xs font-bold tracking-[0.22em] text-emerald-100/80 backdrop-blur-md"
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              ה מ ה פ כ ה  מ ת ח י ל ה
            </motion.div>

            <motion.h1
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="cs-gradient-text text-6xl font-black tracking-tight sm:text-8xl"
            >
              NuraWell<span className="cs-ai">.AI</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.8 }}
              className="mt-3 text-lg font-light tracking-[0.18em] text-emerald-100/70 sm:text-2xl"
            >
              הדרך החכמה לחיים בריאים
            </motion.p>

            {/* rotating psychological line — readable glass card */}
            <div className="mt-10 w-full max-w-2xl">
              <div className="cs-glass-card relative flex min-h-[8.5rem] items-center justify-center px-6 py-7 sm:min-h-[9rem] sm:px-9">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={revIndex}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -14 }}
                    transition={{ duration: 0.55, ease: 'easeOut' }}
                    className="text-balance text-xl font-semibold leading-relaxed text-white sm:text-3xl sm:leading-relaxed"
                  >
                    {REVOLUTION_LINES[revIndex]}
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
                    transition={{ duration: 0.6, delay: 0.05 * i }}
                    className="cs-glass-card flex flex-col items-center gap-3 px-5 py-6 text-center sm:items-start sm:text-right"
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400/90 to-teal-500/90 text-[#04231a] shadow-[0_0_24px_rgba(45,212,191,0.5)]">
                      <Icon className="h-6 w-6" />
                    </span>
                    <h3 className="text-lg font-black text-white sm:text-xl">{f.title}</h3>
                    <p className="text-sm leading-relaxed text-emerald-50/75 sm:text-[15px]">{f.desc}</p>
                  </motion.div>
                );
              })}
            </div>

            {/* closing CTA / waitlist badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
              className="cs-glass-card mt-12 flex w-full max-w-2xl flex-col items-center gap-4 px-6 py-9 sm:mt-16"
            >
              <span className="flex items-center gap-2 rounded-full bg-lime-300/90 px-4 py-1.5 text-sm font-black text-[#04231a] shadow-[0_0_28px_rgba(163,230,53,0.6)]">
                <Sparkles className="h-4 w-4" />
                בקרוב מאוד
              </span>
              <p className="text-balance text-2xl font-black leading-snug text-white sm:text-4xl">
                המסע שישנה לך את החיים — כבר ממש כאן.
              </p>
              <p className="max-w-md text-balance text-sm leading-relaxed text-emerald-50/70 sm:text-base">
                בלי דיאטות, בלי ספירת קלוריות, בלי הרעבה. רק אתה, מנטור AI שמבין אותך, ודרך חדשה להרגיש טוב בגוף ובנפש.
              </p>

              {songUrl && (
                <button
                  type="button"
                  onClick={replay}
                  className="mt-2 flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-6 py-3 text-sm font-bold text-white/85 backdrop-blur-md transition hover:bg-white/20"
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
        .cs-aurora {
          position: absolute;
          border-radius: 9999px;
          filter: blur(95px);
          opacity: 0.55;
          mix-blend-mode: screen;
        }
        .cs-aurora-1 {
          width: 60vw; height: 60vw; top: -15vw; right: -10vw;
          background: radial-gradient(circle, rgba(16,185,129,0.85), transparent 60%);
          animation: csFloat1 16s ease-in-out infinite;
        }
        .cs-aurora-2 {
          width: 55vw; height: 55vw; bottom: -18vw; left: -12vw;
          background: radial-gradient(circle, rgba(45,212,191,0.7), transparent 60%);
          animation: csFloat2 19s ease-in-out infinite;
        }
        .cs-aurora-3 {
          width: 45vw; height: 45vw; top: 28%; left: 30%;
          background: radial-gradient(circle, rgba(163,230,53,0.5), transparent 60%);
          animation: csFloat3 22s ease-in-out infinite;
        }
        @keyframes csFloat1 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-6vw,5vw) scale(1.15)} }
        @keyframes csFloat2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(7vw,-4vw) scale(1.2)} }
        @keyframes csFloat3 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-5vw,-6vw) scale(0.85)} }

        .cs-leaf { position: absolute; width: 42px; height: 42px; }
        .cs-leaf-1 { top: 14%; left: 12%; animation: csDrift 14s ease-in-out infinite; }
        .cs-leaf-2 { bottom: 18%; right: 14%; width: 56px; height: 56px; animation: csDrift 18s ease-in-out infinite reverse; }
        .cs-leaf-3 { top: 22%; right: 22%; animation: csDrift 16s ease-in-out infinite; }
        @keyframes csDrift { 0%,100%{transform:translate(0,0) rotate(0deg)} 50%{transform:translate(14px,-22px) rotate(18deg)} }

        .cs-orb {
          position: absolute;
          top: 44%; left: 50%;
          width: 42vmin; height: 42vmin;
          transform: translate(-50%, -50%) scale(calc(0.8 + var(--e) * 0.5));
          border-radius: 9999px;
          background: radial-gradient(circle, rgba(16,185,129,calc(0.16 + var(--e) * 0.22)), transparent 65%);
          filter: blur(22px);
          transition: transform 0.06s linear;
        }

        .cs-gradient-text {
          background: linear-gradient(100deg, #bbf7d0, #34d399, #5eead4, #a3e635, #bbf7d0);
          background-size: 300% 100%;
          -webkit-background-clip: text; background-clip: text; color: transparent;
          animation: csShimmer 6s linear infinite;
          text-shadow: 0 0 60px rgba(52,211,153,0.4);
        }
        @keyframes csShimmer { to { background-position: 300% 0; } }

        .cs-ai {
          background: linear-gradient(120deg, #a3e635, #34d399);
          -webkit-background-clip: text; background-clip: text; color: transparent;
          font-weight: 900;
        }
        .cs-ai-drop {
          font-size: 0.42em;
          vertical-align: super;
          background: linear-gradient(120deg, #a3e635, #5eead4);
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }

        .cs-word {
          display: inline-block;
          transition: transform 0.18s ease, color 0.18s ease, text-shadow 0.18s ease, opacity 0.18s ease;
          background: linear-gradient(180deg, #ffffff, #d1fae5);
          -webkit-background-clip: text; background-clip: text;
        }
        .cs-word-active {
          color: transparent;
          transform: translateY(-6px) scale(1.12);
          text-shadow: 0 0 42px rgba(110,231,183,0.85);
          filter: drop-shadow(0 0 22px rgba(52,211,153,0.55));
        }

        .cs-drop-text {
          background: linear-gradient(120deg, #bbf7d0, #34d399, #5eead4, #a3e635, #bbf7d0);
          background-size: 300% 100%;
          -webkit-background-clip: text; background-clip: text; color: transparent;
          animation: csShimmer 2.5s linear infinite;
          filter: drop-shadow(0 0 40px rgba(52,211,153,0.7));
          letter-spacing: -0.02em;
        }

        .cs-glass-card {
          border-radius: 1.5rem;
          border: 1px solid rgba(255,255,255,0.16);
          background: linear-gradient(135deg, rgba(255,255,255,0.12), rgba(16,185,129,0.06));
          box-shadow: 0 8px 40px rgba(4,35,26,0.45), inset 0 1px 0 rgba(255,255,255,0.18);
          backdrop-filter: blur(22px) saturate(140%);
          -webkit-backdrop-filter: blur(22px) saturate(140%);
        }

        .cs-cta { position: relative; }
        .cs-cta::after {
          content: '';
          position: absolute; inset: -3px;
          border-radius: 9999px;
          background: linear-gradient(90deg, #a3e635, #5eead4, #a3e635);
          background-size: 200% 100%;
          z-index: -1; filter: blur(14px); opacity: 0.65;
          animation: csShimmer 3s linear infinite;
        }

        .text-balance { text-wrap: balance; }

        @media (prefers-reduced-motion: reduce) {
          .cs-aurora, .cs-gradient-text, .cs-drop-text, .cs-cta::after, .cs-leaf { animation: none !important; }
        }
      `}</style>
    </main>
  );
}
