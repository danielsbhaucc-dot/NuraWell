'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { useAlmogAvatarUrl } from '../../lib/client/useAlmogAvatarUrl';
import { ALMOG_AVATAR_FALLBACK } from '../../lib/ai/almog-avatar';
import { dispatchOpenAlmogChatWithPrefill, dispatchOpenAlmogChatWithTaskReport } from '../../lib/notifications/open-almog-chat';
import type { TaskReportHint } from '../../lib/ai/task-report-hint';
import { getPersonalGreeting } from '../../lib/time/greeting';

interface AlmogHeroHeaderProps {
  firstName: string;
  bubbleContent: ReactNode;
  /** כותרת משנה דינמית מתחת ל"✦ אלמוג" */
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
  onTaskBadgeClick?: () => void;
}

/** כותרת בית עם אלמוג — שיקוף ברכה אישית + סטטוס משימות היום. */
export function AlmogHeroHeader({
  firstName,
  bubbleContent,
  mentorTag,
  chatCta,
  taskProgress,
  taskBadge,
  onTaskBadgeClick,
}: AlmogHeroHeaderProps) {
  const { avatarUrl } = useAlmogAvatarUrl();
  const greeting = getPersonalGreeting(new Date());

  /** ברירת מחדל אם לא מועבר מבחוץ — לא מציגים שורת משימות */
  const showTaskBadge = !!taskBadge && !taskBadge.loading;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mb-3 rounded-2xl px-4 py-3"
        style={{
          background:
            'linear-gradient(145deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.16) 100%)',
          border: '1px solid rgba(255,255,255,0.35)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 2px 12px rgba(0,0,0,0.06)',
          isolation: 'isolate',
        }}
      >
        <div
          style={{
            fontSize: '20px',
            color: '#fff',
            fontWeight: 900,
            fontFamily: "'Rubik','Heebo',sans-serif",
            lineHeight: 1.15,
          }}
        >
          {greeting.timeGreeting} {firstName} <span aria-hidden>👋</span>
        </div>
        {greeting.occasionGreeting ? (
          <div
            style={{
              marginTop: '4px',
              fontSize: '13px',
              color:
                greeting.tone === 'festive'
                  ? '#FFD97D'
                  : greeting.tone === 'solemn'
                    ? 'rgba(255,255,255,0.78)'
                    : 'rgba(255,255,255,0.92)',
              fontWeight: greeting.tone === 'solemn' ? 600 : 700,
              fontStyle: greeting.tone === 'solemn' ? 'italic' : 'normal',
              letterSpacing: '0.2px',
              fontFamily: "'Rubik','Heebo',sans-serif",
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span aria-hidden style={{ fontSize: '13px' }}>
              {greeting.tone === 'festive'
                ? '✦'
                : greeting.tone === 'solemn'
                  ? '🕯️'
                  : '✿'}
            </span>
            <span>{greeting.occasionGreeting}</span>
          </div>
        ) : null}
        {showTaskBadge ? (
          <TaskBadgeRow {...taskBadge!} onClick={onTaskBadgeClick} />
        ) : null}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="flex items-start gap-3"
      >
        <button
          type="button"
          className="relative flex-shrink-0 mt-0.5"
          onClick={() => window.dispatchEvent(new Event('open-almog-chat'))}
          aria-label="פתח צ׳אט עם אלמוג"
        >
          <motion.div
            className="absolute rounded-full"
            style={{
              inset: '-8px',
              background: 'conic-gradient(from 0deg, #14b8a6, #10b981, #f59e0b, #10b981, #14b8a6)',
              filter: 'blur(14px)',
              opacity: 0.55,
              zIndex: -1,
            }}
          />
          <div
            style={{
              width: '82px',
              height: '82px',
              borderRadius: '50%',
              background: 'conic-gradient(from 0deg, #14b8a6 0%, #10b981 30%, #f59e0b 55%, #10b981 75%, #14b8a6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(16,185,129,0.2)',
            }}
          >
            <div
              style={{
                width: '74px',
                height: '74px',
                borderRadius: '50%',
                background: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '3px',
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
          <div
            style={{
              position: 'absolute',
              bottom: '0px',
              left: '-2px',
              background: '#14b8a6',
              border: '2px solid white',
              borderRadius: '20px',
              padding: '3px 7px',
              display: 'flex',
              gap: '2px',
              alignItems: 'center',
              boxShadow: '0 2px 8px rgba(20,184,166,0.4)',
            }}
          >
            <span style={{ width: '3px', height: '3px', background: 'white', borderRadius: '50%', display: 'inline-block' }} />
            <span style={{ width: '3px', height: '3px', background: 'white', borderRadius: '50%', display: 'inline-block' }} />
            <span style={{ width: '3px', height: '3px', background: 'white', borderRadius: '50%', display: 'inline-block' }} />
          </div>
        </button>

        <div className="min-w-0 flex-1 flex flex-col gap-2">
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
            style={{
              background:
                'linear-gradient(145deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.12) 100%)',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '18px 18px 18px 6px',
              padding: '11px 14px',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.28), 0 4px 20px rgba(0,0,0,0.1)',
              isolation: 'isolate',
            }}
          >
            <div
              style={{
                fontSize: '10px',
                color: '#A7F3D0',
                fontWeight: 700,
                letterSpacing: '0.5px',
                marginBottom: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>✦ אלמוג · המנטור שלך</span>
              {mentorTag ? (
                <span
                  style={{
                    fontSize: '9px',
                    fontWeight: 800,
                    color: 'rgba(255,255,255,0.88)',
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
                color: 'rgba(255,255,255,0.92)',
                lineHeight: 1.55,
                fontWeight: 400,
                fontFamily: "'Heebo',sans-serif",
              }}
            >
              {bubbleContent}
            </div>
          </motion.div>

          {taskProgress && taskProgress.total > 0 ? (
            <div
              style={{
                padding: '0 2px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '9px',
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.72)',
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
          {chatCta ? (
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
        </div>
      </motion.div>
    </>
  );
}

/** @deprecated השתמש ב-AlmogHeroHeader */
export const DolevHeroHeader = AlmogHeroHeader;

/**
 * שורת "יש לך X משימות לביצוע" מעוצבת — מופיעה רק כשיש משימות פתוחות בפועל.
 * מצב 1 — כל המשימות בוצעו: ירוק חזק "סגרת הכל היום ✦"
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
        className: 'w-full text-right',
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
          background: 'linear-gradient(135deg, rgba(167,243,208,0.22), rgba(110,231,183,0.16))',
          border: '1px solid rgba(167,243,208,0.4)',
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
            color: '#ECFDF5',
            letterSpacing: '0.2px',
            flex: 1,
          }}
        >
          המסע שלך מחכה, בלחיצה אתה שם
        </span>
        {onClick ? (
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>
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
          ✦
        </span>
        <span
          style={{
            fontSize: '12px',
            fontWeight: 800,
            color: '#FFFFFF',
            letterSpacing: '0.2px',
            flex: 1,
          }}
        >
          סגרת היום הכל, {done} מתוך {dueToday || accepted}
        </span>
        {onClick ? (
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>
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
          color: '#FEF3C7',
          letterSpacing: '0.2px',
          flex: 1,
          lineHeight: 1.35,
          minWidth: 0,
        }}
      >
        {done > 0 && dueToday > 0 ? (
          <>
            {done}/{dueToday} בוצעו · עוד{' '}
            <span style={{ color: '#FFFFFF', fontWeight: 900, fontSize: '14px' }}>{pending}</span>
          </>
        ) : (
          <>
            יש לך{' '}
            <span style={{ color: '#FFFFFF', fontWeight: 900, fontSize: '14px' }}>{pending}</span>{' '}
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
                  color: '#FFFFFF',
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
                    color: 'rgba(255,255,255,0.82)',
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
            color: '#FFFFFF',
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
