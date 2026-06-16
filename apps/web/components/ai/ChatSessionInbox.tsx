'use client';

import { Loader2, MessageSquarePlus, ChevronLeft } from 'lucide-react';
import { buildChatSessionListTitle } from '../../lib/ai/chat-sessions/list-sessions';
import { formatSessionRelativeTime } from '../../lib/client/chat-session-messages';
import type { ChatSessionListItemClient } from '../../lib/client/chat-session-api';

type ChatSessionInboxProps = {
  sessions: ChatSessionListItemClient[];
  loading: boolean;
  activeSessionId: string | null;
  onSelectSession: (session: ChatSessionListItemClient) => void;
  onStartNewChat: () => void;
  startingNew: boolean;
};

export function ChatSessionInbox({
  sessions,
  loading,
  activeSessionId,
  onSelectSession,
  onStartNewChat,
  startingNew,
}: ChatSessionInboxProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <button
        type="button"
        disabled={startingNew}
        onClick={onStartNewChat}
        className="mx-3 mb-3 mt-1 flex items-center justify-between gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 text-right backdrop-blur-md transition hover:bg-emerald-500/25 disabled:opacity-60"
        style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)' }}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/25 text-emerald-100">
          {startingNew ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <MessageSquarePlus className="h-5 w-5" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-emerald-50">שיחה חדשה עם אלמוג</span>
          <span className="mt-0.5 block text-xs text-emerald-100/75">שאל, שתף, בנה צעד קטן להיום</span>
        </span>
        <ChevronLeft className="h-4 w-4 shrink-0 text-emerald-200/80" />
      </button>

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
        ) : (
          <ul className="space-y-2">
            {sessions.map((session) => {
              const title = buildChatSessionListTitle(session);
              const subtitle =
                session.summary && session.preview_text && session.status === 'closed'
                  ? session.preview_text
                  : session.preview_text && session.preview_text !== title
                    ? session.preview_text
                    : session.message_count > 0
                      ? `${session.message_count} הודעות`
                      : 'שיחה ריקה';
              const isActive = session.id === activeSessionId;
              const isOpen = session.status === 'open';

              return (
                <li key={session.id}>
                  <button
                    type="button"
                    onClick={() => onSelectSession(session)}
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
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
