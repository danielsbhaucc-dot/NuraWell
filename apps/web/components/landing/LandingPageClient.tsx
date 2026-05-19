'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Bell,
  BookOpen,
  Check,
  Heart,
  Leaf,
  Map,
  Route,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import { NuraWellLogo } from '@/components/shared/NuraWellLogo';
import { MentorBubble } from '@/components/onboarding/MentorBubble';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] },
  }),
};

const HERO_IMAGES = [
  {
    src: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=640&q=85&auto=format&fit=crop',
    alt: 'מזון טבעי ומאוזן',
    className: 'col-span-2 row-span-2',
  },
  {
    src: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50c?w=400&q=85&auto=format&fit=crop',
    alt: 'תנועה ואנרגיה ביומיום',
    className: '',
  },
  {
    src: 'https://images.unsplash.com/photo-1498837167922-ddd27525cd40?w=400&q=85&auto=format&fit=crop',
    alt: 'ארוחה בריאה ומהנה',
    className: '',
  },
] as const;

const PROMISES = [
  { icon: X, label: 'בלי ספירת קלוריות' },
  { icon: X, label: 'לא דיאטה' },
  { icon: X, label: 'לא הרעבה' },
] as const;

const FEATURES = [
  {
    icon: Route,
    title: 'מסע אישי מובנה',
    description:
      'שלבים, תחנות ומשימות שמתקדמים איתכם — לא רשימת מטלות קרה, אלא דרך ברורה לשינוי אמיתי.',
    accent: 'from-emerald-500/20 to-teal-500/10',
  },
  {
    icon: Sparkles,
    title: 'אלמוג — מנטור AI',
    description:
      'ליווי חכם שמכיר את הקצב, המטרות והאתגרים שלכם. תגובות, עידוד והכוונה בזמן אמת.',
    accent: 'from-teal-500/20 to-cyan-500/10',
  },
  {
    icon: BookOpen,
    title: 'קורסים ושיעורים',
    description: 'וידאו, אודיו וטקסט — תוכן מקצועי בעברית, בקצב שלכם, עם מעקב התקדמות חכם.',
    accent: 'from-emerald-600/15 to-green-500/10',
  },
  {
    icon: Sun,
    title: 'הרגלים יומיים',
    description: 'משימות קטנות שבונות אורח חיים — בלי לחץ, בלי אשמה, עם חגיגה על כל צעד.',
    accent: 'from-amber-500/15 to-orange-500/10',
  },
  {
    icon: Bell,
    title: 'תזכורות בזמן הנכון',
    description: 'מגעים עדינים לפני הרגעים הקשים — כשזה באמת עוזר, לא ספאם.',
    accent: 'from-violet-500/12 to-emerald-500/10',
  },
  {
    icon: Map,
    title: 'מעקב התקדמות',
    description: 'רואים איפה עמדתם, מה השתנה, ומה הצעד הבא — בלי מספרים שמעיקים.',
    accent: 'from-teal-600/15 to-emerald-500/10',
  },
] as const;

const STEPS = [
  {
    num: '1',
    title: 'הרשמה קצרה עם דולב',
    text: 'שאלון זריז ובלי שיפוט — רק מה שחשוב כדי להכיר אתכם.',
  },
  {
    num: '2',
    title: 'מסע מותאם אישית',
    text: 'קורסים, שלבים והרגלים שנבנים סביב החיים שלכם — לא תבנית אחת לכולם.',
  },
  {
    num: '3',
    title: 'ליווי יומיומי של אלמוג',
    text: 'משימות, עידוד והכוונה — כדי להרגיש טוב ולהתמיד, לא רק להתחיל.',
  },
] as const;

const TRUST_POINTS = [
  { value: 'AI', label: 'מנטור אישי' },
  { value: '24/7', label: 'זמינות באפליקציה' },
  { value: '100%', label: 'בעברית' },
] as const;

