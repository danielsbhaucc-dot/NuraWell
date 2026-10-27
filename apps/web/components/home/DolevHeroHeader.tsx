'use client';
import { ChevronLeft, ListChecks } from 'lucide-react';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { useAlmogAvatarUrl } from '../../lib/client/useAlmogAvatarUrl';
import { ALMOG_AVATAR_FALLBACK } from '../../lib/ai/almog-avatar';
import { dispatchOpenAlmogChatWithPrefill, dispatchOpenAlmogChatWithTaskReport } from '../../lib/notifications/open-almog-chat';
import type { TaskReportHint } from '../../lib/ai/task-report-hint';
import { usePersonalGreeting } from '../../lib/time/usePersonalGreeting';

interface AlmogHeroHeaderProps {
  firstName: string;
  bubbleContent: ReactNode;
  /** כותרת משנה דינמית מתחת ל"אלמוג" */
  mentorTag?: string;
  /** CTA לצ'אט מתוך הבועה */
  chatCta?: { label: string; prefill: string; hint?: TaskReportHint };
  /** פס התקדמות יומי */
  taskProgress?: { done: number; total: number };
  /** סטטוס משימות פתוחות לתצוגה צבעונית מתחת לברכה ("יש לך X משימות לביצוע"). */
  taskBadge?: {
    /** כמה משימות פתוחות שלא בוצעו עדיין היום */
    pending: number;
    /** כמה משימות סומנו כבוצעו היום */
    done: number;
    /** סה"כ משימות שהמשתמש לקח על עצמו */
    accepted: number;
    /** כמה משימות פעילות להיום */
    dueToday?: number;
    /** תצוגה מקדימה של משימה ראשונה פתוחה */
    previewTitle?: string | null;
    /** תווית זמן חכמה — למשל "עכשיו · בוקר" */
    previewHint?: string | null;
    previewEmoji?: string | null;
    /** האם הנתונים עוד בטעינה */
    loading?: boolean;
  };
  /** האם תוכן הבועה עדיין בטעינה */
  contentLoading?: boolean;
  onTaskBadgeClick?: () => void;
}

/** שלד טעינה רך — בלי תחושת בוט */
function BubbleLoadingSkeleton() {
  return (
    <div className="space-y-2.5" aria-busy="true" aria-label="טוען את המשימות שלך">
      <div
        className="h-3.5 rounded-full animate-pulse"
        style={{ width: '88%', background: 'rgba(255,255,255,0.22)' }}
      />
      <div
        className="h-3.5 rounded-full animate-pulse"
        style={{ width: '62%', background: 'rgba(255,255,255,0.16)', animationDelay: '120ms' }}
      />
    </div>
  );
}

