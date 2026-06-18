'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, Loader2, MessageSquarePlus, Search, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { greenGlassButtonStyle, chipStyle, INBOX_TIME_COLORS } from '../../lib/client/chat-inbox-colors';
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
  onStartNewChatWithPrefill?: (text: string) => void;
  startingNew: boolean;
  firstName?: string;
};

type InboxTab = 'new' | 'history';

const QUICK_STARTERS = [
  { label: 'בוא נתחיל — כוס מים 💧', text: 'בוא נתחיל מחדש — רק כוס מים אחת. אני איתך.' },
  { label: 'קצת קשה לי היום', text: 'קצת קשה לי היום, בלי ביקורת — מה הכי קטן שאפשר לעשות עכשיו?' },
] as const;

const VISIBLE_TIME_FILTERS = new Set<InboxTimeFolderId>(['all', 'open', 'summary']);

function InboxTabBar({
  tab,
  onTab,
  historyCount,
}: {
  tab: InboxTab;
  onTab: (t: InboxTab) => void;
  historyCount: number;
}) {
  const items: { id: InboxTab; label: string; badge?: number }[] = [
    { id: 'new', label: 'שיחה חדשה' },
    { id: 'history', label: 'היסטוריה', badge: historyCount },
  ];

  return (
    <div
      className="shrink-0 border-b border-white/8 bg-[#0f172a] px-3 pb-3 pt-2"
      role="tablist"
      aria-label="ניווט שיחות"
    >
      <div className="flex gap-1 rounded-xl bg-white/[0.05] p-1">
        {items.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTab(item.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-[13px] font-bold transition active:scale-[0.98] ${
                active ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/30' : 'text-slate-400'
              }`}
            >
              {item.label}
              {item.badge != null && item.badge > 0 ? (
                <span
                  className={`rounded-full px-1.5 py-px text-[10px] font-black ${
                    active ? 'bg-white/25 text-white' : 'bg-white/10 text-slate-300'
                  }`}
                >
                  {item.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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

/** סקציה מתקפלת לקטגוריית שיחות — לחיצה על הכותרת פותחת/סוגרת */
function AccordionSection({
  id,
  label,
  accent,
  kind,
  sessions,
  activeSessionId,
  onSelectSession,
  defaultOpen = false,
}: {
  id: string;
  label: string;
  accent?: string;
  kind: 'time' | 'topic';
  sessions: InboxSession[];
  activeSessionId: string | null;
  onSelectSession: (s: ChatSessionListItemClient) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const emoji = kind === 'topic' ? (TOPIC_EMOJIS[id] ?? '💬') : null;

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mb-2 flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-right transition active:scale-[0.98]"
        style={{
          background: open ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${open ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)'}`,
        }}
      >
        {emoji ? (
          <span className="text-[16px] leading-none" aria-hidden>{emoji}</span>
        ) : null}
        <span className="flex-1 text-[14px] font-bold text-slate-200">{label}</span>
        <span className="rounded-full bg-white/10 px-2 py-px text-[10px] font-bold text-slate-400">
          {sessions.length}
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.22 }} className="shrink-0">
          <ChevronDown className="h-4 w-4 text-slate-500" aria-hidden />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <ul className="mb-3 space-y-1.5 pl-1">
              {sessions.map((session) => (
                <li key={session.id}>
                  <SessionRow
                    session={session}
                    isActive={session.id === activeSessionId}
                    onSelect={() => onSelectSession(session as ChatSessionListItemClient)}
                  />
                </li>
              ))}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

/** שורת גלילה אופקית — mobile-first, לא חוסמת גלילה אנכית */
function HorizontalChipRow({ children }: { children: ReactNode }) {
  return (
    <div
      className="-mx-3 overflow-x-auto px-3 pb-0.5"
      style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      <div className="flex w-max min-w-full gap-1.5">{children}</div>
    </div>
  );
}

