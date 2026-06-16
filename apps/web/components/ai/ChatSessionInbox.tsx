'use client';

import { useMemo, useState } from 'react';
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
  type InboxTimeFolderId,
} from '../../lib/client/chat-session-inbox-organize';
import type { ChatTopicId } from '../../lib/client/chat-session-topics';
import type { ChatSessionListItemClient } from '../../lib/client/chat-session-api';
import {
  chipStyle,
  glassPanelStyle,
  glassTint,
  INBOX_TIME_COLORS,
} from '../../lib/client/chat-inbox-colors';
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

function timeColorFor(id: InboxFolderId) {
  if (id in INBOX_TIME_COLORS) {
    return INBOX_TIME_COLORS[id as InboxTimeFolderId];
  }
  return INBOX_TIME_COLORS.all;
}

function SessionRow({
  session,
  isActive,
  onSelect,
  accent = '#22c55e',
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

  return (
    <button
      type="button"
      onClick={onSelect}
      className="relative w-full overflow-hidden rounded-2xl px-3 py-3 pr-3.5 text-right transition duration-200 hover:brightness-105"
      style={{
        ...glassPanelStyle(isActive || isOpen ? accent : undefined),
        borderRight: `3px solid ${isOpen || isActive ? accent : glassTint(accent, 0.35)}`,
      }}
    >
      <div className="flex items-start gap-2.5">
        <span
          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{
            background: isOpen ? accent : '#94a3b8',
            boxShadow: isOpen ? `0 0 12px ${accent}` : undefined,
          }}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="line-clamp-2 text-sm font-semibold text-white">{title}</span>
            <span className="shrink-0 text-[10px] text-slate-300">{formatSessionRelativeTime(session.updated_at)}</span>
          </span>
          <span className="mt-1 line-clamp-1 text-xs text-slate-300/90">{subtitle}</span>
          <span className="mt-1.5 inline-flex items-center gap-1.5">
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={
                isOpen
                  ? { background: accent, color: '#fff', boxShadow: `0 4px 14px ${glassTint(accent, 0.45)}` }
                  : { background: 'rgba(148,163,184,0.2)', color: '#cbd5e1', border: '1px solid rgba(148,163,184,0.35)' }
              }
            >
              {isOpen ? 'פעילה' : 'נסגרה'}
            </span>
            {session.summary && session.status === 'closed' ? (
              <span className="text-[10px] font-semibold text-amber-300">★ סיכום</span>
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
  const { url: bgUrl, hasPhoto } = useLoginBackground();
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
          style={{ border: '1px solid rgba(255,255,255,0.22)', boxShadow: '0 20px 50px rgba(2,6,23,0.35)' }}
        >
          {hasPhoto && bgUrl ? (
            <img src={bgUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-105 object-cover" />
          ) : (
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(135deg, #312e81 0%, #065f46 40%, #0e7490 100%)',
              }}
              aria-hidden
            />
          )}

          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(180deg, rgba(15,23,42,0.55) 0%, rgba(15,23,42,0.82) 100%)' }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 92% 8%, rgba(34,197,94,0.45) 0%, transparent 42%), radial-gradient(circle at 8% 88%, rgba(99,102,241,0.42) 0%, transparent 40%), radial-gradient(circle at 50% 50%, rgba(244,63,94,0.18) 0%, transparent 55%)',
            }}
            aria-hidden
          />

          <div className="relative p-4">
            <div className="rounded-[22px] p-3.5" style={glassPanelStyle('#6366f1')}>
              <div className="flex items-start gap-3">
                <div
                  className="relative shrink-0 rounded-2xl p-[2px]"
                  style={{
                    background: 'linear-gradient(135deg, #22c55e, #06b6d4, #6366f1, #f43f5e)',
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
                    className="bg-gradient-to-l from-emerald-200 via-cyan-200 to-indigo-200 bg-clip-text text-[1.08rem] font-black leading-tight text-transparent"
                    style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
                  >
                    שיחות עם אלמוג
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-white/80">
                    צבעים לפי נושא · חיפוש · המשך מכל מקום
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                      style={{ background: '#6366f1', boxShadow: '0 4px 12px rgba(99,102,241,0.45)' }}
                    >
                      {stats.total} שיחות
                    </span>
                    {stats.open > 0 ? (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                        style={{ background: '#22c55e', boxShadow: '0 4px 12px rgba(34,197,94,0.45)' }}
                      >
                        {stats.open} פעילות
                      </span>
                    ) : null}
                    {stats.withSummary > 0 ? (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold text-slate-900"
                        style={{ background: '#facc15', boxShadow: '0 4px 12px rgba(250,204,21,0.4)' }}
                      >
                        {stats.withSummary} סיכומים
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
              className="mt-3 flex w-full items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5 text-right transition hover:brightness-110 disabled:opacity-60"
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 50%, #6366f1 100%)',
                border: '1px solid rgba(255,255,255,0.35)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 12px 28px rgba(6,182,212,0.35)',
              }}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20 text-white">
                {startingNew ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-white">שיחה חדשה</span>
                <span className="mt-0.5 block text-[11px] text-white/85">שאל, שתף, בנה צעד קטן להיום</span>
              </span>
              <ChevronLeft className="h-4 w-4 shrink-0 text-white/90" />
            </button>

            <div className="relative mt-3">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-200" />
              <input
                type="search"
                dir="rtl"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="חיפוש לפי נושא, סיכום או הודעה..."
                className="w-full rounded-xl py-2.5 pl-9 pr-10 text-sm text-white outline-none placeholder:text-white/50"
                style={glassPanelStyle('#06b6d4')}
              />
              {searchQuery ? (
                <button
                  type="button"
                  aria-label="נקה חיפוש"
                  onClick={() => setSearchQuery('')}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-white/80 hover:bg-white/15"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-2.5 space-y-2">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {timeChips.map((chip) => {
              const selected = activeFolder === chip.id;
              const palette = timeColorFor(chip.id);
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setActiveFolder(chip.id)}
                  className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition"
                  style={chipStyle(selected, palette.main, palette.soft, palette.border)}
                >
                  {chip.label}
                  <span className="mr-1 opacity-80">({chip.count})</span>
                </button>
              );
            })}
          </div>

          {topicChips.length > 0 ? (
            <div>
              <p className="mb-1.5 px-0.5 text-[10px] font-bold tracking-wide text-cyan-300/80">לפי נושא</p>
              <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {topicChips.map((chip) => {
                  const selected = activeFolder === chip.id;
                  const main = chip.accent ?? '#6366f1';
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => setActiveFolder(chip.id as ChatTopicId)}
                      className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition"
                      style={chipStyle(
                        selected,
                        main,
                        glassTint(main, 0.2),
                        glassTint(main, 0.55)
                      )}
                    >
                      {chip.label}
                      <span className="mr-1 opacity-80">({chip.count})</span>
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
            <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="rounded-2xl px-4 py-6 text-center text-sm text-slate-200" style={glassPanelStyle('#6366f1')}>
            עדיין אין שיחות שמורות.
            <br />
            לחץ למעלה כדי להתחיל את הראשונה.
          </div>
        ) : groupedSections.length > 0 ? (
          <div className="space-y-4">
            {groupedSections.map((section) => {
              const Icon = topicIcon(section.id);
              const accent = section.accent ?? '#22c55e';
              return (
                <section key={section.id}>
                  <div
                    className="mb-2 flex items-center gap-2 rounded-xl px-2 py-1.5"
                    style={{ background: glassTint(accent, 0.12), border: `1px solid ${glassTint(accent, 0.28)}` }}
                  >
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-lg"
                      style={{ background: accent, boxShadow: `0 4px 12px ${glassTint(accent, 0.5)}` }}
                    >
                      <Icon className="h-3.5 w-3.5 text-white" />
                    </span>
                    <h3 className="text-xs font-bold text-white">{section.label}</h3>
                    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: accent }}>
                      {section.sessions.length}
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {section.sessions.map((session) => (
                      <li key={session.id}>
                        <SessionRow
                          session={session}
                          isActive={session.id === activeSessionId}
                          accent={accent}
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
          <div className="rounded-2xl px-4 py-6 text-center text-sm text-slate-200" style={glassPanelStyle('#f43f5e')}>
            לא נמצאו שיחות לחיפוש או לתיקייה הזו.
          </div>
        ) : (
          <ul className="space-y-2">
            {(trimmedSearch || !isTimeFolder(activeFolder)) && (
              <li
                className="mb-1 rounded-lg px-2 py-1 text-xs font-bold text-white"
                style={{
                  background: glassTint(
                    folderChips.find((c) => c.id === activeFolder)?.accent ??
                      timeColorFor(activeFolder).main,
                    0.25
                  ),
                }}
              >
                {trimmedSearch
                  ? `תוצאות חיפוש (${flatSessions.length})`
                  : folderChips.find((c) => c.id === activeFolder)?.label}
              </li>
            )}
            {flatSessions.map((session) => (
              <li key={session.id}>
                <SessionRow
                  session={session}
                  isActive={session.id === activeSessionId}
                  accent={
                    folderChips.find((c) => c.id === activeFolder)?.accent ??
                    timeColorFor(activeFolder).main
                  }
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
