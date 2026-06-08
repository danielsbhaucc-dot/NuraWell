'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, useScroll, useSpring, type Variants } from 'framer-motion';
import {
  ArrowLeft,
  ArrowUp,
  BrainCircuit,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Compass,
  Cpu,
  Fingerprint,
  Gauge,
  Heart,
  MessageCircle,
  Mic,
  Moon,
  Radar,
  Send,
  Sparkles,
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

export function LandingAiClient() {
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 520);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
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
        {/* ───────── AI-FIRST MANIFESTO ───────── */}
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
                <Glass className="group h-full rounded-3xl p-6 transition duration-300 hover:-translate-y-1.5 hover:border-cyan-300/40">
                  <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300/25 to-emerald-400/15 text-cyan-200 ring-1 ring-white/15 transition group-hover:scale-110">
                    <f.icon className="h-6 w-6" aria-hidden />
                  </span>
                  <h3 className="text-lg font-black text-white">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-emerald-50/70">{f.text}</p>
                </Glass>
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
                  <p className={`text-2xl font-black sm:text-3xl ${styles.gradientText}`}>{s.value}</p>
                  <p className="mt-1 text-[11px] font-semibold text-emerald-50/70 sm:text-xs">
                    {s.label}
                  </p>
                </Glass>
              </motion.div>
            ))}
          </motion.div>
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
