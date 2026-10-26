'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, Loader2, Lock, MessageSquarePlus, Search, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { RetypingTitle } from './RetypingTitle';
import { closeReasonLabel } from '../../lib/ai/chat-sessions/close-reason';
import { CHAT_TOPIC_ORDER, detectSessionTopic } from '../../lib/client/chat-session-topics';
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
import { greenGlassButtonStyle, chipStyle, glassTint, INBOX_TIME_COLORS } from '../../lib/client/chat-inbox-colors';
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
      className="shrink-0 border-b border-primary-400/10 bg-[#0f172a] px-3 pb-3 pt-2"
      role="tablist"
      aria-label="ניווט שיחות"
    >
      <div className="flex gap-1 rounded-xl bg-background-card/5 p-1">
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
                active ? 'bg-primary-600 text-on-dark shadow-md shadow-primary-900/30' : 'text-ink-400'
              }`}
            >
              {item.label}
              {item.badge != null && item.badge > 0 ? (
                <span
                  className={`rounded-full px-1.5 py-px text-[10px] font-black ${
                    active ? 'bg-background-card/25 text-on-dark' : 'bg-background-card/10 text-ink-300'
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
  const isProfileUpdate = session.session_kind === 'profile_update';
  const title = titleForSession(session);
  const preview =
    session.preview_text && session.preview_text !== title
      ? session.preview_text
      : session.summary && session.summary !== title
        ? session.summary
        : null;
  const isOpen = session.status === 'open';
  const topic = CHAT_TOPIC_ORDER.find((m) => m.id === detectSessionTopic(session, title));

  if (isProfileUpdate) {
    return (
      <div
        className="w-full rounded-xl border px-3 py-2.5 text-start opacity-90"
        style={{
          borderColor: 'rgba(251,191,36,0.25)',
          background: 'rgba(251,191,36,0.06)',
        }}
      >
        <div className="flex items-start gap-2">
          <Lock className="mt-1 h-3.5 w-3.5 shrink-0 text-accent-400/90" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="line-clamp-2 text-[12px] font-semibold text-accent-100/95">
                {session.summary ?? title}
              </span>
              <span className="shrink-0 text-[10px] text-ink-500">
                {formatSessionRelativeTime(session.updated_at)}
              </span>
            </span>
            <span className="mt-0.5 block text-[10px] text-accent-200/70">
              תיעוד עדכון פרופיל · סגור · ללא פרטים אישיים
            </span>
          </span>
        </div>
      </div>
    );
  }

  const accent = topic?.accent ?? '#64748b';
  const emoji = TOPIC_EMOJIS[topic?.id ?? 'general'] ?? '💬';

  return (
    <button
      type="button"
      onClick={onSelect}
      className="relative w-full overflow-hidden rounded-2xl px-3 py-2.5 text-start transition active:scale-[0.99]"
      style={{
        background: `linear-gradient(135deg, ${glassTint(accent, isActive ? 0.24 : 0.14)} 0%, ${glassTint(accent, 0.04)} 70%)`,
        border: `1px solid ${glassTint(accent, isActive ? 0.55 : 0.22)}`,
        boxShadow: isActive ? `0 6px 20px ${glassTint(accent, 0.25)}` : undefined,
      }}
    >
      <span aria-hidden className="absolute inset-y-2 inset-s-0 w-[3px] rounded-full" style={{ background: accent }} />
      <div className="flex items-start gap-2.5">
        <span
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[17px] leading-none"
          style={{ background: glassTint(accent, 0.22), boxShadow: `inset 0 0 0 1px ${glassTint(accent, 0.35)}` }}
          aria-hidden
        >
          {emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <RetypingTitle text={title} className="line-clamp-1 text-[13.5px] font-bold text-ink-50" />
            <span className="shrink-0 text-[10px] text-ink-400">
              {formatSessionRelativeTime(session.updated_at)}
            </span>
          </span>
          {preview ? (
            <span className="mt-0.5 line-clamp-1 text-[11.5px] text-ink-300/80">{preview}</span>
          ) : null}
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {topic ? (
              <span
                className="inline-flex rounded-full px-2 py-[1px] text-[10px] font-bold"
                style={{ background: glassTint(accent, 0.2), color: accent }}
              >
                {topic.label}
              </span>
            ) : null}
            {isOpen ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-500/15 px-2 py-[1px] text-[10px] font-bold text-primary-300">
                <span className="h-1.5 w-1.5 rounded-full bg-primary-400" aria-hidden />
                פתוחה
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-ink-400/10 px-2 py-[1px] text-[10px] font-semibold text-ink-400">
                <Lock className="h-2.5 w-2.5" aria-hidden />
                {closeReasonLabel(session.close_reason)}
              </span>
            )}
          </span>
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
  const tone =
    accent ??
    (INBOX_TIME_COLORS[id as keyof typeof INBOX_TIME_COLORS]?.main ?? '#10b981');

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mb-2 flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-start transition active:scale-[0.98]"
        style={{
          background: `linear-gradient(90deg, ${glassTint(tone, open ? 0.3 : 0.18)} 0%, ${glassTint(tone, 0.06)} 100%)`,
          border: `1px solid ${glassTint(tone, open ? 0.45 : 0.25)}`,
        }}
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[16px] leading-none"
          style={{ background: tone, boxShadow: `0 4px 12px ${glassTint(tone, 0.4)}` }}
          aria-hidden
        >
          {emoji ?? <span className="h-2.5 w-2.5 rounded-full bg-glass/90 backdrop-blur-md" />}
        </span>
        <span className="flex-1 text-[14px] font-black text-on-dark">{label}</span>
        <span
          className="rounded-full px-2 py-px text-[11px] font-black"
          style={{ background: glassTint(tone, 0.3), color: '#f2f2f6' }}
        >
          {sessions.length}
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.22 }} className="shrink-0">
          <ChevronDown className="h-4 w-4 text-on-dark/70" aria-hidden />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] as const }}
            className="overflow-hidden"
          >
            <ul className="mb-3 space-y-2 pe-1">
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
  const [topicsOpen, setTopicsOpen] = useState(true);

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
            <p className="text-[15px] font-bold text-ink-200">
              {firstName ? `${firstName}, ` : ''}רוצה לדבר?
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-400">
              אלמוג כאן — בקצב שלך, בלי לחץ. התחל שיחה חדשה או בחר נקודת פתיחה.
            </p>
            <button
              type="button"
              disabled={startingNew}
              onClick={onStartNewChat}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-[15px] font-black text-primary-50 transition active:scale-[0.98] disabled:opacity-60"
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
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink-500">או להתחיל מ...</p>
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
                  className="w-full rounded-xl border border-primary-400/15 bg-background-card/4 px-3 py-3 text-[13px] font-semibold text-ink-200 transition active:scale-[0.98] hover:border-primary-400/25 hover:bg-primary-500/10 disabled:opacity-60"
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
              <Search className="pointer-events-none absolute inset-s-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
              <input
                type="search"
                dir="rtl"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="חיפוש בשיחות..."
                className="w-full rounded-xl border border-primary-400/15 bg-background-card/4 py-2.5 pe-8 ps-9 text-[13px] text-on-dark outline-hidden placeholder:text-ink-500 focus:border-primary-400/35"
              />
              {searchQuery ? (
                <button
                  type="button"
                  aria-label="נקה חיפוש"
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-e-2 top-1/2 -translate-y-1/2 text-ink-400 hover:text-on-dark"
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
              <div className="rounded-xl border border-on-dark/5 bg-background-card/2">
                <button
                  type="button"
                  aria-expanded={topicsOpen}
                  onClick={() => setTopicsOpen((v) => !v)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-start"
                >
                  <span className="flex-1 text-[12px] font-bold text-ink-400">
                    לפי נושא
                    {activeTopicChip ? (
                      <span className="ms-1.5 text-primary-300/90">
                        · {TOPIC_EMOJIS[activeTopicChip.id] ?? '💬'} {activeTopicChip.label}
                      </span>
                    ) : null}
                  </span>
                  <motion.span animate={{ rotate: topicsOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronDown className="h-4 w-4 text-ink-500" aria-hidden />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {topicsOpen ? (
                    <motion.div
                      key="topics"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] as const }}
                      className="overflow-hidden border-t border-on-dark/5"
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
                                        color: '#f2f2f6',
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
                <Loader2 className="h-5 w-5 animate-spin text-primary-400/80" />
              </div>
            ) : sessions.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-ink-400">
                עדיין אין שיחות קודמות. אפשר לעבור לטאב &quot;שיחה חדשה&quot; כדי להתחיל.
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
              <p className="py-8 text-center text-[13px] text-ink-400">לא נמצאו שיחות.</p>
            ) : (
              <ul className="space-y-1.5">
                {trimmedSearch ? (
                  <li className="mb-1 px-0.5 text-[11px] text-ink-500">
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
