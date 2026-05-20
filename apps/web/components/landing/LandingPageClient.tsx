'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  animate,
  motion,
  useInView,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion';
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  Apple,
  Ban,
  BedDouble,
  Bell,
  BookOpen,
  Brain,
  Calculator,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Coffee,
  Compass,
  Flame,
  Frown,
  Hand,
  Heart,
  HelpCircle,
  Infinity as InfinityIcon,
  Leaf,
  Moon,
  PlayCircle,
  Repeat,
  Route,
  Scale,
  Smile,
  Sparkles,
  Star,
  Sun,
  Sunrise,
  Trophy,
  Users,
  Utensils,
  Zap,
} from 'lucide-react';
import { NuraWellLogo } from '@/components/shared/NuraWellLogo';
import { MentorBubble } from '@/components/onboarding/MentorBubble';

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=1400&q=90&auto=format&fit=crop';

const SECTION_IMAGE_JOURNEY =
  'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=900&q=85&auto=format&fit=crop';

const SECTION_IMAGE_LIFESTYLE =
  'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50c?w=900&q=85&auto=format&fit=crop';

const ease = [0.22, 1, 0.36, 1] as const;

function SectionEyebrow({ children, light }: { children: React.ReactNode; light?: boolean }) {
  return (
    <span className={light ? 'landing-eyebrow landing-eyebrow-light' : 'landing-eyebrow'}>
      {children}
    </span>
  );
}

/** Animated count-up for stat values. Skips non-numeric prefixes/suffixes (e.g. "+", "%", "★"). */
function CountUp({ value, duration = 1.6 }: { value: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-30px' });
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (!inView) return;
    const match = value.match(/^([^\d]*)(\d[\d,.]*)(.*)$/);
    if (!match) {
      setDisplay(value);
      return;
    }
    const prefix = match[1];
    const numericRaw = match[2];
    const suffix = match[3];
    const hasComma = numericRaw.includes(',');
    const target = parseFloat(numericRaw.replace(/,/g, ''));
    if (Number.isNaN(target)) {
      setDisplay(value);
      return;
    }
    const controls = animate(0, target, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate(latest) {
        const v = Math.round(latest);
        const formatted = hasComma ? v.toLocaleString('he-IL') : String(v);
        setDisplay(`${prefix}${formatted}${suffix}`);
      },
    });
    return () => controls.stop();
  }, [inView, value, duration]);

  return <span ref={ref}>{display}</span>;
}

/** Floating particles for dark sections (pure CSS animation, no JS cost). */
function FloatingParticles({ count = 18 }: { count?: number }) {
  const items = Array.from({ length: count });
  return (
    <div className="landing-particles" aria-hidden>
      {items.map((_, i) => {
        const left = (i * 53 + 7) % 100;
        const delay = (i * 0.7) % 8;
        const duration = 14 + ((i * 3) % 12);
        const size = 3 + (i % 4);
        const opacity = 0.35 + ((i % 5) * 0.1);
        return (
          <span
            key={i}
            className="landing-particle"
            style={{
              left: `${left}%`,
              width: `${size}px`,
              height: `${size}px`,
              animationDuration: `${duration}s`,
              animationDelay: `-${delay}s`,
              opacity,
            }}
          />
        );
      })}
    </div>
  );
}

function SectionTitle({
  id,
  title,
  subtitle,
  light,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  light?: boolean;
}) {
  return (
    <>
      <h2
        id={id}
        className={light ? 'landing-h2 landing-h2-light' : 'landing-h2'}
      >
        {title}
      </h2>
      {subtitle ? (
        <p className={light ? 'landing-subtitle landing-subtitle-light' : 'landing-subtitle'}>
          {subtitle}
        </p>
      ) : null}
    </>
  );
}

