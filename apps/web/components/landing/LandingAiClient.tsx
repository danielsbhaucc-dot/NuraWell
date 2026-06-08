'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AnimatePresence,
  animate,
  motion,
  useInView,
  useScroll,
  useSpring,
  type Variants,
} from 'framer-motion';
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Ban,
  BedDouble,
  BrainCircuit,
  Calculator,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Coffee,
  Compass,
  Cpu,
  Fingerprint,
  Frown,
  Gauge,
  Heart,
  HelpCircle,
  Infinity as InfinityIcon,
  Leaf,
  MessageCircle,
  Mic,
  Moon,
  PlayCircle,
  Radar,
  Scale,
  Send,
  Smile,
  Sparkles,
  Star,
  Sunrise,
  TrendingUp,
  Utensils,
  Wand2,
  Zap,
} from 'lucide-react';
import { NuraWellLogo } from '@/components/shared/NuraWellLogo';
import styles from './landing-ai.module.css';

const EASE = [0.22, 1, 0.36, 1] as const;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
};

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

/* Glass card shell */
function Glass({
  className = '',
  strong = false,
  children,
}: {
  className?: string;
  strong?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`${strong ? styles.glassStrong : styles.glass} ${className}`}>{children}</div>
  );
}

/* Eyebrow pill */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3.5 py-1.5 text-[11px] font-bold tracking-wide text-cyan-100 backdrop-blur-md sm:text-xs">
      <Sparkles className="h-3.5 w-3.5" aria-hidden />
      {children}
    </span>
  );
}

/* Animated count-up that keeps non-numeric prefix/suffix (+, %, ★) */
function CountUp({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-30px' });
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (!inView) return;
    const m = value.match(/^([^\d]*)(\d[\d,.]*)(.*)$/);
    if (!m) {
      setDisplay(value);
      return;
    }
    const [, prefix, raw, suffix] = m;
    const hasComma = raw.includes(',');
    const target = parseFloat(raw.replace(/,/g, ''));
    if (Number.isNaN(target)) return;
    const controls = animate(0, target, {
      duration: 1.2,
      ease: EASE,
      onUpdate(v) {
        const n = Math.round(v);
        setDisplay(`${prefix}${hasComma ? n.toLocaleString('he-IL') : n}${suffix}`);
      },
    });
    return () => controls.stop();
  }, [inView, value]);

  return <span ref={ref}>{display}</span>;
}

