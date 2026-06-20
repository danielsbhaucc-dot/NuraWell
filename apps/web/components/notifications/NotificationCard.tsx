'use client';

import Link from 'next/link';
import { Archive, ArchiveRestore, Check, MessageCircle, Zap } from 'lucide-react';
import { ALMOG_AVATAR_ALT } from '@/lib/a11y/alt-text';
import { ALMOG_AVATAR_FALLBACK } from '../../lib/ai/almog-avatar';
import { getMentorAvatarFallback } from '../../lib/mentors/avatar-url';
import { MENTORS } from '../../lib/mentors/registry';
import { formatHebrewRelativeTime } from '../../lib/time/hebrew-relative';
import { isNotificationReplyable } from '../../lib/notifications/replyable';
import { dispatchOpenAlmogReply } from '../../lib/notifications/open-almog-reply';
import { ChurnSurveyButtons } from './ChurnSurveyButtons';
import { cn } from '../../lib/cn';
import type { NotificationItem } from './NotificationsProvider';

type NotificationCardProps = {
  notification: NotificationItem;
  nowMs: number;
  viewMode: 'inbox' | 'archive';
  almogAvatar: string;
  dolevAvatar: string;
  onMarkRead: (id: string, wasUnread: boolean) => void;
  onArchive: (id: string, e: React.MouseEvent) => void;
  onUnarchive: (id: string, e: React.MouseEvent) => void;
  onCloseDrawer: () => void;
};