export function ChatSessionInbox({
  sessions,
  loading,
  activeSessionId,
  onSelectSession,
  onStartNewChat,
  onStartNewChatWithPrefill,
  startingNew,
  firstName,
}: ChatSessionInboxProps) {
  const [tab, setTab] = useState<InboxTab>('new');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFolder, setActiveFolder] = useState<InboxFolderId>('all');
  const [topicsOpen, setTopicsOpen] = useState(false);

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

  const activeTopicChip = topicChips.find((c) => c.id === activeFolder);

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
    <div className="flex h-full min-h-0 flex-col bg-[#0f172a]">
      <InboxTabBar tab={tab} onTab={setTab} historyCount={sessions.length} />

      {tab === 'new' ? (
        <div
          className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center text-center">
            <p className="text-[15px] font-bold text-slate-200">
              {firstName ? `${firstName}, ` : ''}רוצה לדבר?
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
              אלמוג כאן — בקצב שלך, בלי לחץ. התחל שיחה חדשה או בחר נקודת פתיחה.
            </p>
            <button
              type="button"
              disabled={startingNew}
              onClick={onStartNewChat}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-[15px] font-black text-emerald-50 transition active:scale-[0.98] disabled:opacity-60"
              style={greenGlassButtonStyle()}
            >
              {startingNew ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <MessageSquarePlus className="h-5 w-5" />
              )}
              התחל שיחה חדשה
            </button>
            <div className="mt-5 w-full space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">או התחל/י מ...</p>
              {QUICK_STARTERS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  disabled={startingNew}
                  onClick={() => {
                    if (onStartNewChatWithPrefill) {
                      onStartNewChatWithPrefill(chip.text);
                    } else {
                      onStartNewChat();
                    }
                  }}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-[13px] font-semibold text-slate-200 transition active:scale-[0.98] hover:border-emerald-400/25 hover:bg-emerald-500/10 disabled:opacity-60"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div
          className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain px-3 pb-3"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="space-y-2.5 pb-3 pt-2">
            <div className="relative">
              <Search className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                dir="rtl"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="חיפוש בשיחות..."
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2.5 pl-8 pr-9 text-[13px] text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/35"
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
              <HorizontalChipRow>
                {timeChips.map((chip) => {
                  const selected = activeFolder === chip.id;
                  const colors =
                    INBOX_TIME_COLORS[chip.id as keyof typeof INBOX_TIME_COLORS] ??
                    INBOX_TIME_COLORS.all;
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => setActiveFolder(chip.id)}
                      className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition active:scale-[0.97]"
                      style={chipStyle(selected, colors.main, colors.soft, colors.border)}
                    >
                      {chip.label}
                      {chip.count > 0 ? ` · ${chip.count}` : ''}
                    </button>
                  );
                })}
              </HorizontalChipRow>
            ) : null}

            {!trimmedSearch && topicChips.length > 0 ? (
              <div className="rounded-xl border border-white/8 bg-white/[0.02]">
                <button
                  type="button"
                  aria-expanded={topicsOpen}
                  onClick={() => setTopicsOpen((v) => !v)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-right"
                >
                  <span className="flex-1 text-[12px] font-bold text-slate-400">
                    לפי נושא
                    {activeTopicChip ? (
                      <span className="mr-1.5 text-emerald-300/90">
                        · {TOPIC_EMOJIS[activeTopicChip.id] ?? '💬'} {activeTopicChip.label}
                      </span>
                    ) : null}
                  </span>
                  <motion.span animate={{ rotate: topicsOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronDown className="h-4 w-4 text-slate-500" aria-hidden />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {topicsOpen ? (
                    <motion.div
                      key="topics"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden border-t border-white/6"
                    >
                      <div className="px-1 py-2">
                        <HorizontalChipRow>
                          {topicChips.map((chip) => {
                            const selected = activeFolder === chip.id;
                            const accent = chip.accent ?? '#6366f1';
                            return (
                              <button
                                key={chip.id}
                                type="button"
                                onClick={() =>
                                  setActiveFolder(chip.id === activeFolder ? 'all' : chip.id)
                                }
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition active:scale-[0.97]"
                                style={
                                  selected
                                    ? {
                                        background: `${accent}33`,
                                        border: `1px solid ${accent}88`,
                                        color: '#fff',
                                      }
                                    : {
                                        background: 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        color: accent,
                                      }
                                }
                              >
                                <span aria-hidden>{TOPIC_EMOJIS[chip.id] ?? '💬'}</span>
                                {chip.label}
                                <span className="opacity-70">{chip.count}</span>
                              </button>
                            );
                          })}
                        </HorizontalChipRow>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-emerald-400/80" />
              </div>
            ) : sessions.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-slate-400">
                עדיין אין שיחות קודמות. עבור/י לטאב &quot;שיחה חדשה&quot; כדי להתחיל.
              </p>
            ) : groupedSections.length > 0 ? (
              <div className="space-y-1">
                {groupedSections.map((section, idx) => (
                  <AccordionSection
                    key={section.id}
                    id={section.id}
                    label={section.label}
                    accent={section.accent}
                    kind={section.kind}
                    sessions={section.sessions}
                    activeSessionId={activeSessionId}
                    onSelectSession={onSelectSession}
                    defaultOpen={idx === 0}
                  />
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
      )}
    </div>
  );
}