/* 3D tilt + pointer-reactive glow wrapper (desktop) */
function TiltCard({
  className = '',
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const rx = (0.5 - py) * 10;
    const ry = (px - 0.5) * 12;
    el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg)`;
    el.style.setProperty('--cx', `${px * 100}%`);
    el.style.setProperty('--cy', `${py * 100}%`);
  };

  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg)';
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={`${styles.tilt} ${styles.cardGlow} ${className}`}
    >
      <div className={styles.tiltInner}>{children}</div>
    </div>
  );
}

export function LandingAiClient() {
  const [showTop, setShowTop] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const spotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 520);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* Cursor spotlight — pure CSS-var updates, no re-render */
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia('(hover: none)').matches) return;
    const onMove = (e: MouseEvent) => {
      const el = spotRef.current;
      if (!el) return;
      el.style.setProperty('--mx', `${e.clientX}px`);
      el.style.setProperty('--my', `${e.clientY}px`);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 110, damping: 22, restDelta: 0.001 });

  const scrollTop = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <div className={styles.page} dir="rtl">
      {/* Ambient layers */}
      <div className={styles.aurora} aria-hidden>
        <span className={`${styles.blob} ${styles.blob1}`} />
        <span className={`${styles.blob} ${styles.blob2}`} />
        <span className={`${styles.blob} ${styles.blob3}`} />
      </div>
      <div className={styles.grid} aria-hidden />
      <div className={styles.noise} aria-hidden />
      <div ref={spotRef} className={styles.spotlight} aria-hidden />

      {/* Scroll progress */}
      <motion.div
        className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-right"
        style={{
          scaleX: progress,
          background: 'linear-gradient(90deg,#14ffec,#2dd4bf,#7dd3fc)',
          boxShadow: '0 0 14px rgba(20,255,236,0.6)',
        }}
        aria-hidden
      />

      {/* ───────── NAV ───────── */}
      <header className="relative z-50 px-4 pt-[max(14px,env(safe-area-inset-top))] sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className={`mx-auto flex max-w-5xl items-center justify-between gap-3 rounded-2xl px-4 py-2.5 sm:px-5 ${styles.glass}`}
        >
          <NuraWellLogo size="sm" showTagline={false} animate />
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-bold text-emerald-100 sm:inline-flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
              </span>
              ה-AI מחובר
            </span>
            <Link
              href="/login"
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold text-white backdrop-blur-md transition hover:bg-white/20"
            >
              כניסה
            </Link>
          </div>
        </motion.div>
      </header>

      {/* ───────── HERO ───────── */}
      <section className="relative z-10 px-4 pb-10 pt-10 sm:px-6 sm:pt-16" aria-label="ראש העמוד">
        <div className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          {/* Copy */}
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            className="text-center lg:text-right"
          >
            <motion.div variants={fadeUp} className="flex justify-center lg:justify-start">
              <Eyebrow>NuraWell · בנוי סביב AI מהיסוד</Eyebrow>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="mt-5 text-[2.6rem] font-black leading-[1.05] tracking-tight sm:text-6xl lg:text-[4.2rem]"
            >
              <span className="block text-white/90">לא עוד אפליקציה.</span>
              <span className={`block ${styles.shimmer}`}>מנטור AI שחי איתכם.</span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-emerald-50/80 sm:text-lg lg:mx-0"
            >
              אלמוג לומד אתכם — את הקצב, ההרגלים, הרגעים הקשים — ובונה אורח חיים שמרגיש נכון מהשנייה
              הראשונה. <strong className="text-white">בלי דיאטה, בלי שיפוטיות. רק אתם וה-AI שמבין אתכם.</strong>
            </motion.p>

            <motion.div
              variants={fadeUp}
              className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center lg:justify-start"
            >
              <Link
                href="/register"
                className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-l from-cyan-300 via-emerald-300 to-teal-300 px-7 py-4 text-base font-black text-emerald-950 shadow-[0_14px_40px_rgba(20,255,236,0.35)] transition active:scale-[0.98]"
              >
                <Sparkles className="h-5 w-5" aria-hidden />
                התחילו עם ה-AI — חינם
                <ChevronLeft className="h-5 w-5 transition group-hover:-translate-x-1" aria-hidden />
              </Link>
              <Link
                href="/login"
                className={`inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-bold text-white transition hover:bg-white/15 ${styles.glass}`}
              >
                כבר יש לי חשבון
              </Link>
            </motion.div>

            <motion.ul
              variants={fadeUp}
              className="mt-7 flex flex-wrap justify-center gap-2.5 lg:justify-start"
            >
              {['זמין 24/7', 'זוכר כל שיחה', 'מותאם רק לכם', 'בעברית מלאה'].map((t) => (
                <li
                  key={t}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-xs font-semibold text-emerald-50/90 backdrop-blur-md"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-cyan-300" aria-hidden />
                  {t}
                </li>
              ))}
            </motion.ul>
          </motion.div>

          {/* AI chat preview — the "wow" centerpiece */}
          <motion.div
            initial={{ opacity: 0, y: 36, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.15, ease: EASE }}
            className="relative mx-auto w-full max-w-md"
          >
            <div className={`${styles.floatSlow}`}>
              <Glass strong className={`relative overflow-hidden rounded-[2rem] p-4 sm:p-5 ${styles.ring} ${styles.sheen}`}>
                {/* chat header */}
                <div className="flex items-center gap-3 border-b border-white/10 pb-3">
                  <span className={`relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300/30 to-emerald-400/20 text-cyan-200 ring-1 ring-white/25 ${styles.orb}`}>
                    <BrainCircuit className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="text-right">
                    <p className="text-sm font-black text-white">אלמוג · מנטור AI</p>
                    <p className="flex items-center gap-1.5 text-[11px] text-emerald-200/80">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                      מקליד עכשיו…
                    </p>
                  </div>
                  <Mic className="ms-auto h-4 w-4 text-white/40" aria-hidden />
                </div>

                {/* messages */}
                <div className="space-y-3 py-4 text-sm">
                  <div className="ms-auto max-w-[80%] rounded-2xl rounded-tl-md bg-white/12 px-3.5 py-2.5 text-emerald-50">
                    בקושי ישנתי ואין לי כוח לבשל היום 😣
                  </div>
                  <div className="me-auto max-w-[88%] rounded-2xl rounded-tr-md border border-cyan-300/25 bg-gradient-to-br from-cyan-400/15 to-emerald-400/10 px-3.5 py-2.5 text-white">
                    הבנתי. כשהשינה נמוכה הגוף מבקש קלוריות מהירות — זה לא חולשה, זו ביולוגיה. 💚
                    <br />
                    הכנתי לך משהו ב-7 דקות מחומרים שיש לך בבית. רוצה?
                  </div>
                  <div className="me-auto inline-flex items-center gap-1 rounded-2xl rounded-tr-md border border-white/10 bg-white/8 px-3.5 py-3">
                    <span className={styles.typing}>
                      <span />
                      <span />
                      <span />
                    </span>
                  </div>
                </div>

                {/* "thinking" scan bar */}
                <div className={`mb-3 h-1 overflow-hidden rounded-full bg-white/10 ${styles.scan}`} aria-hidden />

                {/* fake input */}
                <div className="flex items-center gap-2 rounded-2xl border border-white/12 bg-white/8 px-3 py-2">
                  <span className="flex-1 text-right text-xs text-white/40">כתבו לאלמוג…</span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-300 to-emerald-300 text-emerald-950">
                    <Send className="h-4 w-4" aria-hidden />
                  </span>
                </div>
              </Glass>
            </div>

            {/* floating mini stat chips */}
            <motion.div
              className={`absolute -right-3 -top-4 ${styles.floatMed}`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6, duration: 0.5 }}
            >
              <Glass className="rounded-2xl px-3 py-2">
                <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-100">
                  <TrendingUp className="h-4 w-4 text-cyan-300" aria-hidden />
                  +94% הרגישו שינוי בשבוע
                </p>
              </Glass>
            </motion.div>
            <motion.div
              className={`absolute -bottom-5 -left-2 ${styles.floatSlow}`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.75, duration: 0.5 }}
            >
              <Glass className="rounded-2xl px-3 py-2">
                <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-100">
                  <Fingerprint className="h-4 w-4 text-emerald-300" aria-hidden />
                  זיכרון אישי מתמשך
                </p>
              </Glass>
            </motion.div>
          </motion.div>
        </div>

        {/* scroll cue */}
        <div className="mt-12 flex justify-center" aria-hidden>
          <span className="flex h-9 w-5 items-start justify-center rounded-full border border-white/25 pt-1.5">
            <span className={`h-1.5 w-1.5 rounded-full bg-cyan-300 ${styles.scrollDot}`} />
          </span>
        </div>
      </section>

      {/* ───────── AI CAPABILITY TICKER ───────── */}
      <section className={`relative z-10 ${styles.marqueeWrap} overflow-hidden py-4`} aria-hidden>
        <div className={styles.marquee}>
          {[...Array(2)].flatMap((_, dup) =>
            [
              'תזונה חכמה',
              'ניתוח שינה',
              'תזכורות מותאמות',
              'מעקב הרגלים',
              'עידוד בזמן אמת',
              'תכנון ארוחות',
              'ניהול לחץ',
              'תנועה מותאמת',
            ].map((t, i) => (
              <span
                key={`${dup}-${i}`}
                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/12 bg-white/6 px-4 py-2 text-sm font-semibold text-emerald-50/80 backdrop-blur-md"
              >
                <Zap className="h-3.5 w-3.5 text-cyan-300" />
                {t}
              </span>
            )),
          )}
        </div>
      </section>

      <main id="main-content" className="relative z-10">
        {/* ───────── MANIFESTO — way of life ───────── */}
        <section className="px-4 py-16 sm:px-6 sm:py-24">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-60px' }}
            className="mx-auto max-w-3xl text-center"
          >
            <Eyebrow>הרעיון הגדול</Eyebrow>
            <h2 className="mt-6 text-4xl font-black leading-[1.08] sm:text-6xl">
              <span className={`block ${styles.strike}`}>זה לא דיאטה.</span>
              <span className={`mt-2 block ${styles.shimmer}`}>זה איך אתם חיים.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-emerald-50/80 sm:text-lg">
              אורח חיים. הרגלים. <strong className="text-white">זהות חדשה.</strong> שינוי שלא נגמר
              בעוד חודש — אלא מחזיק לכל החיים, עם AI שמחזיק לכם את היד בכל צעד.
            </p>

            <div className="mx-auto mt-10 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { icon: Utensils, title: 'תזונה', sub: 'לא משטר' },
                { icon: Activity, title: 'תנועה', sub: 'לא כאב' },
                { icon: Moon, title: 'מנוחה', sub: 'לא עצלות' },
                { icon: BrainCircuit, title: 'ראש', sub: 'לא רק גוף' },
              ].map((p) => (
                <Glass key={p.title} className="rounded-2xl p-4 text-center">
                  <span className="mx-auto mb-2 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300/20 to-emerald-400/15 text-cyan-200 ring-1 ring-white/15">
                    <p.icon className="h-5 w-5" aria-hidden />
                  </span>
                  <p className="text-base font-black text-white">{p.title}</p>
                  <p className="text-xs text-emerald-50/60">{p.sub}</p>
                </Glass>
              ))}
            </div>

            <div className={`mx-auto mt-8 inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-white/5 px-4 py-2 text-sm font-semibold text-emerald-50/80 ${styles.insight}`}>
              <InfinityIcon className="h-4 w-4 text-cyan-300" aria-hidden />
              הרגלים קטנים · השפעה אדירה · לכל החיים
            </div>
          </motion.div>
        </section>

        {/* ───────── AI-FIRST CAPABILITIES ───────── */}
        <section className="px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <motion.div
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-60px' }}
            >
              <Eyebrow>למה AI-First</Eyebrow>
              <h2 className="mt-5 text-3xl font-black leading-tight sm:text-5xl">
                כל מסך, כל החלטה,
                <br />
                <span className={styles.gradientText}>נולדים מתוך שיחה.</span>
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-emerald-50/75 sm:text-lg">
                אפליקציות אחרות הוסיפו צ׳אט בצד. אצלנו ה-AI הוא הלב — הוא בונה את המסע, מתאים את
                המשימות בזמן אמת, וזוכר אתכם בין שיחה לשיחה.
              </p>
            </motion.div>
          </div>

          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-60px' }}
            className="mx-auto mt-12 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {[
              {
                icon: BrainCircuit,
                title: 'מבין הקשר',
                text: 'לא תשובות גנריות — אלמוג מחבר את מה שאמרתם אתמול למה שאתם צריכים היום.',
              },
              {
                icon: Fingerprint,
                title: 'זיכרון אישי',
                text: 'דוסייה חכם שזוכר העדפות, אתגרים והצלחות — ומתפתח יחד אתכם.',
              },
              {
                icon: Gauge,
                title: 'מתאים בזמן אמת',
                text: 'קושי המשימות, התזכורות והתוכן משתנים אוטומטית לפי הקצב שלכם.',
              },
              {
                icon: Radar,
                title: 'מזהה לפני שנופלים',
                text: 'מבחין בסימני שחיקה או נטישה — ושולח מגע עדין בדיוק ברגע הנכון.',
              },
              {
                icon: MessageCircle,
                title: 'שיחה אמיתית',
                text: 'בעברית טבעית, בלי שיפוטיות. אפשר גם בטקסט, גם בקול.',
              },
              {
                icon: Cpu,
                title: 'מנוע ידע',
                text: 'מבוסס על תוכן מקצועי (RAG) — תשובות מדויקות, לא ניחושים.',
              },
            ].map((f) => (
              <motion.div key={f.title} variants={fadeUp}>
                <TiltCard className={`h-full rounded-3xl p-6 ${styles.glass}`}>
                  <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300/25 to-emerald-400/15 text-cyan-200 ring-1 ring-white/15">
                    <f.icon className="h-6 w-6" aria-hidden />
                  </span>
                  <h3 className="text-lg font-black text-white">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-emerald-50/70">{f.text}</p>
                </TiltCard>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* ───────── HOW THE AI WORKS (3 steps) ───────── */}
        <section className="px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow>איך ה-AI עובד</Eyebrow>
            <h2 className="mt-5 text-3xl font-black sm:text-5xl">
              שלושה צעדים — <span className={styles.gradientText}>ואלמוג איתכם</span>
            </h2>
          </div>

          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-60px' }}
            className="mx-auto mt-12 grid max-w-5xl gap-4 md:grid-cols-3"
          >
            {[
              {
                n: '01',
                icon: MessageCircle,
                title: 'מספרים על עצמכם',
                text: 'שיחה קצרה עם דולב בקליטה — בלי טפסים מעיקים, רק מה שחשוב.',
              },
              {
                n: '02',
                icon: Wand2,
                title: 'ה-AI בונה מסע',
                text: 'אלמוג מרכיב מסלול אישי: קורסים, הרגלים ומשימות בקצב שלכם.',
              },
              {
                n: '03',
                icon: Heart,
                title: 'מתאמן ומשתפר',
                text: 'ככל שמשתמשים — ה-AI מכיר אתכם יותר, והליווי נעשה מדויק יותר.',
              },
            ].map((s) => (
              <motion.div key={s.n} variants={fadeUp}>
                <Glass strong className="relative h-full overflow-hidden rounded-3xl p-6">
                  <span className="pointer-events-none absolute -left-2 -top-3 text-7xl font-black text-white/5">
                    {s.n}
                  </span>
                  <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-300/25 to-cyan-400/15 text-emerald-200 ring-1 ring-white/15">
                    <s.icon className="h-6 w-6" aria-hidden />
                  </span>
                  <h3 className="text-lg font-black text-white">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-emerald-50/70">{s.text}</p>
                </Glass>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* ───────── STATS GLASS STRIP ───────── */}
        <section className="px-4 py-10 sm:px-6">
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-40px' }}
            className="mx-auto grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-4"
          >
            {[
              { icon: Clock, value: '24/7', label: 'זמינות מלאה' },
              { icon: TrendingUp, value: '94%', label: 'שינוי בשבוע הראשון' },
              { icon: Sparkles, value: '4.9★', label: 'דירוג ממוצע' },
              { icon: Heart, value: '+1,200', label: 'במסע כבר עכשיו' },
            ].map((s) => (
              <motion.div key={s.label} variants={fadeUp}>
                <Glass className="h-full rounded-2xl p-4 text-center">
                  <s.icon className="mx-auto mb-2 h-5 w-5 text-cyan-300" aria-hidden />
                  <p className={`text-2xl font-black sm:text-3xl ${styles.gradientText}`}>
                    <CountUp value={s.value} />
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-emerald-50/70 sm:text-xs">
                    {s.label}
                  </p>
                </Glass>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* ───────── CONTRAST: instead ↔ you get ───────── */}
        <section className="px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow>ההבדל המהותי</Eyebrow>
            <h2 className="mt-5 text-3xl font-black sm:text-5xl">
              במקום מה שלא עובד — <span className={styles.gradientText}>תקבלו מה שכן</span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-emerald-50/75 sm:text-lg">
              כל מה שהדיאטות עשו לכם בעבר — אנחנו עושים אחרת לגמרי, עם AI שלא שופט.
            </p>
          </div>

          <motion.ul
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-60px' }}
            className="mx-auto mt-12 grid max-w-4xl gap-3"
          >
            {[
              { badIcon: Calculator, bad: 'לספור כל קלוריה', good: 'יחס בריא לאוכל — בלי מספרים' },
              { badIcon: Ban, bad: 'רשימת מאכלים אסורים', good: 'חופש בחירה מודע — הכל מותר' },
              { badIcon: Frown, bad: 'אשמה אחרי כל ארוחה', good: 'שקט פנימי וליווי תומך' },
              { badIcon: Scale, bad: 'המספר על המשקל מכתיב את היום', good: 'אנרגיה, שינה ואורח חיים' },
            ].map((row) => (
              <motion.li key={row.good} variants={fadeUp}>
                <Glass className="grid grid-cols-1 items-stretch gap-2 rounded-3xl p-3 sm:grid-cols-[1fr_auto_1fr]">
                  <div className="flex items-center gap-3 rounded-2xl bg-rose-500/8 px-4 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-300">
                      <row.badIcon className="h-4.5 w-4.5" aria-hidden />
                    </span>
                    <span className="text-sm text-emerald-50/75 line-through decoration-rose-400/60">
                      {row.bad}
                    </span>
                  </div>
                  <div className="flex items-center justify-center text-cyan-300" aria-hidden>
                    <ArrowLeft className="hidden h-5 w-5 sm:block" />
                    <ArrowDown className="mx-auto h-4 w-4 sm:hidden" />
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl bg-emerald-400/8 px-4 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-200">
                      <CheckCircle2 className="h-4.5 w-4.5" aria-hidden />
                    </span>
                    <span className="text-sm font-semibold text-white">{row.good}</span>
                  </div>
                </Glass>
              </motion.li>
            ))}
          </motion.ul>
        </section>

        {/* ───────── LIFE PILLARS (glass) ───────── */}
        <section className="px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow>אורח חיים שלם</Eyebrow>
            <h2 className="mt-5 text-3xl font-black sm:text-5xl">
              לא רק תזונה. <span className={styles.gradientText}>הכל מחובר.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-emerald-50/75 sm:text-lg">
              ה-AI מסתכל על התמונה המלאה — מה שאוכלים, איך ישנים, איך מתנועעים ואיך מרגישים.
            </p>
          </div>

          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-60px' }}
            className="mx-auto mt-12 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            {[
              { icon: Utensils, title: 'תזונה', text: 'בחירה מודעת — לא ספירה ולא איסורים.' },
              { icon: Zap, title: 'אנרגיה', text: 'תנועה שמרגישה טוב, לאורך כל היום.' },
              { icon: Moon, title: 'שינה', text: 'מנוחה איכותית כחלק מהמערכת.' },
              { icon: Compass, title: 'ראש', text: 'שקט פנימי, פחות אשמה, יותר בחירה.' },
            ].map((p) => (
              <motion.div key={p.title} variants={fadeUp}>
                <Glass className="group h-full rounded-3xl p-6 text-center transition hover:-translate-y-1.5">
                  <span className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300/20 to-emerald-400/15 text-cyan-200 ring-1 ring-white/15 transition group-hover:scale-110">
                    <p.icon className="h-7 w-7" aria-hidden />
                  </span>
                  <h3 className="text-lg font-black text-white">{p.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-emerald-50/70">{p.text}</p>
                </Glass>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* ───────── FUTURE SELF — imagine ───────── */}
        <section className="px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow>החיים שלכם בעוד 30 יום</Eyebrow>
            <h2 className="mt-5 text-3xl font-black sm:text-5xl">
              תדמיינו את עצמכם<span className={styles.gradientText}>…</span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-emerald-50/75 sm:text-lg">
              כי השינוי האמיתי הוא איך אתם מרגישים — לא מה אומר המאזניים.
            </p>
          </div>

          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-60px' }}
            className="mx-auto mt-12 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {[
              { icon: Sunrise, text: 'מתעוררים עם אנרגיה', hl: 'בלי לחשוב "מה אסור לי היום"' },
              { icon: Coffee, text: 'יושבים לארוחה משפחתית', hl: 'ונהנים מכל ביס — בלי אשמה' },
              { icon: BrainCircuit, text: 'מקשיבים לגוף שלכם', hl: 'יודעים מתי רעבים ומתי שבעים' },
              { icon: Smile, text: 'מסתכלים במראה', hl: 'ורואים מישהו שטוב לו עם עצמו' },
              { icon: Activity, text: 'מתנועעים בכיף', hl: 'תנועה שמרגישה טוב — לא חובה' },
              { icon: BedDouble, text: 'נרדמים בשקט', hl: 'שינה איכותית כחלק מהחיים' },
            ].map((item) => (
              <motion.div key={item.text} variants={fadeUp}>
                <Glass className="flex h-full items-start gap-3 rounded-3xl p-5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300/20 to-emerald-400/15 text-cyan-200 ring-1 ring-white/15">
                    <item.icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <p className="font-black text-white">{item.text}</p>
                    <p className="mt-1 text-sm leading-relaxed text-emerald-50/65">{item.hl}</p>
                  </div>
                </Glass>
              </motion.div>
            ))}
          </motion.div>

          <motion.p
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="mx-auto mt-10 max-w-2xl text-center text-base font-semibold text-emerald-100/85 sm:text-lg"
          >
            זה לא חלום. זה מה שקורה כשמפסיקים להילחם בגוף — ומתחילים להקשיב לו.
          </motion.p>
        </section>

        {/* ───────── TIMELINE — habits compound ───────── */}
        <section className="px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow>הרגלים מצטברים</Eyebrow>
            <h2 className="mt-5 text-3xl font-black sm:text-5xl">
              הרגל קטן היום — <span className={styles.gradientText}>אורח חיים מחר</span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-emerald-50/75 sm:text-lg">
              לא צריך לשנות הכל בבת אחת. כל יום מוסיף שכבה — וה-AI מתאים את הקצב אליכם.
            </p>
          </div>

          <div className="relative mx-auto mt-14 max-w-2xl">
            {/* glowing spine */}
            <div className={`${styles.spine} right-[26px] top-0 hidden h-full w-[2px] sm:block`} aria-hidden>
              <span className={styles.spinePulse} style={{ left: '-5px' }} />
            </div>

            <motion.ol
              variants={stagger}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-60px' }}
              className="space-y-4"
            >
              {[
                { day: 'יום 1', icon: PlayCircle, title: 'הצעד הראשון', text: 'הרשמה ושיחה עם דולב — והבנה שזה לא דיאטה.' },
                { day: 'יום 7', icon: Leaf, title: 'הרגל ראשון נדבק', text: 'משימה יומית קטנה שהופכת לשגרה.' },
                { day: 'יום 30', icon: BrainCircuit, title: 'הראש משתנה', text: 'פחות אשמה, יותר בחירה. היחס לאוכל אחר.' },
                { day: 'יום 90', icon: Zap, title: 'הגוף מגיב', text: 'יותר אנרגיה, שינה טובה יותר, תחושה אחרת.' },
                { day: 'יום 365', icon: Star, title: 'זה מי שאתם', text: 'אורח חיים, לא פרויקט. אתם פשוט חיים אחרת.' },
              ].map((step) => (
                <motion.li
                  key={step.day}
                  variants={fadeUp}
                  className="relative sm:pr-16"
                >
                  <span className="absolute right-0 top-4 hidden h-[54px] w-[54px] items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300/30 to-emerald-400/20 text-cyan-100 ring-1 ring-white/25 sm:flex">
                    <step.icon className="h-6 w-6" aria-hidden />
                  </span>
                  <Glass className="rounded-3xl p-5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-cyan-200 sm:hidden">
                        <step.icon className="h-5 w-5" aria-hidden />
                      </span>
                      <span className="rounded-full bg-cyan-300/15 px-3 py-1 text-xs font-black text-cyan-100">
                        {step.day}
                      </span>
                      <h3 className="text-lg font-black text-white">{step.title}</h3>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-emerald-50/70">{step.text}</p>
                  </Glass>
                </motion.li>
              ))}
            </motion.ol>
          </div>

          <motion.p
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="mx-auto mt-10 flex max-w-xl items-center justify-center gap-2 text-center text-base font-semibold text-emerald-100/85"
          >
            <InfinityIcon className="h-5 w-5 shrink-0 text-cyan-300" aria-hidden />
            1% טוב יותר כל יום = <strong className="text-white">37×</strong> שינוי בשנה.
          </motion.p>
        </section>

        {/* ───────── MENTORS ───────── */}
        <section className="px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow>הצוות שלכם</Eyebrow>
            <h2 className="mt-5 text-3xl font-black sm:text-5xl">
              לא לבד במסע — <span className={styles.gradientText}>שני מנטורי AI</span>
            </h2>
          </div>

          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-60px' }}
            className="mx-auto mt-12 grid max-w-4xl gap-4 sm:grid-cols-2"
          >
            {[
              {
                name: 'דולב',
                role: 'מקבל אתכם בקליטה',
                text: 'שואל רק מה שחשוב, ומעביר אתכם לאלמוג כשאתם מוכנים להתחיל.',
                icon: MessageCircle,
              },
              {
                name: 'אלמוג',
                role: 'המנטור היומיומי',
                text: 'מלווה בקורסים, משימות והרגלים. לומד את הקצב ונותן עידוד כשצריך.',
                icon: BrainCircuit,
              },
            ].map((m) => (
              <motion.div key={m.name} variants={fadeUp}>
                <Glass strong className={`relative h-full overflow-hidden rounded-3xl p-6 ${styles.sheen}`}>
                  <div className="flex items-center gap-4">
                    <span className={`relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300/30 to-emerald-400/20 text-cyan-100 ring-1 ring-white/25 ${styles.orb}`}>
                      <m.icon className="h-6 w-6" aria-hidden />
                    </span>
                    <div>
                      <p className="text-xl font-black text-white">{m.name}</p>
                      <p className="text-sm text-emerald-200/80">{m.role}</p>
                    </div>
                    <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2.5 py-1 text-[11px] font-bold text-emerald-100">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                      AI
                    </span>
                  </div>
                  <p className="mt-4 leading-relaxed text-emerald-50/80">{m.text}</p>
                </Glass>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* ───────── FAQ ───────── */}
        <section className="px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow>שאלות שמטרידות אתכם</Eyebrow>
            <h2 className="mt-5 text-3xl font-black sm:text-5xl">
              כל מה שרציתם <span className={styles.gradientText}>לדעת</span>
            </h2>
          </div>

          <div className="mx-auto mt-10 max-w-2xl space-y-3">
            {[
              {
                q: 'רגע, זאת בעצם דיאטה?',
                a: 'ממש לא. אין תפריט מוכתב, אין מאכלים אסורים. ה-AI מלמד אתכם להבין את הגוף שלכם — ואז אתם בוחרים לבד, בלי לחץ.',
              },
              {
                q: 'אצטרך לספור קלוריות?',
                a: 'לעולם לא. אנחנו לא מאמינים שמספרים = בריאות. לומדים לזהות רעב אמיתי, לבחור בכיף ולהפסיק בלי אשמה.',
              },
              {
                q: 'מה אם אני "נופל"?',
                a: 'אין נפילות פה. כל ארוחה היא הזדמנות חדשה, לא מבחן. אלמוג יבין למה, יחזק אתכם וימשיך הלאה איתכם.',
              },
              {
                q: 'כמה זמן ביום זה דורש?',
                a: '5–10 דקות. משימה קצרה, שיעור קצר או שיחה עם אלמוג — נכנס בקלות לסדר היום.',
              },
              {
                q: 'באמת חינם?',
                a: 'בלי מלכודות ובלי כרטיס אשראי. נרשמים בדקה ומקבלים גישה מלאה למסע, לקורסים ולמנטור ה-AI.',
              },
            ].map((item, i) => {
              const isOpen = openFaq === i;
              return (
                <motion.div
                  key={item.q}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-30px' }}
                  transition={{ duration: 0.25, ease: EASE }}
                >
                  <Glass className={`overflow-hidden rounded-2xl transition ${isOpen ? 'border-cyan-300/40' : ''}`}>
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : i)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center gap-3 px-5 py-4 text-right"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-cyan-300/15 text-cyan-200">
                        <HelpCircle className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="flex-1 font-bold text-white">{item.q}</span>
                      <ChevronLeft
                        className={`h-5 w-5 shrink-0 text-cyan-200 transition-transform duration-300 ${isOpen ? '-rotate-90' : ''}`}
                        aria-hidden
                      />
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen ? (
                        <motion.div
                          key="a"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.28, ease: EASE }}
                        >
                          <p className="px-5 pb-5 pr-16 text-sm leading-relaxed text-emerald-50/75">
                            {item.a}
                          </p>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </Glass>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* ───────── STORY — 4 words WOW ───────── */}
        <section className="relative overflow-hidden px-4 py-20 sm:px-6 sm:py-28">
          <div className={styles.storyGlow} aria-hidden />
          <div aria-hidden>
            <span className={`${styles.storyRing}`} />
            <span className={`${styles.storyRing} ${styles.storyRing2}`} />
            <span className={`${styles.storyRing} ${styles.storyRing3}`} />
          </div>

          <div className="relative mx-auto max-w-3xl text-center">
            <Eyebrow>הסיפור שלכם</Eyebrow>
            <h2 className="mt-5 text-3xl font-black sm:text-5xl">
              ארבע מילים. <br className="hidden sm:block" />
              סיפור שלם.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-emerald-50/75 sm:text-lg">
              כל מי שהגיע לפה עבר בדיוק את ארבעת הרגעים האלה.
              <strong className="text-white"> הרביעי הוא הסיבה שאנחנו פה.</strong>
            </p>

            <ol className="mt-12 space-y-7">
              {[
                { word: 'ניסיתם.', sub: 'דיאטה אחר דיאטה, שיטה אחר שיטה.', badge: '01', glow: false },
                { word: 'נפלתם.', sub: 'לא בגללכם — בגלל שיטה שתוכננה לכישלון.', badge: '02', glow: false },
                { word: 'קמתם.', sub: 'כי אתם חזקים מכל מספר על מאזניים.', badge: '03', glow: false },
                { word: 'הגעתם.', sub: 'לאורח חיים שמחזיק. לכם. לתמיד.', badge: '04', glow: true },
              ].map((item, i) => (
                <motion.li
                  key={item.word}
                  initial={{ opacity: 0, y: 28, scale: 0.94 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, margin: '-15%' }}
                  transition={{ delay: i * 0.18, duration: 0.6, ease: EASE }}
                >
                  <span className="mb-1 block text-xs font-black tracking-[0.3em] text-cyan-300/60">
                    {item.badge}
                  </span>
                  <span
                    className={`block text-5xl font-black sm:text-7xl ${item.glow ? styles.storyWordGlow : styles.storyWord}`}
                  >
                    {item.word}
                  </span>
                  <span className="mt-2 block text-sm text-emerald-50/70 sm:text-base">{item.sub}</span>
                </motion.li>
              ))}
            </ol>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.6, duration: 0.5 }}
              className="mt-14"
            >
              <p className="text-lg font-bold text-white sm:text-xl">
                זה הזמן שלכם. <span className={styles.gradientText}>זה היום שלכם.</span>
              </p>
              <Link
                href="/register"
                className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-cyan-300 via-emerald-300 to-teal-300 px-8 py-4 text-base font-black text-emerald-950 shadow-[0_14px_40px_rgba(20,255,236,0.4)] transition active:scale-[0.98]"
              >
                <Sparkles className="h-5 w-5" aria-hidden />
                להתחיל את הפרק החדש
                <ChevronLeft className="h-5 w-5" aria-hidden />
              </Link>
            </motion.div>
          </div>
        </section>

        {/* ───────── FINAL CTA ───────── */}
        <section className="px-4 py-16 sm:px-6 sm:py-24">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-60px' }}
            className="mx-auto max-w-4xl"
          >
            <Glass
              strong
              className={`relative overflow-hidden rounded-[2.5rem] px-6 py-12 text-center sm:px-12 sm:py-16 ${styles.sheen}`}
            >
              <span
                className="pointer-events-none absolute inset-0 opacity-60"
                style={{
                  background:
                    'radial-gradient(60% 60% at 50% 0%, rgba(20,255,236,0.22), transparent 70%)',
                }}
                aria-hidden
              />
              <div className="relative">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-1.5 text-xs font-bold text-emerald-100">
                  <Sparkles className="h-4 w-4" aria-hidden />
                  חינם להתחיל · בלי כרטיס אשראי
                </span>
                <h2 className="mx-auto mt-6 max-w-2xl text-3xl font-black leading-tight sm:text-5xl">
                  ה-AI שיבין אתכם
                  <br />
                  <span className={styles.shimmer}>מחכה בצד השני.</span>
                </h2>
                <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-emerald-50/80 sm:text-lg">
                  60 שניות להירשם. אחר כך אלמוג מכיר אתכם, בונה את המסע, ומלווה אתכם כל יום.
                </p>
                <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                  <Link
                    href="/register"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-cyan-300 via-emerald-300 to-teal-300 px-8 py-4 text-base font-black text-emerald-950 shadow-[0_14px_40px_rgba(20,255,236,0.35)] transition active:scale-[0.98]"
                  >
                    <Heart className="h-5 w-5" aria-hidden />
                    בואו נתחיל — חינם
                  </Link>
                  <Link
                    href="/login"
                    className={`inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-bold text-white transition hover:bg-white/15 ${styles.glass}`}
                  >
                    כניסה לחשבון
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                  </Link>
                </div>
              </div>
            </Glass>
          </motion.div>
        </section>
      </main>

      {/* ───────── FOOTER ───────── */}
      <footer className="relative z-10 border-t border-white/10 px-4 py-8 text-center text-sm text-emerald-50/50">
        <p>© {new Date().getFullYear()} NuraWell — אורח חיים מלווה ב-AI</p>
      </footer>

      {/* scroll-to-top */}
      {showTop ? (
        <button
          type="button"
          onClick={scrollTop}
          aria-label="חזרה לראש העמוד"
          className={`fixed bottom-5 left-5 z-50 flex h-11 w-11 items-center justify-center rounded-full text-white transition hover:-translate-y-0.5 ${styles.glassStrong}`}
        >
          <ArrowUp className="h-5 w-5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
