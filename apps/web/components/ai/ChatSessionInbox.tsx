'use client';

import { useMemo, useState } from 'react';
import { Loader2, MessageSquarePlus, Search, X } from 'lucide-react';
import { buildChatSessionListTitle } from '../../lib/ai/chat-sessions/session-list-title';
import { formatSessionRelativeTime } from '../../lib/client/chat-session-messages';
import {
  buildInboxFolderChips,
  filterInboxSessions,
  groupInboxSessions,
  type InboxFolderId,
  type InboxSession,
  type InboxTimeFolderId,
} from '../../lib/client/chat-session-inbox-organize';
import { greenGlassButtonStyle } from '../../lib/client/chat-inbox-colors';
import type { ChatSessionListItemClient } from '../../lib/client/chat-session-api';

const TOPIC_EMOJIS: Record<string, string> = {
  habits: '🎯',
  emotions: '💙',
  nutrition: '🥗',
  sleep: '🌙',
  journey: '📚',
  general: '💬',
};

type ChatSessionInboxProps = {
  sessions: ChatSessionListItemClient[];
  loading: boolean;
  activeSessionId: string | null;
  onSelectSession: (session: ChatSessionListItemClient) => void;
  onStartNewChat: () => void;
  startingNew: boolean;
};

const VISIBLE_TIME_FILTERS = new Set<InboxTimeFolderId>(['all', 'open', 'summary']);

function titleForSession(session: InboxSession): string {
  return buildChatSessionListTitle(session);
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
  const preview =
    session.preview_text && session.preview_text !== title
      ? session.preview_text
      : session.summary && session.summary !== title
        ? session.summary
        : null;
  const isOpen = session.status === 'open';

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border px-3 py-2.5 text-right transition ${
        isActive
          ? 'border-emerald-400/40 bg-emerald-500/12'
          : 'border-white/10 bg-white/[0.04] hover:border-white/18 hover:bg-white/[0.06]'
      }`}
    >
      <div className="flex items-start gap-2">
        <span
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${isOpen ? 'bg-emerald-400' : 'bg-slate-600'}`}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="line-clamp-1 text-[13px] font-semibold text-slate-100">{title}</span>
            <span className="shrink-0 text-[10px] text-slate-500">
              {formatSessionRelativeTime(session.updated_at)}
            </span>
          </span>
          {preview ? (
            <span className="mt-0.5 line-clamp-1 text-[11px] text-slate-400">{preview}</span>
          ) : null}
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
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFolder, setActiveFolder] = useState<InboxFolderId>('all');

  const inboxSessions = sessions as InboxSession[];
  const folderChips = useMemo(
    () => buildInboxFolderChips(inboxSessions, titleForSession),
    [inboxSessions]
  );
  const trimmedSearch = searchQuery.trim();

  const timeChips = useMemo(
    () => folderChips.filter((c) => c.kind === 'time' && VISIBLE_TIME_FILTERS.has(c.id as InboxTimeFolderId)),
    [folderChips]
  );

  const topicChips = useMemo(
    () => folderChips.filter((c) => c.kind === 'topic' && c.count > 0),
    [folderChips]
  );

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
      <div className="shrink-0 space-y-2 px-3 pb-2 pt-1">
        <button
          type="button"
          disabled={startingNew}
          onClick={onStartNewChat}
          className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-emerald-50 transition hover:brightness-[1.03] disabled:opacity-60"
          style={greenGlassButtonStyle()}
        >
          {startingNew ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MessageSquarePlus className="h-4 w-4" />
          )}
          שיחה חדשה
        </button>

        <div className="relative">
          <Search className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            dir="rtl"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="חיפוש..."
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2 pl-8 pr-9 text-[13px] text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/35"
          />
          {searchQuery ? (
            <button
              type="button"
              aria-label="נקה חיפוש"
              onClick={() => setSearchQuery('')}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        {!trimmedSearch && timeChips.length > 0 ? (
          <div className="flex gap-1.5">
            {timeChips.map((chip) => {
              const selected = activeFolder === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setActiveFolder(chip.id)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                    selected
                      ? 'bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/40'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`}
                >
                  {chip.label}
                  {chip.count > 0 ? ` · ${chip.count}` : ''}
                </button>
              );
            })}
          </div>
        ) : null}

        {!trimmedSearch && topicChips.length > 0 ? (
          <div
            className="flex gap-1.5 overflow-x-auto pb-0.5"
            style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
          >
            {topicChips.map((chip) => {
              const selected = activeFolder === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setActiveFolder(chip.id === activeFolder ? 'all' : chip.id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition ${
                    selected ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                  style={
                    selected
                      ? {
                          background: chip.accent
                            ? `linear-gradient(145deg, ${chip.accent}33, ${chip.accent}1a)`
                            : 'rgba(255,255,255,0.1)',
                          border: `1px solid ${chip.accent ?? 'rgba(255,255,255,0.2)'}66`,
                          boxShadow: `0 2px 12px ${chip.accent ?? 'rgba(255,255,255,0.1)'}33`,
                        }
                      : {
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.08)',
                        }
                  }
                >
                  <span aria-hidden>{TOPIC_EMOJIS[chip.id] ?? '💬'}</span>
                  <span>{chip.label}</span>
                  <span
                    className="rounded-full px-1 py-px text-[10px]"
                    style={{
                      background: selected
                        ? `${chip.accent ?? '#6366f1'}44`
                        : 'rgba(255,255,255,0.08)',
                      color: selected ? (chip.accent ?? '#a5b4fc') : '#64748b',
                    }}
                  >
                    {chip.count}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3" style={{ WebkitOverflowScrolling: 'touch' }}>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-400/80" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-slate-400">עדיין אין שיחות. התחל שיחה חדשה למעלה.</p>
        ) : groupedSections.length > 0 ? (
          <div className="space-y-4">
            {groupedSections.map((section) => (
              <section key={section.id}>
                <div
                  className="mb-2 flex items-center gap-2 rounded-lg px-2 py-1.5"
                  style={{
                    background: section.accent
                      ? `linear-gradient(90deg, ${section.accent}22 0%, transparent 80%)`
                      : 'transparent',
                    borderRight: section.accent ? `3px solid ${section.accent}99` : '3px solid rgba(255,255,255,0.12)',
                  }}
                >
                  {section.kind === 'topic' ? (
                    <span className="text-base leading-none" aria-hidden>
                      {TOPIC_EMOJIS[section.id] ?? '💬'}
                    </span>
                  ) : null}
                  <span
                    className="text-[12px] font-bold"
                    style={{ color: section.accent ?? '#94a3b8' }}
                  >
                    {section.label}
                  </span>
                  <span
                    className="mr-auto rounded-full px-1.5 py-px text-[10px] font-semibold"
                    style={{
                      background: section.accent ? `${section.accent}33` : 'rgba(255,255,255,0.08)',
                      color: section.accent ?? '#64748b',
                    }}
                  >
                    {section.sessions.length}
                  </span>
                </div>
                <ul className="space-y-1.5">
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
            ))}
          </div>
        ) : flatSessions.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-slate-400">לא נמצאו שיחות.</p>
        ) : (
          <ul className="space-y-1.5">
            {trimmedSearch ? (
              <li className="mb-1 px-0.5 text-[11px] text-slate-500">
                {flatSessions.length} תוצאות
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