export function LandingPageClient() {
  const { scrollYProgress } = useScroll();
  const progressScale = useSpring(scrollYProgress, {
    stiffness: 110,
    damping: 22,
    restDelta: 0.001,
  });

  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress: heroScroll } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const heroParallax = useTransform(heroScroll, [0, 1], ['0%', '-12%']);
  const heroFade = useTransform(heroScroll, [0, 1], [1, 0.55]);
  const heroContentLift = useTransform(heroScroll, [0, 1], ['0%', '-8%']);

  return (
    <div className="landing-page" dir="rtl">
      <motion.div
        className="landing-progress-bar"
        style={{ scaleX: progressScale }}
        aria-hidden
      />

      {/* ─── HERO ─── */}
      <section ref={heroRef} className="landing-hero" aria-label="ראש העמוד">
        <motion.div
          className="landing-hero-media"
          style={{ y: heroParallax, opacity: heroFade }}
          aria-hidden
        >
          <Image
            src={HERO_IMAGE}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-center"
          />
          <motion.div className="landing-hero-overlay" />
          <motion.div className="landing-hero-glow" />
          <motion.div className="landing-hero-orb landing-hero-orb-1" aria-hidden />
          <motion.div className="landing-hero-orb landing-hero-orb-2" aria-hidden />
        </motion.div>

        <header className="landing-nav safe-area-top">
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease }}
            className="landing-nav-inner"
          >
            <NuraWellLogo size="sm" showTagline={false} animate={false} />
            <Link href="/login" className="landing-nav-login">
              כניסה
            </Link>
          </motion.div>
        </header>

        <motion.div
          className="landing-hero-content safe-area-bottom"
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.12, ease }}
          style={{ y: heroContentLift }}
        >
          <p className="landing-hero-kicker">
            <Sparkles className="w-4 h-4" aria-hidden />
            NuraWell — ליווי AI אישי לחיים בריאים
          </p>

          <h1 className="landing-hero-title">
            <span className="landing-hero-title-accent">תפסיקו לספור.</span>
            <span className="landing-hero-title-main">תתחילו לחיות.</span>
          </h1>

          <p className="landing-hero-lead">
            לא רק ירידה במשקל — שינוי אמיתי באנרגיה, בשינה, בתזונה וביחס לעצמכם.
            <strong> מנטור AI, קורסים והרגלים לכל החיים — חינם להתחיל.</strong>
          </p>

          <div className="landing-hero-cta">
            <Link href="/register" className="landing-btn-primary">
              התחילו עכשיו — חינם
              <ChevronLeft className="w-5 h-5" aria-hidden />
            </Link>
            <Link href="/login" className="landing-btn-ghost">
              כבר יש לי חשבון
            </Link>
          </div>

          <ul className="landing-hero-pills" aria-label="הבטחות">
            {['בלי קלוריות', 'בלי איסורים', 'בלי שיפוטיות', 'בלי הרעבה'].map((label) => (
              <li key={label} className="landing-hero-pill">
                <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          className="landing-hero-scroll"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          aria-hidden
        >
          <span className="landing-hero-scroll-line" />
        </motion.div>
      </section>

      <main id="main-content">
        {/* ─── סטטיסטיקות / SOCIAL PROOF ─── */}
        <section className="landing-stats-strip" aria-label="נתוני אמון">
          <div className="landing-wrap">
            <ul className="landing-stats-grid">
              {[
                {
                  icon: Users,
                  value: '+1,200',
                  label: 'משתמשים בדרך',
                  tone: 'emerald',
                },
                {
                  icon: Flame,
                  value: '94%',
                  label: 'מרגישים שינוי בשבוע הראשון',
                  tone: 'orange',
                },
                {
                  icon: Trophy,
                  value: '4.9★',
                  label: 'דירוג ממוצע',
                  tone: 'amber',
                },
                {
                  icon: Heart,
                  value: '100%',
                  label: 'אורח חיים — לא דיאטה',
                  tone: 'rose',
                },
              ].map((s, i) => (
                <motion.li
                  key={s.label}
                  initial={{ opacity: 0, y: 24, scale: 0.94 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ delay: i * 0.08, duration: 0.5, ease }}
                  whileHover={{ y: -4, scale: 1.02 }}
                  className={`landing-stat landing-stat-${s.tone}`}
                >
                  <span className="landing-stat-icon">
                    <s.icon aria-hidden />
                  </span>
                  <div className="landing-stat-text">
                    <strong className="landing-stat-value">
                      <CountUp value={s.value} />
                    </strong>
                    <span className="landing-stat-label">{s.label}</span>
                  </div>
                </motion.li>
              ))}
            </ul>
          </div>
        </section>

        {/* ─── MANIFESTO — Way of Life (WOW) ─── */}
        <section className="landing-section landing-manifesto landing-fade-bottom" aria-labelledby="manifesto-heading">
          <FloatingParticles count={22} />
          <div className="landing-manifesto-orbs" aria-hidden>
            <span className="landing-manifesto-orb landing-manifesto-orb-1" />
            <span className="landing-manifesto-orb landing-manifesto-orb-2" />
            <span className="landing-manifesto-orb landing-manifesto-orb-3" />
            <span className="landing-manifesto-orb landing-manifesto-orb-4" />
          </div>

          <div className="landing-manifesto-grid" aria-hidden />

          <div className="landing-wrap">
            <div className="landing-manifesto-content">
              <motion.span
                className="landing-manifesto-eyebrow"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, ease }}
              >
                <Sparkles className="w-4 h-4" aria-hidden />
                הרעיון הגדול
              </motion.span>

              <motion.h2
                id="manifesto-heading"
                className="landing-manifesto-title"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.1, ease }}
              >
                <span className="landing-manifesto-line landing-manifesto-line-strike">
                  זה לא דיאטה.
                </span>
                <span className="landing-manifesto-line landing-manifesto-line-accent">
                  זה איך אתם חיים.
                </span>
              </motion.h2>

              <motion.p
                className="landing-manifesto-subtitle"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.3 }}
              >
                אורח חיים. הרגלים. <strong>זהות חדשה.</strong>
                <br className="hidden sm:block" />
                שינוי שלא נגמר בעוד חודש — אלא מחזיק לכל החיים.
              </motion.p>

              <div className="landing-manifesto-pillars">
                {[
                  { icon: Apple, title: 'תזונה', subtitle: 'לא משטר' },
                  { icon: Activity, title: 'תנועה', subtitle: 'לא כאב' },
                  { icon: Moon, title: 'מנוחה', subtitle: 'לא עצלות' },
                  { icon: Brain, title: 'ראש', subtitle: 'לא רק גוף' },
                ].map((pillar, i) => (
                  <motion.div
                    key={pillar.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.4 + i * 0.08, duration: 0.5, ease }}
                    className="landing-manifesto-pillar"
                  >
                    <span className="landing-manifesto-pillar-icon">
                      <pillar.icon aria-hidden />
                    </span>
                    <strong className="landing-manifesto-pillar-title">{pillar.title}</strong>
                    <span className="landing-manifesto-pillar-subtitle">{pillar.subtitle}</span>
                  </motion.div>
                ))}
              </div>

              <motion.div
                className="landing-manifesto-identity"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.85, duration: 0.6 }}
              >
                <span className="landing-manifesto-identity-label">
                  <Repeat className="w-4 h-4" aria-hidden />
                  השפה החדשה שלכם
                </span>
                <p className="landing-manifesto-identity-text">
                  אתם לא <em>"בדיאטה"</em>.
                  <br />
                  אתם הופכים לאדם <strong>שטוב לו בגוף שלו.</strong>
                </p>
                <span className="landing-manifesto-identity-footer">
                  <InfinityIcon className="w-4 h-4" aria-hidden />
                  הרגלים קטנים · השפעה אדירה · לכל החיים
                </span>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ─── פילוסופיה ─── */}
        <section className="landing-section landing-section-soft landing-section-glow" aria-labelledby="philosophy-heading">
          <div className="landing-section-orbs" aria-hidden>
            <span className="landing-section-orb landing-section-orb-emerald" />
            <span className="landing-section-orb landing-section-orb-amber" />
          </div>
          <div className="landing-wrap">
            <div className="landing-section-head landing-section-head-center">
              <SectionEyebrow>למה אנחנו שונים</SectionEyebrow>
              <SectionTitle
                id="philosophy-heading"
                title="לא עוד אפליקציית דיאטה"
                subtitle="אורח חיים שלם — תזונה, תנועה, שינה ואנרגיה. לא מספר על המשקל, לא רשימת איסורים."
              />
            </div>

            <div className="landing-philosophy-grid">
              {[
                {
                  icon: Apple,
                  title: 'אוכלים בטעם',
                  text: 'בלי מספרים, בלי אשמה. לומדים לבחור טוב — לא לספור כל ביס.',
                  tone: 'emerald',
                },
                {
                  icon: Leaf,
                  title: 'בונים הרגלים',
                  text: 'צעדים קטנים שמתחברים לשגרה. משימות יומיות עם עידוד, לא עונש.',
                  tone: 'teal',
                },
                {
                  icon: Zap,
                  title: 'אנרגיה ושינה',
                  text: 'לא רק מה שבצלחת — גם איך ישנים, מתנועעים ומרגישים לאורך היום.',
                  tone: 'orange',
                },
                {
                  icon: Compass,
                  title: 'מלווים באמת',
                  text: 'דולב בקליטה, אלמוג במסע — AI שמדבר אליכם, לא אלגוריתם קר.',
                  tone: 'amber',
                },
              ].map((item, i) => (
                <motion.article
                  key={item.title}
                  initial={{ opacity: 0, y: 32, scale: 0.92 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ delay: i * 0.1, duration: 0.55, ease }}
                  whileHover={{ y: -6, scale: 1.02 }}
                  className={`landing-philosophy-card landing-tone-${item.tone}`}
                >
                  <span className="landing-philosophy-icon">
                    <item.icon aria-hidden />
                  </span>
                  <h3 className="landing-card-title">{item.title}</h3>
                  <p className="landing-card-text">{item.text}</p>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        {/* ─── ניגוד: במקום ↔ תקבלו ─── */}
        <section className="landing-section landing-contrast" aria-labelledby="contrast-heading">
          <div className="landing-wrap">
            <div className="landing-section-head landing-section-head-center">
              <SectionEyebrow>ההבדל המהותי</SectionEyebrow>
              <SectionTitle
                id="contrast-heading"
                title="במקום מה שלא עובד — תקבלו מה שכן"
                subtitle="כל מה שהדיאטות עשו לכם בעבר, אנחנו עושים אחרת לגמרי."
              />
            </div>

            <ul className="landing-contrast-list">
              {[
                {
                  badIcon: Calculator,
                  bad: 'לספור כל קלוריה',
                  goodIcon: Heart,
                  good: 'יחס בריא לאוכל — בלי מספרים',
                },
                {
                  badIcon: Ban,
                  bad: 'רשימת מאכלים אסורים',
                  goodIcon: Sparkles,
                  good: 'חופש בחירה מודע — הכל מותר',
                },
                {
                  badIcon: Frown,
                  bad: 'תחושת אשמה אחרי כל ארוחה',
                  goodIcon: Smile,
                  good: 'שקט פנימי וליווי תומך — בלי שיפוטיות',
                },
                {
                  badIcon: ClipboardList,
                  bad: 'תפריט מוכתב שלא מתאים לחיים',
                  goodIcon: BookOpen,
                  good: 'ידע שמעצים אתכם לבחור לבד',
                },
                {
                  badIcon: Utensils,
                  bad: 'הרעבה ויומיים של נפילה',
                  goodIcon: Leaf,
                  good: 'הרגלים קטנים שדבקים לאורך זמן',
                },
                {
                  badIcon: Scale,
                  bad: 'מספר על המשקל שמכתיב את היום',
                  goodIcon: Sun,
                  good: 'אנרגיה, שינה ואורח חיים — לא רק המשקל',
                },
              ].map((row, i) => (
                <motion.li
                  key={row.good}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ delay: i * 0.05, duration: 0.4, ease }}
                  className="landing-contrast-row"
                >
                  <div className="landing-contrast-bad">
                    <span className="landing-contrast-icon landing-contrast-icon-bad">
                      <row.badIcon aria-hidden />
                    </span>
                    <span className="landing-contrast-bad-text">
                      <span className="landing-contrast-label">במקום</span>
                      {row.bad}
                    </span>
                  </div>
                  <div className="landing-contrast-arrow" aria-hidden>
                    <ArrowLeft className="landing-contrast-arrow-desktop w-5 h-5" />
                    <ArrowDown className="landing-contrast-arrow-mobile w-5 h-5" />
                  </div>
                  <div className="landing-contrast-good">
                    <span className="landing-contrast-icon landing-contrast-icon-good">
                      <row.goodIcon aria-hidden />
                    </span>
                    <span className="landing-contrast-good-text">
                      <span className="landing-contrast-label">תקבלו</span>
                      {row.good}
                    </span>
                  </div>
                </motion.li>
              ))}
            </ul>

            <motion.p
              className="landing-contrast-footnote"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4, duration: 0.5 }}
            >
              <Hand className="w-4 h-4" aria-hidden />
              אנחנו לא נכנסים לצלחת שלכם. אנחנו נותנים לכם את הכלים — אתם בוחרים.
            </motion.p>
          </div>
        </section>

        {/* ─── מסע + תמונה ─── */}
        <section className="landing-section landing-section-muted" aria-labelledby="journey-heading">
          <div className="landing-wrap">
            <div className="landing-split">
              <motion.div
                className="landing-split-media"
                initial={{ opacity: 0, scale: 0.96 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55, ease }}
              >
                <div className="landing-image-frame">
                  <Image
                    src={SECTION_IMAGE_JOURNEY}
                    alt="מזון טבעי ומאוזן"
                    fill
                    sizes="(max-width: 768px) 100vw, 45vw"
                    className="object-cover"
                  />
                  <div className="landing-image-badge">
                    <Sparkles className="w-4 h-4" aria-hidden />
                    מסע מותאם אישית
                  </div>
                </div>
              </motion.div>

              <motion.div
                className="landing-split-body"
                initial={{ opacity: 0, x: 24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, ease }}
              >
                <SectionEyebrow>המסע שלכם</SectionEyebrow>
                <h2 id="journey-heading" className="landing-h2">
                  מסע שלם — <span className="landing-text-gradient">לא רק משקל</span>
                </h2>
                <p className="landing-body">
                  תזונה, תנועה, שינה והרגלים — מסלול שמתקדם איתכם בקצב שלכם.
                  רואים איפה עמדתם, מה הצעד הבא, וחוגגים כל שינוי קטן בדרך.
                </p>
                <ul className="landing-checklist">
                  {['תחנות ושלבים מסודרים', 'משימות יומיות חכמות', 'מעקב בלי מספרים מעיקים'].map(
                    (t) => (
                      <li key={t}>
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" aria-hidden />
                        {t}
                      </li>
                    ),
                  )}
                </ul>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ─── יכולות ─── */}
        <section className="landing-section landing-section-white landing-section-glow" aria-labelledby="features-heading">
          <div className="landing-section-orbs" aria-hidden>
            <span className="landing-section-orb landing-section-orb-teal" />
            <span className="landing-section-orb landing-section-orb-rose" />
          </div>
          <div className="landing-wrap">
            <div className="landing-section-head landing-section-head-center">
              <SectionEyebrow>מה מקבלים</SectionEyebrow>
              <SectionTitle
                id="features-heading"
                title="מערכת שלמה לאורח חיים בריא"
                subtitle="תזונה, תנועה, שינה, הרגלים ומנטור AI — הכל במקום אחד, בעברית, בקצב שלכם."
              />
            </div>

            <div className="landing-bento">
              <motion.article
                className="landing-bento-featured landing-card-glass-gradient"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, ease }}
              >
                <span className="landing-bento-icon landing-bento-icon-lg landing-tone-emerald">
                  <Sparkles aria-hidden />
                </span>
                <h3 className="landing-card-title text-lg">אלמוג — מנטור AI אישי</h3>
                <p className="landing-card-text">
                  לומד את הקצב, המטרות והאתגרים שלכם. עידוד, הכוונה ותגובות בזמן אמת — כשזה
                  באמת רלוונטי.
                </p>
                <span className="landing-bento-shine" aria-hidden />
              </motion.article>

              {[
                { icon: BookOpen, title: 'קורסים ושיעורים', text: 'וידאו, אודיו וטקסט מקצועי בעברית.', tone: 'teal' },
                { icon: Sun, title: 'הרגלים יומיים', text: 'בניית שגרה בריאה בצעדים קטנים.', tone: 'amber' },
                { icon: Bell, title: 'תזכורות חכמות', text: 'מגעים עדינים לפני הרגעים הקשים.', tone: 'rose' },
                { icon: Route, title: 'מסע מובנה', text: 'תחנות, שלבים ומשימות שמתקדמים איתכם.', tone: 'orange' },
              ].map((f, i) => (
                <motion.article
                  key={f.title}
                  className="landing-card landing-card-elevated landing-bento-item"
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.05 + i * 0.06, duration: 0.4, ease }}
                >
                  <span className={`landing-bento-icon landing-tone-${f.tone}`}>
                    <f.icon aria-hidden />
                  </span>
                  <h3 className="landing-card-title">{f.title}</h3>
                  <p className="landing-card-text">{f.text}</p>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        {/* ─── תדמיינו את עצמכם — Future Self ─── */}
        <section className="landing-section landing-imagine landing-fade-top" aria-labelledby="imagine-heading">
          <FloatingParticles count={20} />
          <div className="landing-wrap">
            <div className="landing-section-head landing-section-head-center">
              <SectionEyebrow>החיים שלכם בעוד 30 יום</SectionEyebrow>
              <SectionTitle
                id="imagine-heading"
                title="תדמיינו את עצמכם..."
                subtitle="כי השינוי האמיתי הוא איך אתם מרגישים — לא מה אומר המאזניים."
                light
              />
            </div>

            <div className="landing-imagine-grid">
              {[
                {
                  icon: Sunrise,
                  text: 'מתעוררים בבוקר עם אנרגיה',
                  highlight: 'בלי לחשוב על "מה אסור לי היום"',
                },
                {
                  icon: Coffee,
                  text: 'יושבים לארוחה משפחתית',
                  highlight: 'ונהנים מכל ביס — בלי טיפת אשמה',
                },
                {
                  icon: Brain,
                  text: 'מקשיבים לגוף שלכם',
                  highlight: 'יודעים מתי רעבים, מתי שבעים, מתי באמת מתחשק',
                },
                {
                  icon: Smile,
                  text: 'מסתכלים במראה',
                  highlight: 'ורואים מישהו שטוב לו עם עצמו',
                },
                {
                  icon: Activity,
                  text: 'מתנועעים בכיף',
                  highlight: 'לא "אימון חובה" — תנועה שמרגישה טוב',
                },
                {
                  icon: BedDouble,
                  text: 'נרדמים בשקט',
                  highlight: 'שינה איכותית — חלק מאורח החיים, לא בונוס',
                },
              ].map((item, i) => (
                <motion.article
                  key={item.text}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ delay: i * 0.08, duration: 0.5, ease }}
                  className="landing-imagine-card"
                >
                  <span className="landing-imagine-icon">
                    <item.icon aria-hidden />
                  </span>
                  <p className="landing-imagine-text">{item.text}</p>
                  <p className="landing-imagine-highlight">{item.highlight}</p>
                </motion.article>
              ))}
            </div>

            <motion.p
              className="landing-imagine-quote"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4, duration: 0.5 }}
            >
              זה לא חלום. זה מה שקורה כשמפסיקים להילחם בגוף — ומתחילים להקשיב לו.
            </motion.p>
          </div>
        </section>

        {/* ─── אפקט ההצטברות — Timeline WOW ─── */}
        <section className="landing-section landing-timeline landing-fade-bottom" aria-labelledby="timeline-heading">
          <FloatingParticles count={18} />
          <div className="landing-timeline-glow" aria-hidden />
          <div className="landing-wrap">
            <div className="landing-section-head landing-section-head-center">
              <SectionEyebrow light>הרגלים מצטברים</SectionEyebrow>
              <SectionTitle
                id="timeline-heading"
                title="הרגל קטן היום — אורח חיים מחר"
                subtitle="לא צריך לשנות הכל בבת אחת. כל יום מוסיף שכבה — עד שהחיים שלכם פשוט נראים אחרת."
                light
              />
            </div>

            <ol className="landing-timeline-track">
              {[
                {
                  day: 'יום 1',
                  icon: PlayCircle,
                  title: 'הצעד הראשון',
                  text: 'הרשמה, שיחה עם דולב, והבנה שזה לא דיאטה — זה התחלה חדשה.',
                  tone: 'emerald',
                },
                {
                  day: 'יום 7',
                  icon: Leaf,
                  title: 'הרגל ראשון נדבק',
                  text: 'משימה יומית קטנה שהופכת לשגרה — בלי מאמץ, בלי לחץ.',
                  tone: 'teal',
                },
                {
                  day: 'יום 30',
                  icon: Brain,
                  title: 'הראש משתנה',
                  text: 'פחות אשמה, יותר בחירה. היחס לאוכל, לשינה ולתנועה — אחר.',
                  tone: 'amber',
                },
                {
                  day: 'יום 90',
                  icon: Zap,
                  title: 'הגוף מגיב',
                  text: 'יותר אנרגיה, שינה טובה יותר, תחושה אחרת — לא רק מספר על המשקל.',
                  tone: 'orange',
                },
                {
                  day: 'יום 365',
                  icon: Star,
                  title: 'זה מי שאתם',
                  text: 'אורח חיים, לא פרויקט. אתם לא "בדיאטה" — אתם פשוט חיים אחרת.',
                  tone: 'rose',
                },
              ].map((step, i) => (
                <motion.li
                  key={step.day}
                  initial={{ opacity: 0, y: 30, scale: 0.92 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, margin: '-30px' }}
                  transition={{ delay: i * 0.12, duration: 0.55, ease }}
                  whileHover={{ y: -6, scale: 1.04 }}
                  className={`landing-timeline-step landing-tone-${step.tone}`}
                >
                  <span className="landing-timeline-day">{step.day}</span>
                  <span className="landing-timeline-icon">
                    <step.icon aria-hidden />
                  </span>
                  <h3 className="landing-timeline-title">{step.title}</h3>
                  <p className="landing-timeline-text">{step.text}</p>
                </motion.li>
              ))}
            </ol>

            <motion.p
              className="landing-timeline-quote"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5, duration: 0.5 }}
            >
              <InfinityIcon className="w-5 h-5 shrink-0" aria-hidden />
              1% טוב יותר כל יום = <strong>37×</strong> שינוי בשנה. זה המתמטיקה של אורח חיים.
            </motion.p>
          </div>
        </section>

        {/* ─── אורח חיים + תמונה ─── */}
        <section className="landing-section landing-section-muted" aria-labelledby="lifestyle-heading">
          <div className="landing-wrap">
            <div className="landing-split landing-split-reverse">
              <motion.div
                className="landing-split-body"
                initial={{ opacity: 0, x: -24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, ease }}
              >
                <SectionEyebrow>תנועה ואנרגיה</SectionEyebrow>
                <h2 id="lifestyle-heading" className="landing-h2">
                  להרגיש טוב — <span className="landing-text-gradient">לא רק להיראות טוב</span>
                </h2>
                <p className="landing-body">
                  לא רק מה שבצלחת — גם איך ישנים, מתנועעים ומרגישים. קורסים ומשימות שמחברים
                  תזונה, תנועה, שינה ואנרגיה לאורח חיים אחד — בלי לחץ ובלי אשמה.
                </p>
                <ul className="landing-checklist">
                  {['אנרגיה לאורך כל היום', 'שינה איכותית באמת', 'תנועה בכיף, לא כעונש', 'יחס בריא לאוכל'].map((t) => (
                    <li key={t}>
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" aria-hidden />
                      {t}
                    </li>
                  ))}
                </ul>
              </motion.div>

              <motion.div
                className="landing-split-media"
                initial={{ opacity: 0, scale: 0.96 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55, ease }}
              >
                <div className="landing-image-frame">
                  <Image
                    src={SECTION_IMAGE_LIFESTYLE}
                    alt="תנועה ואורח חיים פעיל"
                    fill
                    sizes="(max-width: 768px) 100vw, 45vw"
                    className="object-cover"
                  />
                  <div className="landing-image-badge landing-image-badge-warm">
                    <Flame className="w-4 h-4" aria-hidden />
                    אנרגיה לכל היום
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ─── מנטורים ─── */}
        <section className="landing-section landing-section-dark landing-fade-top landing-fade-bottom" aria-labelledby="mentors-heading">
          <FloatingParticles count={16} />
          <div className="landing-wrap">
            <div className="landing-section-head landing-section-head-center">
              <SectionEyebrow>הצוות שלכם</SectionEyebrow>
              <SectionTitle
                id="mentors-heading"
                title="לא לבד במסע"
                subtitle="ליווי אישי מהרגע הראשון — לא אפליקציה קרה."
                light
              />
            </div>

            <div className="landing-mentors">
              <motion.div
                className="landing-card landing-card-glass-dark"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, ease }}
              >
                <MentorBubble mentorId="dolev" theme="dark">
                  <p>
                    אני <strong className="text-emerald-300">דולב</strong> — מקבל אתכם בהרשמה,
                    שואל רק מה שחשוב, ומעביר אתכם לאלמוג כשמוכנים להתחיל.
                  </p>
                </MentorBubble>
              </motion.div>

              <motion.div
                className="landing-card landing-card-glass-dark"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1, duration: 0.45, ease }}
              >
                <MentorBubble mentorId="almog" theme="dark">
                  <p>
                    אני <strong className="text-emerald-300">אלמוג</strong> — המנטור שלכם בקורסים,
                    משימות והרגלים. לומד את הקצב ונותן עידוד כשצריך.
                  </p>
                </MentorBubble>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ─── איך מתחילים ─── */}
        <section className="landing-section landing-section-white landing-section-glow" aria-labelledby="steps-heading">
          <div className="landing-section-orbs" aria-hidden>
            <span className="landing-section-orb landing-section-orb-emerald" />
          </div>
          <div className="landing-wrap">
            <motion.div className="landing-section-head landing-section-head-center">
              <SectionEyebrow>פשוט להתחיל</SectionEyebrow>
              <SectionTitle id="steps-heading" title="שלושה צעדים — ואתם בפנים" />
            </motion.div>

            <ol className="landing-steps">
              {[
                {
                  n: '01',
                  title: 'הרשמה קצרה',
                  text: 'דולב מכיר אתכם — שאלון זריז, בלי שיפוט.',
                  tone: 'emerald',
                },
                {
                  n: '02',
                  title: 'מסע מותאם',
                  text: 'קורסים, שלבים והרגלים סביב החיים שלכם.',
                  tone: 'teal',
                },
                {
                  n: '03',
                  title: 'ליווי יומיומי',
                  text: 'אלמוג לצדכם — משימות, עידוד והכוונה.',
                  tone: 'amber',
                },
              ].map((step, i) => (
                <motion.li
                  key={step.n}
                  className={`landing-step landing-tone-${step.tone}`}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.45, ease }}
                >
                  <span className="landing-step-num">{step.n}</span>
                  <h3 className="landing-card-title">{step.title}</h3>
                  <p className="landing-card-text">{step.text}</p>
                </motion.li>
              ))}
            </ol>
          </div>
        </section>

        {/* ─── FAQ - טיפול בהתנגדויות ─── */}
        <section className="landing-section landing-section-soft" aria-labelledby="faq-heading">
          <div className="landing-wrap landing-faq-wrap">
            <div className="landing-section-head landing-section-head-center">
              <SectionEyebrow>שאלות שמטרידות אתכם</SectionEyebrow>
              <SectionTitle
                id="faq-heading"
                title="הכל מה שאתם רוצים לדעת"
                subtitle="לפני שמתחילים — בואו נסיר את הספקות."
              />
            </div>

            <div className="landing-faq-list">
              {[
                {
                  q: 'רגע, זאת בעצם דיאטה?',
                  a: 'לא. בכלל לא. אין תפריט, אין מאכלים אסורים, ואין רשימה של מה לאכול. NuraWell מלמד אתכם להבין את הגוף שלכם — כדי שתבחרו לבד.',
                },
                {
                  q: 'אצטרך לספור קלוריות או לשקול אוכל?',
                  a: 'לעולם לא. אנחנו לא מאמינים שספירה היא הדרך. בריאות אמיתית מתחילה מהראש — לא מהאקסל.',
                },
                {
                  q: 'מה אם אני "נופל" ואוכל משהו לא בריא?',
                  a: 'אין נפילות פה. אין "בריא" ו"לא בריא" במובן השיפוטי. כל ארוחה היא הזדמנות, לא מבחן. ואלמוג ידע להעיף לכם חיוך — לא תוכחה.',
                },
                {
                  q: 'כמה זמן ביום זה דורש?',
                  a: 'בין 5 ל-10 דקות. משימה קצרה, שיעור קצר, או שיחה עם אלמוג. נכנס בקלות לסדר היום — לא הופך לעוד מטלה.',
                },
                {
                  q: 'אני כבר ניסיתי הכל. למה זה יעבוד?',
                  a: 'כי כל מה שניסיתם היה דיאטה. ופה אין דיאטה. אנחנו עובדים על הראש, על ההרגלים, ועל היחס לאוכל — לא על הצלחת.',
                },
                {
                  q: 'באמת חינם? איפה ה"בלאגן"?',
                  a: 'בלי לכודים. נרשמים, מקבלים את המסע, את הקורסים ואת אלמוג. אין כרטיס אשראי, אין התחייבות, ואפשר לעזוב בכל רגע.',
                },
              ].map((item, i) => (
                <motion.details
                  key={item.q}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-30px' }}
                  transition={{ delay: i * 0.04, duration: 0.35, ease }}
                  className="landing-faq-item"
                >
                  <summary className="landing-faq-q">
                    <span className="landing-faq-icon">
                      <HelpCircle aria-hidden />
                    </span>
                    <span className="landing-faq-q-text">{item.q}</span>
                    <span className="landing-faq-chev" aria-hidden>
                      <ChevronLeft className="w-5 h-5" />
                    </span>
                  </summary>
                  <p className="landing-faq-a">{item.a}</p>
                </motion.details>
              ))}
            </div>
          </div>
        </section>

        {/* ─── CTA ─── */}
        <section className="landing-section landing-cta-band landing-fade-top" aria-label="הצטרפות">
          <FloatingParticles count={24} />
          <div className="landing-cta-orbs" aria-hidden>
            <span className="landing-cta-orb landing-cta-orb-1" />
            <span className="landing-cta-orb landing-cta-orb-2" />
            <span className="landing-cta-orb landing-cta-orb-3" />
          </div>
          <div className="landing-wrap landing-cta-inner">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, ease }}
            >
              <span className="landing-cta-badge">
                <Sparkles className="w-4 h-4" aria-hidden />
                חינם להתחיל — בלי כרטיס אשראי
              </span>
              <h2 className="landing-cta-title">
                אל תחכו ליום שני הבא. <br className="hidden sm:block" />
                <span className="landing-cta-title-accent">תתחילו עכשיו.</span>
              </h2>
              <p className="landing-cta-text">
                60 שניות להירשם. גישה מלאה למסע, לקורסים ולמנטור AI שלכם.
                <strong className="block mt-2 text-white">בלי דיאטה. בלי איסורים. בלי שיפוטיות.</strong>
              </p>
              <div className="landing-cta-actions">
                <Link href="/register" className="landing-btn-primary landing-btn-primary-lg">
                  <Heart className="w-5 h-5" aria-hidden />
                  בואו נתחיל — חינם
                </Link>
                <Link href="/login" className="landing-btn-outline">
                  כניסה לחשבון קיים
                  <ArrowLeft className="w-4 h-4" aria-hidden />
                </Link>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <p>© {new Date().getFullYear()} NuraWell — הדרך החכמה לחיים בריאים</p>
      </footer>
    </div>
  );
}
