'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  Heart,
  Route,
  Sparkles,
  Sun,
  Users,
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

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="landing-eyebrow">{children}</span>
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
  return (
    <div className="landing-page" dir="rtl">
      {/* ─── HERO ─── */}
      <section className="landing-hero" aria-label="ראש העמוד">
        <motion.div className="landing-hero-media" aria-hidden>
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
        >
          <p className="landing-hero-kicker">
            <Sparkles className="w-4 h-4" aria-hidden />
            NuraWell — ליווי אישי לחיים בריאים
          </p>

          <h1 className="landing-hero-title">
            <span className="landing-hero-title-accent">הדרך החכמה</span>
            <span className="landing-hero-title-main">לחיים בריאים</span>
          </h1>

          <p className="landing-hero-lead">
            מסע מובנה, קורסים מקצועיים ומנטור AI שמכיר אתכם —
            <strong> בלי דיאטה, בלי ספירת קלוריות, בלי הרעבה.</strong>
          </p>

          <div className="landing-hero-cta">
            <Link href="/register" className="landing-btn-primary">
              התחילו את המסע — חינם
              <ChevronLeft className="w-5 h-5" aria-hidden />
            </Link>
            <Link href="/login" className="landing-btn-ghost">
              כבר יש לי חשבון
            </Link>
          </div>

          <ul className="landing-hero-pills" aria-label="הבטחות">
            {['בלי דיאטה', 'בלי ספירת קלוריות', 'בלי הרעבה'].map((label) => (
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
        {/* ─── פילוסופיה ─── */}
        <section className="landing-section landing-section-white" aria-labelledby="philosophy-heading">
          <div className="landing-wrap">
            <div className="landing-section-head">
              <SectionEyebrow>למה אנחנו שונים</SectionEyebrow>
              <SectionTitle
                id="philosophy-heading"
                title="לא עוד אפליקציית דיאטה"
                subtitle="המטרה היא אורח חיים שאפשר לחיות איתו שנים — לא מספר על המשקל שמכתיב את היום."
              />
            </div>

            <div className="landing-philosophy-grid">
              {[
                {
                  title: 'אוכלים בטעם',
                  text: 'בלי מספרים, בלי אשמה. לומדים לבחור טוב — לא לספור כל ביס.',
                },
                {
                  title: 'בונים הרגלים',
                  text: 'צעדים קטנים שמתחברים לשגרה. משימות יומיות עם עידוד, לא עונש.',
                },
                {
                  title: 'מלווים באמת',
                  text: 'דולב בקליטה, אלמוג במסע — AI שמדבר אליכם, לא אלגוריתם קר.',
                },
              ].map((item, i) => (
                <motion.article
                  key={item.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ delay: i * 0.08, duration: 0.45, ease }}
                  className="landing-card landing-card-elevated"
                >
                  <h3 className="landing-card-title">{item.title}</h3>
                  <p className="landing-card-text">{item.text}</p>
                </motion.article>
              ))}
            </div>
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
                  שלבים, תחנות והתקדמות אמיתית
                </h2>
                <p className="landing-body">
                  מסלול מובנה שמתקדם איתכם — לא רשימת מטלות. רואים איפה עמדתם, מה הצעד הבא,
                  וחוגגים כל הישג בדרך.
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
        <section className="landing-section landing-section-white" aria-labelledby="features-heading">
          <div className="landing-wrap">
            <div className="landing-section-head landing-section-head-center">
              <SectionEyebrow>מה מקבלים</SectionEyebrow>
              <SectionTitle
                id="features-heading"
                title="מערכת שלמה, מעוצבת לחיים"
                subtitle="כל מה שצריך — באפליקציה אחת, בעברית, בקצב שלכם."
              />
            </div>

            <div className="landing-bento">
              <motion.article
                className="landing-bento-featured landing-card-glass"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, ease }}
              >
                <span className="landing-bento-icon landing-bento-icon-lg">
                  <Sparkles aria-hidden />
                </span>
                <h3 className="landing-card-title text-lg">אלמוג — מנטור AI אישי</h3>
                <p className="landing-card-text">
                  לומד את הקצב, המטרות והאתגרים שלכם. עידוד, הכוונה ותגובות בזמן אמת — כשזה
                  באמת רלוונטי.
                </p>
              </motion.article>

              {[
                { icon: BookOpen, title: 'קורסים ושיעורים', text: 'וידאו, אודיו וטקסט מקצועי בעברית.' },
                { icon: Sun, title: 'הרגלים יומיים', text: 'בניית שגרה בריאה בצעדים קטנים.' },
                { icon: Bell, title: 'תזכורות חכמות', text: 'מגעים עדינים לפני הרגעים הקשים.' },
                { icon: Route, title: 'מסע מובנה', text: 'תחנות, שלבים ומשימות שמתקדמים איתכם.' },
              ].map((f, i) => (
                <motion.article
                  key={f.title}
                  className="landing-card landing-card-elevated landing-bento-item"
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.05 + i * 0.06, duration: 0.4, ease }}
                >
                  <span className="landing-bento-icon">
                    <f.icon aria-hidden />
                  </span>
                  <h3 className="landing-card-title">{f.title}</h3>
                  <p className="landing-card-text">{f.text}</p>
                </motion.article>
              ))}
            </div>
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
                  להרגיש טוב — לא רק להיראות טוב
                </h2>
                <p className="landing-body">
                  שינוי שמתחיל מהראש ומהלב. קורסים, תוכן ומשימות שמחברים בין גוף, תזונה
                  ושגרה — בלי לחץ ובלי אשמה.
                </p>
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
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ─── מנטורים ─── */}
        <section className="landing-section landing-section-dark" aria-labelledby="mentors-heading">
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
        <section className="landing-section landing-section-white" aria-labelledby="steps-heading">
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
                },
                {
                  n: '02',
                  title: 'מסע מותאם',
                  text: 'קורסים, שלבים והרגלים סביב החיים שלכם.',
                },
                {
                  n: '03',
                  title: 'ליווי יומיומי',
                  text: 'אלמוג לצדכם — משימות, עידוד והכוונה.',
                },
              ].map((step, i) => (
                <motion.li
                  key={step.n}
                  className="landing-step"
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

        {/* ─── CTA ─── */}
        <section className="landing-section landing-cta-band" aria-label="הצטרפות">
          <div className="landing-wrap landing-cta-inner">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, ease }}
            >
              <Users className="w-10 h-10 text-emerald-200 mx-auto mb-4" aria-hidden />
              <h2 className="landing-cta-title">מוכנים להרגיש טוב בגוף ובנפש?</h2>
              <p className="landing-cta-text">
                הצטרפו עכשיו — גישה למסע, לקורסים ולמנטור AI. בלי התחייבות, בלי דיאטה.
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
