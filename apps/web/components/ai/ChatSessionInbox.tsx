'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import {
  ChevronLeft,
  Droplets,
  Heart,
  Loader2,
  MessageSquarePlus,
  Moon,
  Route,
  Search,
  Sparkles,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { buildChatSessionListTitle } from '../../lib/ai/chat-sessions/session-list-title';
import { formatSessionRelativeTime } from '../../lib/client/chat-session-messages';
import {
  buildInboxFolderChips,
  buildInboxStats,
  filterInboxSessions,
  groupInboxSessions,
  isTimeFolder,
  type InboxFolderId,
  type InboxSession,
} from '../../lib/client/chat-session-inbox-organize';
import type { ChatTopicId } from '../../lib/client/chat-session-topics';
import type { ChatSessionListItemClient } from '../../lib/client/chat-session-api';
import { ALMOG_AVATAR_FALLBACK } from '../../lib/ai/almog-avatar';
import { useAlmogAvatarUrl } from '../../lib/client/useAlmogAvatarUrl';
import { useLoginBackground } from '../../lib/client/useLoginBackground';

type ChatSessionInboxProps = {
  sessions: ChatSessionListItemClient[];
  loading: boolean;
  activeSessionId: string | null;
  onSelectSession: (session: ChatSessionListItemClient) => void;
  onStartNewChat: () => void;
  startingNew: boolean;
};

const GLASS_PANEL: CSSProperties = {
  background:
    'linear-gradient(145deg, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0.04) 42%, rgba(255,255,255,0.07) 100%)',
  border: '1px solid rgba(255,255,255,0.16)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 0 rgba(0,0,0,0.12), 0 18px 44px rgba(8,6,4,0.38)',
};

const GLASS_CHIP_IDLE =
  'border border-white/10 bg-white/[0.04] text-slate-200 hover:border-amber-200/20 hover:bg-white/[0.07]';

function titleForSession(session: InboxSession): string {
  return buildChatSessionListTitle(session);
}

function topicIcon(topicId: string) {
  if (topicId === 'habits') return Droplets;
  if (topicId === 'emotions') return Heart;
  if (topicId === 'nutrition') return UtensilsCrossed;
  if (topicId === 'sleep') return Moon;
  if (topicId === 'journey') return Route;
  if (topicId === 'open') return Sparkles;
  return Sparkles;
}

function SessionRow({
  session,
  isActive,
  onSelect,
  accent,
}: {
  session: InboxSession;
  isActive: boolean;
  onSelect: () => void;
  accent?: string;
}) {
  const title = titleForSession(session);
  const subtitle =
    session.summary && session.preview_text && session.status === 'closed'
      ? session.preview_text
      : session.preview_text && session.preview_text !== title
        ? session.preview_text
        : session.message_count > 0
          ? `${session.message_count} הודעות`
          : 'שיחה ריקה';
  const isOpen = session.status === 'open';
  const accentColor = accent ?? '#10b981';

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full rounded-2xl px-3 py-3 text-right transition duration-200"
      style={
        isActive
          ? {
              ...GLASS_PANEL,
              border: `1px solid ${accentColor}55`,
              background: `linear-gradient(145deg, ${accentColor}22 0%, rgba(255,255,255,0.06) 100%)`,
            }
          : GLASS_PANEL
      }
    >
      <div className="flex items-start gap-2.5">
        <span
          className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
          style={{
            background: isOpen ? accentColor : 'rgba(148,163,184,0.55)',
            boxShadow: isOpen ? `0 0 10px ${accentColor}88` : undefined,
          }}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="line-clamp-2 text-sm font-semibold text-slate-50">{title}</span>
            <span className="shrink-0 text-[10px] text-slate-400">
              {formatSessionRelativeTime(session.updated_at)}
            </span>
          </span>
          <span className="mt-1 line-clamp-1 text-xs text-slate-400">{subtitle}</span>
          <span className="mt-1.5 inline-flex items-center gap-1.5">
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={
                isOpen
                  ? {
                      border: `1px solid ${accentColor}66`,
                      background: `${accentColor}22`,
                      color: '#f8fafc',
                    }
                  : {
                      border: '1px solid rgba(255,255,255,0.12)',
                      background: 'rgba(255,255,255,0.05)',
                      color: '#94a3b8',
                    }
              }
            >
              {isOpen ? 'פעילה' : 'נסגרה'}
            </span>
            {session.summary && session.status === 'closed' ? (
              <span className="text-[10px] text-amber-200/75">יש סיכום</span>
            ) : null}
          </span>
        </span>
      </div>
    </button>
  );
}