/** כותרת בית עם אלמוג — שיקוף ברכה אישית + סטטוס משימות היום. */
export function AlmogHeroHeader({
  firstName,
  bubbleContent,
  mentorTag,
  chatCta,
  taskProgress,
  taskBadge,
  contentLoading = false,
  onTaskBadgeClick,
}: AlmogHeroHeaderProps) {
  const { avatarUrl } = useAlmogAvatarUrl();
  const greeting = usePersonalGreeting();

  /** ברירת מחדל אם לא מועבר מבחוץ — לא מציגים שורת משימות */
  const showTaskBadge = !!taskBadge && !taskBadge.loading;

  return (
    <>
      <GreetingOptions
        title={`${greeting.timeGreeting} ${firstName}`.trim()}
        occasion={greeting.occasionGreeting}
        badge={showTaskBadge ? taskBadge! : null}
        onOpen={onTaskBadgeClick}
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="pb-1"
      >
        <div className="flex items-start gap-2.5" dir="rtl">
          <button
            type="button"
            className="relative z-10 shrink-0"
            style={{ marginTop: '2px' }}
            onClick={() => window.dispatchEvent(new Event('open-almog-chat'))}
            aria-label="פתח צ׳אט עם אלמוג"
          >
            <motion.div
              className="absolute rounded-full"
              style={{
                inset: '-6px',
                background: 'conic-gradient(from 0deg, #14b8a6, #10b981, #f59e0b, #10b981, #14b8a6)',
                filter: 'blur(12px)',
                opacity: 0.5,
                zIndex: -1,
              }}
            />
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'conic-gradient(from 0deg, #14b8a6 0%, #10b981 30%, #f59e0b 55%, #10b981 75%, #14b8a6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(16,185,129,0.22)',
              }}
            >
              <div
                style={{
                  width: '58px',
                  height: '58px',
                  borderRadius: '50%',
                  background: 'rgba(242,242,246,0.95)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '2px',
                  overflow: 'hidden',
                }}
              >
                <img
                  src={avatarUrl}
                  alt="אלמוג"
                  style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = ALMOG_AVATAR_FALLBACK;
                  }}
                />
              </div>
            </div>
            {!contentLoading ? (
              <div
                style={{
                  position: 'absolute',
                  bottom: '0',
                  right: '2px',
                  background: '#14b8a6',
                  border: '2px solid rgba(242,242,246,0.95)',
                  borderRadius: '20px',
                  padding: '3px 7px',
                  display: 'flex',
                  gap: '2px',
                  alignItems: 'center',
                  boxShadow: '0 2px 8px rgba(20,184,166,0.4)',
                }}
              >
                <span style={{ width: '3px', height: '3px', background: 'rgba(242,242,246,0.95)', borderRadius: '50%', display: 'inline-block' }} />
                <span style={{ width: '3px', height: '3px', background: 'rgba(242,242,246,0.95)', borderRadius: '50%', display: 'inline-block' }} />
                <span style={{ width: '3px', height: '3px', background: 'rgba(242,242,246,0.95)', borderRadius: '50%', display: 'inline-block' }} />
              </div>
            ) : null}
          </button>

          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.35, ease: [0.34, 1.56, 0.64, 1] as const }}
            className="min-w-0 flex-1"
            style={{
              padding: '11px 14px',
              background:
                'var(--hero-inner)' /* solid: separated from the hero band */,
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '6px 18px 18px 18px',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.28), 0 4px 20px rgba(0,0,0,0.1)',
              isolation: 'isolate',
            }}
          >
            <div
              style={{
                fontSize: '10px',
                color: '#cfd0d6',
                fontWeight: 700,
                letterSpacing: '0.5px',
                marginBottom: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>אלמוג · המנטור שלך</span>
              {mentorTag && !contentLoading ? (
                <span
                  style={{
                    fontSize: '9px',
                    fontWeight: 800,
                    color: 'rgba(242,242,246,0.88)',
                    background: 'rgba(255,255,255,0.14)',
                    border: '1px solid rgba(255,255,255,0.22)',
                    borderRadius: '999px',
                    padding: '2px 7px',
                  }}
                >
                  {mentorTag}
                </span>
              ) : null}
            </div>
            <div
              style={{
                fontSize: '14px',
                color: 'rgba(242,242,246,0.92)',
                lineHeight: 1.55,
                fontWeight: 400,
                fontFamily: "'Heebo',sans-serif",
              }}
            >
              {contentLoading ? <BubbleLoadingSkeleton /> : bubbleContent}
            </div>
          </motion.div>
        </div>

        {taskProgress && taskProgress.total > 0 ? (
          <div className="mt-2.5">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '9px',
                fontWeight: 700,
                color: 'rgba(242,242,246,0.72)',
                marginBottom: '4px',
              }}
            >
              <span>
                {taskProgress.done}/{taskProgress.total}
              </span>
              <span>היום</span>
            </div>
            <div
              style={{
                height: '5px',
                borderRadius: '999px',
                background: 'rgba(255,255,255,0.16)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, Math.round((taskProgress.done / taskProgress.total) * 100))}%`,
                  borderRadius: '999px',
                  background: 'linear-gradient(90deg, #FFD97D, #FBBF24)',
                  boxShadow: '0 0 8px rgba(251,191,36,0.45)',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
          </div>
        ) : null}
        {chatCta && !contentLoading ? (
          <button
            type="button"
            onClick={() => {
              if (chatCta.hint) {
                dispatchOpenAlmogChatWithTaskReport(chatCta.prefill, chatCta.hint);
              } else {
                dispatchOpenAlmogChatWithPrefill(chatCta.prefill);
              }
            }}
            style={{
              marginTop: taskProgress && taskProgress.total > 0 ? '10px' : '12px',
              marginBottom: '6px',
              width: '100%',
              border: '1px solid rgba(255,217,125,0.45)',
              background: 'rgba(255,217,125,0.16)',
              borderRadius: '12px',
              padding: '7px 10px',
              fontSize: '11px',
              fontWeight: 800,
              color: '#FFD97D',
              fontFamily: "'Rubik','Heebo',sans-serif",
              cursor: 'pointer',
            }}
          >
            {chatCta.label}
          </button>
        ) : null}
      </motion.div>
    </>
  );
}

/** @deprecated השתמש ב-AlmogHeroHeader */
export const DolevHeroHeader = AlmogHeroHeader;

/**
 * שורת "יש לך X משימות לביצוע" מעוצבת — מופיעה רק כשיש משימות פתוחות בפועל.
 * מצב 1 — כל המשימות בוצעו: ירוק חזק "סגרת הכל היום "
 * מצב 2 — יש משימות פתוחות: כתום-זהב "יש לך X משימות לביצוע היום"
 * מצב 3 — אין משימות מקובלות: ענן רך "המסע מחכה לך"
 */