export function NotificationCard({
  notification: n,
  nowMs,
  viewMode,
  almogAvatar,
  dolevAvatar,
  onMarkRead,
  onArchive,
  onUnarchive,
  onCloseDrawer,
}: NotificationCardProps) {
  const isAi = n.type === 'ai_message';
  const isDolev = n.mentorId === 'dolev';
  const isCheckpoint = n.source === 'almog_habit_checkpoint';
  const canReply = isNotificationReplyable(n);
  const relative = formatHebrewRelativeTime(n.created_at, nowMs);
  const aiAvatar = isDolev ? dolevAvatar : almogAvatar;
  const aiAvatarFallback = isDolev ? getMentorAvatarFallback(MENTORS.dolev) : ALMOG_AVATAR_FALLBACK;
  const aiBadge = isDolev ? 'דולב' : 'אלמוג';

  const handleReply = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onCloseDrawer();
    dispatchOpenAlmogReply({
      notificationId: n.id,
      mentorMessage: n.body,
      title: n.title,
      source: n.source,
      createdAt: n.created_at,
      onMarkRead: () => {
        void onMarkRead(n.id, !n.is_read);
      },
    });
  };

  const handleCardClick = () => {
    if (!n.is_read) {
      void onMarkRead(n.id, true);
    }
  };

  const handleMarkReadClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!n.is_read) {
      void onMarkRead(n.id, true);
    }
  };

  const showMarkReadIcon = viewMode === 'inbox' && !n.is_read;

  return (
    <article
      className={cn(
        'relative rounded-2xl border text-right shadow-sm transition backdrop-blur-sm',
        n.is_read
          ? 'border-slate-200/70 bg-gradient-to-br from-slate-100/90 via-emerald-50/50 to-teal-50/40 opacity-95'
          : isCheckpoint
            ? 'border-amber-300/70 bg-gradient-to-br from-amber-50/95 via-orange-50/75 to-amber-100/60 shadow-amber-900/8'
            : 'border-amber-200/65 bg-gradient-to-br from-amber-50/90 via-yellow-50/55 to-emerald-50/70 shadow-amber-900/5',
        'cursor-pointer active:scale-[0.99]'
      )}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.target !== e.currentTarget) return;
          e.preventDefault();
          if (!n.is_read) void onMarkRead(n.id, true);
        }
      }}
      role="button"
      tabIndex={0}
      lang="he"
    >
      {!n.is_read && (
        <span
          className={cn(
            'absolute top-3 bottom-3 start-0 w-[3px] rounded-full shadow-sm',
            isCheckpoint
              ? 'bg-gradient-to-b from-amber-400 to-orange-400'
              : 'bg-gradient-to-b from-amber-400 to-amber-500'
          )}
          aria-hidden
        />
      )}

      <button
        type="button"
        title={viewMode === 'inbox' ? 'העבר לארכיון' : 'החזר לתיבה'}
        className="absolute top-2.5 start-2.5 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg text-emerald-800/70 transition hover:bg-emerald-100/80 hover:text-emerald-900"
        onClick={(e) =>
          viewMode === 'inbox' ? void onArchive(n.id, e) : void onUnarchive(n.id, e)
        }
      >
        {viewMode === 'inbox' ? (
          <Archive className="h-4 w-4" aria-hidden />
        ) : (
          <ArchiveRestore className="h-4 w-4" aria-hidden />
        )}
      </button>

      {/**
       * 🔘 "סמן כנקרא" — אייקון מעוגל בפינה האחורית (top-end).
       * נמצא במקביל לכפתור הארכיון (top-start), כך שאין שני כפתורים בשורת
       * הפעולות התחתונה — "השב לאלמוג" לא יורד למטה כשההתראה לא-קרואה.
       * המראה: עיגול ירוק קטן עם וי לבן, מתפצל בעדינות מהרקע.
       */}
      {showMarkReadIcon && (
        <button
          type="button"
          title="סמן כנקרא"
          aria-label="סמן כנקרא"
          onClick={handleMarkReadClick}
          className="absolute top-2.5 end-2.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/85 text-white shadow-sm ring-2 ring-amber-100/80 transition hover:bg-emerald-600 hover:ring-emerald-100/90 active:scale-95"
        >
          <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
        </button>
      )}

      {/* pe-10 = נותן מקום לאייקון "סמן כנקרא" בפינה ימין-עליון */}
      <div className={cn('px-3.5 py-3.5 ps-10', showMarkReadIcon ? 'pe-10' : 'pe-3')}>
        <div className="flex flex-row-reverse items-start gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            {isCheckpoint && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-200/60 px-2 py-0.5 text-[10px] font-bold text-amber-950">
                ✨ תובנה רגע
              </span>
            )}
            <div className="flex flex-row items-baseline justify-between gap-2">
              <h3 className="min-w-0 flex-1 text-[15px] font-bold leading-snug text-emerald-950 [overflow-wrap:anywhere]">
                {n.title}
              </h3>
              <time
                className="shrink-0 text-[11px] font-medium text-emerald-800/55 tabular-nums whitespace-nowrap"
                dateTime={n.created_at}
              >
                {relative}
              </time>
            </div>
            <p className="text-[14px] leading-relaxed text-emerald-950/85 [overflow-wrap:anywhere]">
              {n.body}
            </p>

            {n.survey && (
              <ChurnSurveyButtons notificationId={n.id} survey={n.survey} />
            )}

            {(canReply || n.action_url) && (
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                {canReply && (
                  <button
                    type="button"
                    onClick={handleReply}
                    className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-emerald-50 shadow-sm transition hover:bg-emerald-700 active:scale-[0.98]"
                  >
                    <MessageCircle className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
                    השב לאלמוג
                  </button>
                )}
                {n.action_url && (
                  <Link
                    href={n.action_url}
                    onClick={(e) => {
                      e.stopPropagation();
                      void onMarkRead(n.id, !n.is_read);
                      onCloseDrawer();
                    }}
                    className="inline-flex items-center rounded-full border border-emerald-300/60 bg-emerald-100/70 px-3.5 py-1.5 text-xs font-bold text-emerald-900 transition hover:bg-emerald-200/60"
                  >
                    {n.action_url.includes('journey') ? 'למסלול' : 'פתח'}
                  </Link>
                )}
              </div>
            )}
          </div>

          <div className="shrink-0">
            {isAi ? (
              <div className="relative">
                <img
                  src={aiAvatar}
                  alt={ALMOG_AVATAR_ALT}
                  className="h-11 w-11 rounded-full object-cover ring-2 ring-emerald-200/80 shadow-md"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = aiAvatarFallback;
                  }}
                />
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-emerald-700 px-1.5 py-px text-[8px] font-bold text-emerald-50 shadow">
                  {aiBadge}
                </span>
              </div>
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-200/50 text-lg ring-1 ring-emerald-300/40">
                {n.icon_emoji ?? <Zap className="h-5 w-5 text-emerald-700" strokeWidth={2.2} />}
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}