export function ChatSessionInbox({
  sessions,
  loading,
  activeSessionId,
  onSelectSession,
  onStartNewChat,
  startingNew,
}: ChatSessionInboxProps) {
  const { avatarUrl: avatarSrc } = useAlmogAvatarUrl();
  const { url: bgUrl, hasPhoto, ready: bgReady } = useLoginBackground();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFolder, setActiveFolder] = useState<InboxFolderId>('all');

  const inboxSessions = sessions as InboxSession[];
  const stats = useMemo(() => buildInboxStats(inboxSessions), [inboxSessions]);
  const folderChips = useMemo(
    () => buildInboxFolderChips(inboxSessions, titleForSession),
    [inboxSessions]
  );
  const trimmedSearch = searchQuery.trim();
  const timeChips = folderChips.filter((c) => c.kind === 'time');
  const topicChips = folderChips.filter((c) => c.kind === 'topic');

  const groupedSections = useMemo(
    () =>
      activeFolder === 'all' && !trimmedSearch
        ? groupInboxSessions(inboxSessions, titleForSession)
        : [],
    [activeFolder, trimmedSearch, inboxSessions]
  );

  const flatSessions = useMemo(
    () =>
      activeFolder !== 'all' || trimmedSearch
        ? filterInboxSessions(inboxSessions, activeFolder, trimmedSearch, titleForSession)
        : [],
    [activeFolder, trimmedSearch, inboxSessions]
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-3 pb-2 pt-1">
        <div
          className="relative overflow-hidden rounded-[28px]"
          style={{
            border: '1px solid rgba(255,255,255,0.14)',
            boxShadow: '0 22px 56px rgba(6,4,2,0.45)',
          }}
        >
          {hasPhoto && bgUrl ? (
            <img
              src={bgUrl}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}

          <div
            className="absolute inset-0"
            style={{
              background: hasPhoto
                ? 'linear-gradient(165deg, rgba(28,16,8,0.88) 0%, rgba(12,18,14,0.92) 48%, rgba(8,10,16,0.94) 100%)'
                : 'linear-gradient(165deg, #1c1208 0%, #0f1712 45%, #0a0e14 100%)',
            }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-80"
            style={{
              background:
                'radial-gradient(ellipse 80% 60% at 100% 0%, rgba(217,119,6,0.22) 0%, transparent 55%), radial-gradient(ellipse 70% 50% at 0% 100%, rgba(5,150,105,0.16) 0%, transparent 50%)',
            }}
            aria-hidden
          />

          <div className="relative p-4">
            <div className="rounded-[22px] p-3.5" style={GLASS_PANEL}>
              <div className="flex items-start gap-3">
                <div
                  className="relative shrink-0 rounded-2xl p-[2px]"
                  style={{
                    background:
                      'linear-gradient(145deg, rgba(251,191,36,0.65), rgba(16,185,129,0.45))',
                  }}
                >
                  <img
                    src={avatarSrc}
                    alt="אלמוג"
                    className="h-[54px] w-[54px] rounded-[14px] object-cover"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = ALMOG_AVATAR_FALLBACK;
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[1.05rem] font-black leading-tight tracking-tight text-amber-50"
                    style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
                  >
                    שיחות עם אלמוג
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-amber-100/75">
                    זכוכית חכמה · תיקיות לפי נושא · המשך בכל רגע
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold text-amber-50"
                      style={{
                        border: '1px solid rgba(251,191,36,0.35)',
                        background: 'rgba(120,53,15,0.35)',
                      }}
                    >
                      {stats.total} שיחות
                    </span>
                    {stats.open > 0 ? (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold text-emerald-50"
                        style={{
                          border: '1px solid rgba(52,211,153,0.35)',
                          background: 'rgba(6,78,59,0.45)',
                        }}
                      >
                        {stats.open} פעילות
                      </span>
                    ) : null}
                    {topicChips.length > 0 ? (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold text-orange-100/90"
                        style={{
                          border: '1px solid rgba(251,146,60,0.3)',
                          background: 'rgba(124,45,18,0.35)',
                        }}
                      >
                        {topicChips.length} נושאים
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={startingNew}
              onClick={onStartNewChat}
              className="mt-3 flex w-full items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5 text-right transition duration-200 hover:brightness-110 disabled:opacity-60"
              style={GLASS_PANEL}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-amber-50"
                style={{
                  background: 'linear-gradient(145deg, rgba(217,119,6,0.45), rgba(5,150,105,0.35))',
                  border: '1px solid rgba(255,255,255,0.18)',
                }}
              >
                {startingNew ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MessageSquarePlus className="h-4 w-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-amber-50">שיחה חדשה</span>
                <span className="mt-0.5 block text-[11px] text-amber-100/70">
                  שאל, שתף, בנה צעד קטן להיום
                </span>
              </span>
              <ChevronLeft className="h-4 w-4 shrink-0 text-amber-100/80" />
            </button>

            <div className="relative mt-3">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-100/55" />
              <input
                type="search"
                dir="rtl"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="חיפוש לפי נושא, סיכום או הודעה..."
                className="w-full rounded-xl py-2.5 pl-9 pr-10 text-sm text-amber-50 outline-none placeholder:text-amber-100/45"
                style={{
                  ...GLASS_PANEL,
                  background:
                    'linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 100%)',
                }}
              />
              {searchQuery ? (
                <button
                  type="button"
                  aria-label="נקה חיפוש"
                  onClick={() => setSearchQuery('')}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-amber-100/75 hover:bg-white/10"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            {!bgReady ? (
              <p className="mt-2 text-center text-[10px] text-amber-100/40">טוען רקע...</p>
            ) : null}
          </div>
        </div>

        <div className="mt-2.5 space-y-2">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {timeChips.map((chip) => {
              const selected = activeFolder === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setActiveFolder(chip.id)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                    selected ? 'text-amber-50' : GLASS_CHIP_IDLE
                  }`}
                  style={
                    selected
                      ? {
                          border: '1px solid rgba(251,191,36,0.45)',
                          background:
                            'linear-gradient(145deg, rgba(120,53,15,0.55), rgba(6,78,59,0.35))',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)',
                        }
                      : undefined
                  }
                >
                  {chip.label}
                  <span className="mr-1 opacity-70">({chip.count})</span>
                </button>
              );
            })}
          </div>

          {topicChips.length > 0 ? (
            <div>
              <p className="mb-1.5 px-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200/45">
                לפי נושא
              </p>
              <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {topicChips.map((chip) => {
                  const selected = activeFolder === chip.id;
                  const accent = chip.accent ?? '#d97706';
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => setActiveFolder(chip.id as ChatTopicId)}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                        selected ? 'text-white' : GLASS_CHIP_IDLE
                      }`}
                      style={
                        selected
                          ? {
                              border: `1px solid ${accent}88`,
                              background: `linear-gradient(145deg, ${accent}44, rgba(255,255,255,0.06))`,
                              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
                            }
                          : undefined
                      }
                    >
                      {chip.label}
                      <span className="mr-1 opacity-70">({chip.count})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3" style={{ WebkitOverflowScrolling: 'touch' }}>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-amber-300/80" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="rounded-2xl px-4 py-6 text-center text-sm text-slate-300/90" style={GLASS_PANEL}>
            עדיין אין שיחות שמורות.
            <br />
            לחץ למעלה כדי להתחיל את הראשונה.
          </div>
        ) : groupedSections.length > 0 ? (
          <div className="space-y-4">
            {groupedSections.map((section) => {
              const Icon = topicIcon(section.id);
              return (
                <section key={section.id}>
                  <div className="mb-2 flex items-center gap-2 px-0.5">
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-lg"
                      style={{
                        border: `1px solid ${section.accent ?? '#d97706'}44`,
                        background: `${section.accent ?? '#d97706'}18`,
                      }}
                    >
                      <Icon className="h-3.5 w-3.5" style={{ color: section.accent ?? '#fbbf24' }} />
                    </span>
                    <h3 className="text-xs font-bold text-amber-100/85">{section.label}</h3>
                    <span className="text-[10px] text-slate-500">({section.sessions.length})</span>
                  </div>
                  <ul className="space-y-2">
                    {section.sessions.map((session) => (
                      <li key={session.id}>
                        <SessionRow
                          session={session}
                          isActive={session.id === activeSessionId}
                          accent={section.accent}
                          onSelect={() => onSelectSession(session as ChatSessionListItemClient)}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        ) : flatSessions.length === 0 ? (
          <div className="rounded-2xl px-4 py-6 text-center text-sm text-slate-300/90" style={GLASS_PANEL}>
            לא נמצאו שיחות לחיפוש או לתיקייה הזו.
          </div>
        ) : (
          <ul className="space-y-2">
            {trimmedSearch ? (
              <li className="mb-1 px-0.5 text-xs font-bold text-amber-200/55">
                תוצאות חיפוש ({flatSessions.length})
              </li>
            ) : !isTimeFolder(activeFolder) ? (
              <li className="mb-1 px-0.5 text-xs font-bold text-amber-200/55">
                {folderChips.find((c) => c.id === activeFolder)?.label}
              </li>
            ) : null}
            {flatSessions.map((session) => (
              <li key={session.id}>
                <SessionRow
                  session={session}
                  isActive={session.id === activeSessionId}
                  accent={folderChips.find((c) => c.id === activeFolder)?.accent}
                  onSelect={() => onSelectSession(session as ChatSessionListItemClient)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