function TaskBadgeRow({
  pending,
  done,
  accepted,
  dueToday = 0,
  previewTitle,
  previewHint,
  previewEmoji,
  onClick,
}: {
  pending: number;
  done: number;
  accepted: number;
  dueToday?: number;
  previewTitle?: string | null;
  previewHint?: string | null;
  previewEmoji?: string | null;
  onClick?: () => void;
}) {
  const Wrapper = onClick ? 'button' : 'div';
  const wrapperProps = onClick
    ? {
        type: 'button' as const,
        onClick,
        className: 'w-full text-start',
        'aria-label': 'פתח רשימת משימות היום',
      }
    : {};

  if (accepted === 0) {
    return (
      <Wrapper
        {...wrapperProps}
        style={{
          marginTop: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '7px 10px',
          borderRadius: '12px',
          background: 'var(--color-forest-700)',
          border: '1px solid rgba(207,208,214,0.4)',
          fontFamily: "'Rubik','Heebo',sans-serif",
        }}
      >
        <span style={{ fontSize: '14px' }} aria-hidden>
          ✿
        </span>
        <span
          style={{
            fontSize: '12px',
            fontWeight: 700,
            color: '#f2f2f6',
            letterSpacing: '0.2px',
            flex: 1,
          }}
        >
          המסע שלך מחכה, בלחיצה אתה שם
        </span>
        {onClick ? (
          <span style={{ fontSize: '10px', color: 'rgba(242,242,246,0.7)', fontWeight: 700 }}>
            פתיחה ›
          </span>
        ) : null}
      </Wrapper>
    );
  }
  if (pending === 0) {
    return (
      <Wrapper
        {...wrapperProps}
        style={{
          marginTop: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '7px 10px',
          borderRadius: '12px',
          background:
            'linear-gradient(135deg, rgba(16,185,129,0.85), rgba(52,211,153,0.7))',
          border: '1px solid rgba(255,255,255,0.4)',
          boxShadow: '0 2px 10px rgba(4,120,87,0.25)',
          fontFamily: "'Rubik','Heebo',sans-serif",
        }}
      >
        <span style={{ fontSize: '14px' }} aria-hidden>
          ✓
        </span>
        <span
          style={{
            fontSize: '12px',
            fontWeight: 800,
            color: '#f2f2f6',
            letterSpacing: '0.2px',
            flex: 1,
          }}
        >
          סגרת היום הכל, {done} מתוך {dueToday || accepted}
        </span>
        {onClick ? (
          <span style={{ fontSize: '10px', color: 'rgba(242,242,246,0.85)', fontWeight: 700 }}>
            פירוט ›
          </span>
        ) : null}
      </Wrapper>
    );
  }
  return (
    <Wrapper
      {...wrapperProps}
      style={{
        marginTop: '8px',
        display: 'flex',
        alignItems: 'stretch',
        gap: '8px',
        padding: '8px 10px',
        borderRadius: '12px',
        background:
          'linear-gradient(135deg, rgba(245,158,11,0.42), rgba(251,191,36,0.32))',
        border: '1px solid rgba(253,224,71,0.55)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
        fontFamily: "'Rubik','Heebo',sans-serif",
      }}
    >
      <span style={{ fontSize: '14px', alignSelf: 'center' }} aria-hidden>
        ⚡
      </span>
      <span
        style={{
          fontSize: '12px',
          fontWeight: 800,
          color: '#f2f2f6',
          letterSpacing: '0.2px',
          flex: 1,
          lineHeight: 1.35,
          minWidth: 0,
        }}
      >
        {done > 0 && dueToday > 0 ? (
          <>
            {done}/{dueToday} בוצעו · עוד{' '}
            <span style={{ color: '#f2f2f6', fontWeight: 900, fontSize: '14px' }}>{pending}</span>
          </>
        ) : (
          <>
            יש לך{' '}
            <span style={{ color: '#f2f2f6', fontWeight: 900, fontSize: '14px' }}>{pending}</span>{' '}
            {pending === 1 ? 'משימה' : 'משימות'} לביצוע היום
          </>
        )}
        {previewTitle ? (
          <span
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '6px',
              marginTop: '6px',
              padding: '6px 8px',
              borderRadius: '10px',
              background: 'rgba(255,255,255,0.14)',
              border: '1px solid rgba(255,255,255,0.22)',
            }}
          >
            {previewEmoji ? (
              <span style={{ fontSize: '14px', flexShrink: 0 }} aria-hidden>
                {previewEmoji}
              </span>
            ) : null}
            <span style={{ minWidth: 0, flex: 1 }}>
              <span
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#f2f2f6',
                  lineHeight: 1.35,
                  wordBreak: 'break-word',
                }}
              >
                {previewTitle}
              </span>
              {previewHint ? (
                <span
                  style={{
                    display: 'inline-block',
                    marginTop: '2px',
                    fontSize: '9px',
                    fontWeight: 700,
                    color: 'rgba(242,242,246,0.82)',
                    background: 'rgba(0,0,0,0.12)',
                    borderRadius: '999px',
                    padding: '1px 7px',
                  }}
                >
                  {previewHint}
                </span>
              ) : null}
            </span>
          </span>
        ) : null}
      </span>
      {onClick ? (
        <span
          style={{
            alignSelf: 'center',
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '28px',
            borderRadius: '999px',
            background: 'rgba(255,255,255,0.2)',
            border: '1px solid rgba(255,255,255,0.35)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)',
            fontSize: '14px',
            color: '#f2f2f6',
            fontWeight: 900,
          }}
          aria-hidden
        >
          ‹
        </span>
      ) : null}
    </Wrapper>
  );
}