export function LandingPageClient() {
  return (
    <div className="landing-shell no-tap-highlight" dir="rtl">
      {/* רקע דקורטיבי */}
      <motion.div
        aria-hidden
        className="pointer-events-none fixed -top-24 -start-16 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl"
        animate={{ scale: [1, 1.08, 1], opacity: [0.5, 0.7, 0.5] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none fixed top-1/3 -end-20 h-64 w-64 rounded-full bg-teal-300/15 blur-3xl"
        animate={{ scale: [1.05, 1, 1.05], opacity: [0.4, 0.6, 0.4] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Header */}
      <header className="sticky top-0 z-50 safe-area-top">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-3 mt-3 sm:mx-auto sm:max-w-lg"
        >
          <div className="landing-glass flex items-center justify-between gap-3 px-4 py-3 rounded-2xl">
            <NuraWellLogo size="sm" showTagline={false} animate={false} />
            <Link
              href="/login"
              className="text-sm font-bold text-emerald-800 hover:text-emerald-600 transition-colors px-3 py-2 rounded-xl hover:bg-emerald-50/80"
            >
              כניסה
            </Link>
          </div>
        </motion.div>
      </header>

      <main id="main-content" className="relative z-10 pb-10">
        {/* Hero */}
        <section className="container-mobile pt-6 pb-4 sm:pt-10">
          <motion.div
            initial="hidden"
            animate="visible"
            className="text-center"
          >
            <motion.span
              custom={0}
              variants={fadeUp}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold text-emerald-800 border border-emerald-200/80 bg-white/50 backdrop-blur-md mb-5"
            >
              <Leaf className="w-3.5 h-3.5 text-emerald-600" aria-hidden />
              NuraWell — אור. בריאות. איזון.
            </motion.span>

            <motion.h1
              custom={1}
              variants={fadeUp}
              className="text-[2.15rem] leading-[1.12] sm:text-5xl sm:leading-tight tracking-tight mb-4"
            >
              <span className="landing-hero-title-line1 block">הדרך החכמה</span>
              <span className="landing-hero-title-line2 block mt-1">לחיים בריאים</span>
            </motion.h1>

            <motion.p
              custom={2}
              variants={fadeUp}
              className="text-[15px] sm:text-lg text-slate-600 leading-relaxed max-w-sm mx-auto mb-6 font-medium"
            >
              מערכת פרימיום לשינוי אורח חיים — עם מנטור AI, מסע מובנה וקורסים.
              <span className="text-emerald-800 font-bold"> בלי דיאטות. בלי הרעבה. בלי מספרים שמעיקים.</span>
            </motion.p>

            {/* הבטחות */}
            <motion.ul
              custom={3}
              variants={fadeUp}
              className="flex flex-wrap justify-center gap-2 mb-7 max-w-md mx-auto"
              aria-label="מה לא עושים"
            >
              {PROMISES.map((p) => (
                <li
                  key={p.label}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-bold text-emerald-900 landing-glass"
                >
                  <p.icon className="w-3.5 h-3.5 text-emerald-600 opacity-70" aria-hidden />
                  {p.label}
                </li>
              ))}
            </motion.ul>

            {/* CTA */}
            <motion.div
              custom={4}
              variants={fadeUp}
              className="flex flex-col gap-3 max-w-xs mx-auto sm:max-w-sm mb-8"
            >
              <Link href="/register" className="landing-cta-primary w-full">
                <Sparkles className="w-5 h-5" aria-hidden />
                התחילו את המסע — חינם
              </Link>
              <Link href="/login" className="landing-cta-secondary w-full">
                כבר יש לי חשבון
                <ArrowLeft className="w-4 h-4" aria-hidden />
              </Link>
            </motion.div>
          </motion.div>

          {/* גלריית תמונות */}
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.35 }}
            className="landing-glass-strong p-2.5 sm:p-3 max-w-md mx-auto"
          >
            <motion.div
              className="grid grid-cols-3 grid-rows-2 gap-2 h-[220px] sm:h-[260px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.45 }}
            >
              {HERO_IMAGES.map((img, i) => (
                <motion.div
                  key={img.src}
                  className={`relative overflow-hidden rounded-2xl ${img.className}`}
                  whileHover={{ scale: 1.02 }}
                  transition={{ type: 'spring', stiffness: 300 }}
                >
                  <Image
                    src={img.src}
                    alt={img.alt}
                    fill
                    sizes={i === 0 ? '(max-width: 448px) 66vw' : '(max-width: 448px) 33vw'}
                    className="object-cover"
                    priority={i === 0}
                  />
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-t from-emerald-950/35 via-transparent to-transparent"
                    aria-hidden
                  />
                </motion.div>
              ))}
            </motion.div>
            <p className="text-center text-xs text-slate-500 mt-2.5 font-medium">
              אוכל טוב, תנועה נעימה, שגרה שאפשר לחיות איתה
            </p>
          </motion.div>
        </section>

        {/* אמון */}
        <section className="container-mobile py-6" aria-label="יתרונות מרכזיים">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            className="grid grid-cols-3 gap-2"
          >
            {TRUST_POINTS.map((t) => (
              <motion.div
                key={t.label}
                whileHover={{ y: -2 }}
                className="landing-glass text-center py-4 px-2 rounded-2xl"
              >
                <motion.div className="text-xl sm:text-2xl font-black landing-hero-title-line1">{t.value}</motion.div>
                <motion.div className="text-[11px] sm:text-xs text-slate-600 font-semibold mt-0.5">{t.label}</motion.div>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* פיצ׳רים */}
        <section className="container-mobile py-8" aria-labelledby="features-heading">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-7"
          >
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold text-teal-800 bg-teal-50/90 border border-teal-200/70 mb-3">
              הכל במקום אחד
            </span>
            <h2 id="features-heading" className="text-2xl sm:text-3xl font-black text-slate-900 mb-2" style={{ fontFamily: 'Rubik, Heebo, sans-serif' }}>
              מערכת שבנויה לחיים אמיתיים
            </h2>
            <p className="text-slate-600 text-[15px] leading-relaxed max-w-sm mx-auto">
              לא עוד אפליקציית דיאטה — ליווי חם, תוכן מקצועי והרגלים שמחזיקים לאורך זמן.
            </p>
          </motion.div>

          <div className="space-y-3 max-w-md mx-auto sm:max-w-lg">
            {FEATURES.map((f, i) => (
              <motion.article
                key={f.title}
                initial={{ opacity: 0, x: 24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-30px' }}
                transition={{ delay: i * 0.06 }}
                className="landing-glass overflow-hidden group"
              >
                <div className={`flex gap-4 p-4 bg-gradient-to-l ${f.accent}`}>
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/80 shadow-sm border border-white/90">
                    <f.icon className="w-6 h-6 text-emerald-700" aria-hidden />
                  </span>
                  <div className="text-right flex-1 min-w-0">
                    <h3 className="font-black text-slate-900 text-base mb-1">{f.title}</h3>
                    <p className="text-sm text-slate-600 leading-relaxed">{f.description}</p>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        </section>

        {/* מנטורים */}
        <section className="container-mobile py-8" aria-labelledby="mentors-heading">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-6"
          >
            <h2 id="mentors-heading" className="text-2xl font-black text-slate-900 mb-2" style={{ fontFamily: 'Rubik, Heebo, sans-serif' }}>
              לא לבד — מלווים אתכם
            </h2>
            <p className="text-slate-600 text-sm">דולב בקליטה, אלמוג במסע — ליווי אישי, לא אפליקציה קרה.</p>
          </motion.div>

          <div className="space-y-4 max-w-md mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="landing-glass-strong p-4 sm:p-5"
            >
              <MentorBubble mentorId="dolev" theme="light">
                <p>
                  אני <strong className="text-emerald-800">דולב</strong> — אקח מכם כמה פרטים זריזים בהרשמה,
                  בלי שיפוט, ואעביר אתכם לאלמוג שילווה אתכם במסע.
                </p>
              </MentorBubble>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="landing-glass-strong p-4 sm:p-5"
            >
              <MentorBubble mentorId="almog" theme="light">
                <p>
                  אני <strong className="text-emerald-800">אלמוג</strong> — המנטור שלכם בקורסים, משימות והרגלים.
                  לומד את הקצב שלכם ונותן עידוד והכוונה כשצריך.
                </p>
              </MentorBubble>
            </motion.div>
          </div>
        </section>

        {/* איך זה עובד */}
        <section className="container-mobile py-8" aria-labelledby="steps-heading">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-6"
          >
            <h2 id="steps-heading" className="text-2xl font-black text-slate-900" style={{ fontFamily: 'Rubik, Heebo, sans-serif' }}>
              איך מתחילים?
            </h2>
          </motion.div>

          <ol className="space-y-3 max-w-md mx-auto list-none">
            {STEPS.map((step, i) => (
              <motion.li
                key={step.num}
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="landing-glass flex items-start gap-4 p-4"
              >
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white font-black text-lg"
                  style={{ background: 'linear-gradient(135deg, #047857, #10b981)' }}
                  aria-hidden
                >
                  {step.num}
                </span>
                <motion.div className="text-right flex-1 pt-0.5">
                  <h3 className="font-black text-slate-900 mb-1">{step.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{step.text}</p>
                </motion.div>
              </motion.li>
            ))}
          </ol>
        </section>

        {/* CTA סופי */}
        <section className="container-mobile py-6 safe-area-bottom">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="landing-glass-strong overflow-hidden max-w-md mx-auto"
          >
            <div
              className="px-6 py-8 text-center"
              style={{
                background:
                  'linear-gradient(168deg, rgba(4,120,87,0.92) 0%, rgba(5,150,105,0.88) 45%, rgba(13,148,136,0.9) 100%)',
              }}
            >
              <Heart className="w-10 h-10 text-emerald-200 mx-auto mb-3" aria-hidden />
              <h2 className="text-2xl font-black text-white mb-2" style={{ fontFamily: 'Rubik, Heebo, sans-serif' }}>
                מוכנים להרגיש טוב?
              </h2>
              <p className="text-emerald-50/95 text-[15px] leading-relaxed mb-6 max-w-xs mx-auto">
                הצטרפו עכשיו — מסע, קורסים וליווי AI. בלי דיאטה, בלי לחץ.
              </p>
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-2 min-h-[52px] px-8 rounded-2xl font-black text-lg bg-white text-emerald-800 shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-transform w-full max-w-xs touch-manipulation"
              >
                <Check className="w-5 h-5" aria-hidden />
                בואו נתחיל
              </Link>
            </div>
          </motion.div>
        </section>

        {/* Footer */}
        <footer className="container-mobile pt-4 pb-6 text-center">
          <p className="text-xs text-slate-400">
            © {new Date().getFullYear()} NuraWell — הדרך החכמה לחיים בריאים
          </p>
        </footer>
      </main>
    </div>
  );
}
