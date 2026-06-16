'use client';

import { useMemo, useState } from 'react';
import {
  Archive,
  CalendarDays,
  ChevronLeft,
  FolderOpen,
  Loader2,
  MessageSquarePlus,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { buildChatSessionListTitle } from '../../lib/ai/chat-sessions/session-list-title';
import { formatSessionRelativeTime } from '../../lib/client/chat-session-messages';
import {
  buildInboxFolderChips,
  buildInboxStats,
  filterInboxSessions,
  groupInboxSessions,
  type InboxFolderId,
  type InboxSession,
} from '../../lib/client/chat-session-inbox-organize';
import type { ChatSessionListItemClient } from '../../lib/client/chat-session-api';
import { ALMOG_AVATAR_FALLBACK } from '../../lib/ai/almog-avatar';
import { useAlmogAvatarUrl } from '../../lib/client/useAlmogAvatarUrl';

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

function sectionIcon(sectionId: string) {
  if (sectionId === 'open') return FolderOpen;
  if (sectionId === 'today') return CalendarDays;
  if (sectionId === 'summary') return Sparkles;
  if (sectionId === 'archive') return Archive;
  return CalendarDays;
}

function SessionRow({
  session,
  isActive,
  onSelect,
}: {
  session: InboxSession;
  isActive: boolean;
  onSelect: () => void;
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
      className={`w-full rounded-2xl border px-3 py-3 text-right backdrop-blur-md transition ${
        isActive
          ? 'border-emerald-400/40 bg-emerald-500/15'
          : 'border-white/12 bg-white/5 hover:border-white/20 hover:bg-white/8'
      }`}
      style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
            isOpen ? 'bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.6)]' : 'bg-slate-500'
          }`}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="line-clamp-2 text-sm font-semibold text-slate-100">{title}</span>
            <span className="shrink-0 text-[10px] text-slate-400">
              {formatSessionRelativeTime(session.updated_at)}
            </span>
          </span>
          <span className="mt-1 line-clamp-1 text-xs text-slate-400">{subtitle}</span>
          <span className="mt-1.5 inline-flex items-center gap-1.5">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                isOpen
                  ? 'border border-emerald-400/35 bg-emerald-500/20 text-emerald-100'
                  : 'border border-white/15 bg-white/5 text-slate-400'
              }`}
            >
              {isOpen ? 'פעילה' : 'נסגרה'}
            </span>
            {session.summary && session.status === 'closed' ? (
              <span className="text-[10px] text-emerald-300/80">יש סיכום</span>
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
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFolder, setActiveFolder] = useState<InboxFolderId>('all');

  const inboxSessions = sessions as InboxSession[];
  const stats = useMemo(() => buildInboxStats(inboxSessions), [inboxSessions]);
  const folderChips = useMemo(() => buildInboxFolderChips(inboxSessions), [inboxSessions]);
  const trimmedSearch = searchQuery.trim();

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
          className="relative overflow-hidden rounded-[22px] border border-emerald-400/25 px-4 py-4 text-right text-white shadow-[0_16px_40px_rgba(6,78,59,0.35)]"
          style={{
            background:
              'linear-gradient(145deg, rgba(6,78,59,0.95) 0%, rgba(4,120,87,0.92) 45%, rgba(16,185,129,0.88) 100%)',
          }}
        >
          <div
            className="pointer-events-none absolute -left-8 -top-10 h-28 w-28 rounded-full bg-white/10 blur-2xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-8 -right-6 h-24 w-24 rounded-full bg-emerald-200/15 blur-2xl"
            aria-hidden
          />

          <div className="relative flex items-start gap-3">
            <img
              src={avatarSrc}
              alt="אלמוג"
              className="h-14 w-14 shrink-0 rounded-2xl border border-white/35 object-cover shadow-lg"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = ALMOG_AVATAR_FALLBACK;
              }}
            />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-black leading-tight" style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}>
                שיחות עם אלמוג
              </p>
              <p className="mt-1 text-xs leading-relaxed text-emerald-50/90">
                כל השיחות, הסיכומים והמשך — במקום אחד.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/95">
                  {stats.total} שיחות
                </span>
                {stats.open > 0 ? (
                  <span className="rounded-full border border-emerald-200/30 bg-emerald-300/15 px-2 py-0.5 text-[10px] font-bold text-emerald-50">
                    {stats.open} פעילות
                  </span>
                ) : null}
                {stats.withSummary > 0 ? (
                  <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/90">
                    {stats.withSummary} עם סיכום
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={startingNew}
            onClick={onStartNewChat}
            className="relative mt-4 flex w-full items-center justify-between gap-3 rounded-2xl border border-white/25 bg-white/12 px-3.5 py-2.5 text-right backdrop-blur-md transition hover:bg-white/18 disabled:opacity-60"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white">
              {startingNew ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MessageSquarePlus className="h-4 w-4" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-white">שיחה חדשה</span>
              <span className="mt-0.5 block text-[11px] text-emerald-50/85">שאל, שתף, בנה צעד קטן להיום</span>
            </span>
            <ChevronLeft className="h-4 w-4 shrink-0 text-white/80" />
          </button>

          <div className="relative mt-3">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-50/70" />
            <input
              type="search"
              dir="rtl"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חיפוש בשיחות, סיכומים או הודעות..."
              className="w-full rounded-xl border border-white/20 bg-slate-950/25 py-2.5 pl-9 pr-10 text-sm text-white outline-none placeholder:text-emerald-50/55 focus:border-white/35"
            />
            {searchQuery ? (
              <button
                type="button"
                aria-label="נקה חיפוש"
                onClick={() => setSearchQuery('')}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-emerald-50/80 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {folderChips.map((chip) => {
            const selected = activeFolder === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setActiveFolder(chip.id)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${
                  selected
                    ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-50'
                    : 'border-white/12 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/8'
                }`}
              >
                {chip.label}
                <span className="mr-1 opacity-70">({chip.count})</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3" style={{ WebkitOverflowScrolling: 'touch' }}>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-300/80" />
          </div>
        ) : sessions.length === 0 ? (
          <div
            className="rounded-2xl border border-white/15 bg-white/5 px-4 py-6 text-center text-sm text-slate-300/90 backdrop-blur-sm"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}
          >
            עדיין אין שיחות שמורות.
            <br />
            לחץ למעלה כדי להתחיל את הראשונה.
          </div>
        ) : groupedSections.length > 0 ? (
          <div className="space-y-4">
            {groupedSections.map((section) => {
              const Icon = sectionIcon(section.id);
              return (
                <section key={section.id}>
                  <div className="mb-2 flex items-center gap-2 px-0.5">
                    <Icon className="h-3.5 w-3.5 text-emerald-300/85" />
                    <h3 className="text-xs font-bold text-slate-300">{section.label}</h3>
                    <span className="text-[10px] text-slate-500">({section.sessions.length})</span>
                  </div>
                  <ul className="space-y-2">
                    {section.sessions.map((session) => (
                      <li key={session.id}>
                        <SessionRow
                          session={session}
                          isActive={session.id === activeSessionId}
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
          <div className="rounded-2xl border border-white/15 bg-white/5 px-4 py-6 text-center text-sm text-slate-300/90">
            לא נמצאו שיחות לחיפוש או לתיקייה הזו.
          </div>
        ) : (
          <ul className="space-y-2">
            {trimmedSearch ? (
              <li className="mb-1 px-0.5 text-xs font-bold text-slate-400">
                תוצאות חיפוש ({flatSessions.length})
              </li>
            ) : null}
            {flatSessions.map((session) => (
              <li key={session.id}>
                <SessionRow
                  session={session}
                  isActive={session.id === activeSessionId}
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