/**
 * Home greeting — 3 structural options for owner review (2026-10-27).
 * Preview with ?gb=1|2|3 (persisted). All three render; CSS shows one (see globals.css .gbv-*).
 * TEMPORARY: delete the two unused options and the ?gb switch once the owner picks.
 */
type Badge = { pending: number; done: number; accepted: number; dueToday?: number } | null;

function summary(b: Badge) {
  if (!b || b.accepted === 0) return { pill: 'המסע שלך מחכה', line: 'עוד אין משימות להיום. בלחיצה ממשיכים במסע.', done: 0, total: 0 };
  const total = b.dueToday || b.accepted;
  if (b.pending === 0) return { pill: `סגרת הכל · ${b.done}/${total}`, line: 'כל המשימות של היום הושלמו.', done: b.done, total };
  return {
    pill: b.pending === 1 ? 'משימה אחת להיום' : `${b.pending} משימות להיום`,
    line: `${b.done} מתוך ${total} הושלמו היום`,
    done: b.done,
    total,
  };
}

function Ring({ done, total }: { done: number; total: number }) {
  const r = 22, c = 2 * Math.PI * r, pct = total ? done / total : 0;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden className="shrink-0">
      <circle cx="28" cy="28" r={r} fill="none" stroke="var(--gb-ring-track)" strokeWidth="6" />
      <circle cx="28" cy="28" r={r} fill="none" stroke="var(--gb-ring)" strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 28 28)" />
      <text x="28" y="33" textAnchor="middle" fontSize="14" fontWeight="800" fill="var(--gb-ink)">{total ? `${done}/${total}` : '0'}</text>
    </svg>
  );
}

function GreetingOptions({ title, occasion, badge, onOpen }: { title: string; occasion?: string | null; badge: Badge; onOpen?: () => void }) {
  const s = summary(badge);
  return (
    <div className="mb-3" dir="rtl">
      {/* 1 — iOS large title straight on the hero band + a small solid tasks pill */}
      <div className="gbv gbv-1">
        <h2 className="gb1-title">{title}</h2>
        {occasion ? <p className="gb1-sub">{occasion}</p> : null}
        {// design-lint-allow: temporary owner-preview option (delete after pick)
        }<button type="button" onClick={onOpen} className="gb1-pill" aria-label="פתח רשימת משימות היום">
          <ListChecks className="size-4" aria-hidden />
          <span>{s.pill}</span>
          <ChevronLeft className="size-4 opacity-80" aria-hidden />
        </button>
      </div>

      {/* 2 — clean solid card with a progress ring */}
      {// design-lint-allow: temporary owner-preview option (delete after pick)
        }<button type="button" onClick={onOpen} className="gbv gbv-2 gb2-card" aria-label="פתח רשימת משימות היום">
        <Ring done={s.done} total={s.total} />
        <span className="min-w-0 flex-1 text-start">
          <span className="gb2-title">{title}</span>
          <span className="gb2-line">{occasion || s.line}</span>
          {occasion ? <span className="gb2-line">{s.line}</span> : null}
        </span>
        <ChevronLeft className="size-5 gb2-chev" aria-hidden />
      </button>

      {/* 3 — two-tier card: greeting on top, a tasks row with a count tile below a divider */}
      <div className="gbv gbv-3 gb3-card">
        <div className="gb3-head">
          <p className="gb3-title">{title}</p>
          {occasion ? <p className="gb3-sub">{occasion}</p> : null}
        </div>
        {// design-lint-allow: temporary owner-preview option (delete after pick)
        }<button type="button" onClick={onOpen} className="gb3-row" aria-label="פתח רשימת משימות היום">
          <span className="gb3-tile">{s.total ? s.total - s.done : 0}</span>
          <span className="min-w-0 flex-1 text-start">
            <span className="gb3-row-title">{s.pill}</span>
            <span className="gb3-row-line">{s.line}</span>
          </span>
          <ChevronLeft className="size-5 gb3-chev" aria-hidden />
        </button>
      </div>
    </div>
  );
}
