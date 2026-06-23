'use client';

import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { BellRing, MessageCircle, Send, Loader2, X, RotateCcw, PlusCircle, LogOut, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { Drawer } from 'vaul';
import { useChat } from '@ai-sdk/react';
import { MemorySearchIndicator } from './MemorySearchIndicator';
import { messagesHavePendingRecallTool } from '../../lib/ai/memory-recall/detect-pending-recall';
import {
  extractDisplayTextFromChatMessage,
  type ChatDisplayMessage,
} from '../../lib/client/chat-message-display';
import { NuraWellChatTransport } from '../../lib/client/nurawell-chat-transport';
import { ALMOG_AVATAR_FALLBACK } from '../../lib/ai/almog-avatar';
import { useAlmogAvatarUrl } from '../../lib/client/useAlmogAvatarUrl';
import { useChatBackground } from '../../lib/client/useChatBackground';
import { getPersonalGreeting } from '../../lib/time/greeting';
import {
  OPEN_ALMOG_CHAT_EVENT,
  type OpenAlmogChatDetail,
} from '../../lib/notifications/open-almog-chat';
import { taskReportHintToPayload, type TaskReportHint } from '../../lib/ai/task-report-hint';
import { ChatSessionInbox } from './ChatSessionInbox';
import { AiChatPrivacyNotice } from './AiChatPrivacyNotice';
import {
  autoCloseStaleChatSessionsApi,
  closeChatSessionApi,
  createNewChatSession,
  fetchChatSession,
  fetchChatSessionMessages,
  fetchChatSessionsList,
  reopenChatSessionApi,
  type ChatSessionClientState,
  type ChatSessionListItemClient,
} from '../../lib/client/chat-session-api';
import { transcriptTurnsToUiMessages } from '../../lib/client/chat-session-messages';
import {
  AWAITING_ASSISTANT_POLL_MS,
  AWAITING_ASSISTANT_RESUME_MS,
  clearPendingChatReply,
  isAwaitingAssistantResponse,
  readPendingChatReply,
  writePendingChatReply,
} from '../../lib/client/chat-awaiting-assistant';
import {
  clearChatInputDraft,
  migrateChatInputDraft,
  readChatInputDraft,
  writeChatInputDraft,
} from '../../lib/client/chat-input-draft';

const SESSION_STORAGE_KEY = 'nurawell_almog_chat_session';

function markChatSendStarted(sessionId: string | null) {
  if (!sessionId) return;
  writePendingChatReply(sessionId);
}

const MICRO_WIN_QUICK_STARTERS = [
  {
    label: 'בוא נתחיל מחדש — כוס מים 💧',
    text: 'בוא נתחיל מחדש — רק כוס מים אחת. אני איתך.',
    markWaterHabit: true,
  },
  {
    label: 'קצת קשה לי היום',
    text: 'קצת קשה לי היום, בלי ביקורת — מה הכי קטן שאפשר לעשות עכשיו?',
    markWaterHabit: false,
  },
] as const;

async function postMicroWinHabit(): Promise<{ ok: boolean; habitTitle?: string }> {
  try {
    const res = await fetch('/api/v1/ai/micro-win', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = (await res.json()) as { ok?: boolean; habit_title?: string };
    return { ok: res.ok && data.ok === true, habitTitle: data.habit_title };
  } catch {
    return { ok: false };
  }
}

function getMessageText(msg: ChatDisplayMessage): string {
  return extractDisplayTextFromChatMessage(msg);
}

function getMessageCreatedAt(msg: unknown): Date {
  const raw = (msg as { createdAt?: unknown }).createdAt;
  if (raw instanceof Date) return raw;
  if (typeof raw === 'string') {
    const parsed = new Date(raw);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  return new Date();
}

type MessageBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: Array<{ kind: 'bullet' | 'numbered'; text: string; number?: string }> };

function parseMessageBlocks(text: string): MessageBlock[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: MessageBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i] ?? '';
    const line = raw.trim();

    if (!line) {
      i += 1;
      continue;
    }

    const bulletMatch = line.match(/^[-*•]\s+(.+)$/);
    const numberedMatch = line.match(/^(\d+)[\.\)]\s+(.+)$/);

    if (bulletMatch || numberedMatch) {
      const listItems: Array<{ kind: 'bullet' | 'numbered'; text: string; number?: string }> = [];

      while (i < lines.length) {
        const itemRaw = (lines[i] ?? '').trim();
        const bulletItem = itemRaw.match(/^[-*•]\s+(.+)$/);
        const numberedItem = itemRaw.match(/^(\d+)[\.\)]\s+(.+)$/);
        if (!bulletItem && !numberedItem) break;

        if (numberedItem) {
          listItems.push({ kind: 'numbered', text: numberedItem[2].trim(), number: numberedItem[1] });
        } else if (bulletItem) {
          listItems.push({ kind: 'bullet', text: bulletItem[1].trim() });
        }
        i += 1;
      }

      if (listItems.length) {
        blocks.push({ type: 'list', items: listItems });
        continue;
      }
    }

    const paragraphLines: string[] = [];
    while (i < lines.length) {
      const paragraphRaw = lines[i] ?? '';
      const paragraphLine = paragraphRaw.trim();
      if (!paragraphLine) {
        i += 1;
        break;
      }
      if (/^[-*•]\s+(.+)$/.test(paragraphLine) || /^(\d+)[\.\)]\s+(.+)$/.test(paragraphLine)) {
        break;
      }
      paragraphLines.push(paragraphRaw);
      i += 1;
    }

    if (paragraphLines.length) {
      blocks.push({ type: 'paragraph', text: paragraphLines.join('\n').trim() });
    } else {
      i += 1;
    }
  }

  return blocks;
}

/**
 * הדגשות בתוך טקסט. אלמוג (וגם הפרומפט עצמו) מסמן הדגשה בכוכבית *בודדת*,
 * לא רק בכפולה — אז מטפלים בשלושת הצורות: `**חזק**`, `__חזק__`, ו-`*הדגשה*`.
 * העיצוב: "זכוכית" עדינה ומשולבת — שכבת לבן שקופה קלה עם blur ומסגרת רכה,
 * כך שזה בולט בעדינות בלי לנגוד את צבע הבועה (במיוחד הבועה הירוקה של אלמוג).
 * הכוכבית/הקו-תחתון עצמם אף פעם לא מוצגים למשתמש.
 */
function renderInlineStyledText(text: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*)/g);
  return tokens
    .filter(Boolean)
    .map((token, index) => {
      const isStrong =
        (token.startsWith('**') && token.endsWith('**') && token.length > 4) ||
        (token.startsWith('__') && token.endsWith('__') && token.length > 4);
      const isEmphasis =
        !isStrong && token.startsWith('*') && token.endsWith('*') && token.length > 2;

      if (isStrong || isEmphasis) {
        const clean = token.replace(/^(\*\*|__|\*)/, '').replace(/(\*\*|__|\*)$/, '').trim();
        if (!clean) return <Fragment key={`txt-${index}`}>{token}</Fragment>;
        if (isStrong) {
          // הדגשה חזקה: "מרקר" עדין עם קו-תחתון מואר וזוהר רך — בולט נקי בלי קופסה כבדה.
          return (
            <span
              key={`hl-${index}`}
              className="mx-[1px] rounded-[5px] px-1 font-extrabold"
              style={{
                color: '#ffffff',
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.16) 55%, rgba(255,255,255,0.04) 100%)',
                boxShadow:
                  'inset 0 -0.5em 0 rgba(255,255,255,0.14), 0 1px 0 rgba(255,255,255,0.25)',
                textShadow: '0 1px 2px rgba(2,6,23,0.25)',
              }}
            >
              {clean}
            </span>
          );
        }
        // הדגשה רכה: משקל בינוני + קו-תחתון דק כמו סימון עט, בלי רקע.
        return (
          <span
            key={`hl-${index}`}
            className="font-semibold"
            style={{
              color: '#ffffff',
              borderBottom: '1.5px solid rgba(255,255,255,0.4)',
              paddingBottom: '0.5px',
            }}
          >
            {clean}
          </span>
        );
      }
      return <Fragment key={`txt-${index}`}>{token}</Fragment>;
    });
}

function renderAlmogMessage(text: string): ReactNode {
  const blocks = parseMessageBlocks(text);
  const listAccentPalette = [
    { from: '#10b981', to: '#059669', text: '#ecfdf5', glow: 'rgba(16,185,129,0.35)' },
    { from: '#14b8a6', to: '#0f766e', text: '#f0fdfa', glow: 'rgba(20,184,166,0.35)' },
    { from: '#22c55e', to: '#15803d', text: '#f0fdf4', glow: 'rgba(34,197,94,0.3)' },
    { from: '#34d399', to: '#047857', text: '#ecfdf5', glow: 'rgba(52,211,153,0.32)' },
  ];
  return (
    <div className="space-y-2.5">
      {blocks.map((block, blockIndex) => {
        if (block.type === 'paragraph') {
          return (
            <p key={`p-${blockIndex}`} className="whitespace-pre-wrap leading-7">
              {renderInlineStyledText(block.text)}
            </p>
          );
        }

        return (
          <div
            key={`l-${blockIndex}`}
            className="rounded-xl border border-white/20 bg-white/10 px-3 py-2"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)' }}
          >
            <ul className="m-0 list-none space-y-2 p-0">
              {block.items.map((item, itemIndex) => (
                <li
                  key={`li-${blockIndex}-${itemIndex}`}
                  className="flex items-start gap-2.5 border-b border-white/15 pb-2 last:border-b-0 last:pb-0"
                >
                  {(() => {
                    const accent = listAccentPalette[itemIndex % listAccentPalette.length];
                    return (
                  <span
                    className="mt-1 inline-flex h-6 min-w-[1.65rem] items-center justify-center rounded-full px-1.5 text-[11px] font-extrabold tracking-tight"
                    style={{
                      background: `linear-gradient(145deg, ${accent.from}, ${accent.to})`,
                      color: accent.text,
                      border: '1px solid rgba(255,255,255,0.45)',
                      boxShadow: `0 6px 14px ${accent.glow}, inset 0 1px 0 rgba(255,255,255,0.38)`,
                    }}
                  >
                    {item.kind === 'numbered' ? item.number : '•'}
                  </span>
                    );
                  })()}
                  <span className="flex-1 leading-7">{renderInlineStyledText(item.text)}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function formatHebrewTime(dateLike: Date | string | undefined): string {
  const date = dateLike ? new Date(dateLike) : new Date();
  return new Intl.DateTimeFormat('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function AlmogChatTypingDots() {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-2 w-2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.45)]"
          animate={{ y: [0, -5, 0], opacity: [0.35, 1, 0.35] }}
          transition={{ duration: 0.75, repeat: Infinity, ease: 'easeInOut', delay: i * 0.14 }}
        />
      ))}
    </span>
  );
}

function typingEllipsis(step: number): string {
  const frames = ['.', '..', '...'];
  return frames[step % frames.length] ?? '.';
}

/**
 * סטטוסים טבעיים ואנושיים שאלמוג "חושב/קורא/מנסח" — מתקדמים לפי זמן ההמתנה
 * כדי שהמשתמש לא ישתעמם בזמן שהמודל חושב (reasoning מוסיף השהיה לפני התו הראשון).
 * נשמע כמו חבר אמיתי, לא כמו ספינר טכני.
 */
const ALMOG_STATUS_PHRASES: readonly string[] = [
  'אלמוג קורא מה שכתבת',
  'הוא רגע מחבר את זה אליך',
  'אלמוג מנסח לך תשובה מדויקת',
  'זה לוקח עוד רגע כי הוא לא רוצה לזרוק תשובה סתם',
  'אלמוג עדיין איתך — הוא מסדר את זה לצעד שאפשר לעשות',
];

/** ספי הזמן (ms) למעבר בין הסטטוסים. */
const ALMOG_STATUS_THRESHOLDS_MS: readonly number[] = [1500, 4500, 9000, 15000];

/** ציטוט ווטסאפ בתוך בועת הודעה */
function WhatsAppQuote({ author, text }: { author: string; text: string }) {
  return (
    <div
      className="mb-2 rounded-xl bg-black/20 px-2.5 py-2 text-[13px] leading-snug backdrop-blur-sm"
      style={{ borderInlineStart: '3px solid rgba(52,211,153,0.85)' }}
    >
      <p className="text-[10px] font-bold text-emerald-200">{author}</p>
      <p className="line-clamp-4 whitespace-pre-wrap text-slate-200/95">{text}</p>
    </div>
  );
}

function ChatSessionClosingOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-t-[28px] bg-slate-950/55 px-6 backdrop-blur-md"
      role="status"
      aria-live="polite"
      aria-label="סוגר שיחה ושומר זיכרון"
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-500/15 shadow-[0_8px_32px_rgba(16,185,129,0.2)]"
        style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)' }}
      >
        <Loader2 className="h-7 w-7 animate-spin text-emerald-200" />
      </div>
      <div className="max-w-[260px] text-center">
        <p className="text-sm font-bold text-white" style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}>
          סוגרים את השיחה
        </p>
        <p className="mt-1 text-xs leading-relaxed text-emerald-100/80">
          אלמוג מסכם, שומר זיכרונות חשובים ומעדכן את מה שיודע עליך — רגע קטן.
        </p>
      </div>
    </div>
  );
}

function ThreadStatusPill({
  status,
  children,
}: {
  status: 'online' | 'typing' | 'thinking' | 'closed' | 'offline';
  children: ReactNode;
}) {
  const palette = {
    online: {
      bg: 'linear-gradient(135deg, rgba(16,185,129,0.45), rgba(52,211,153,0.28))',
      border: 'rgba(110,231,183,0.55)',
      dot: '#6ee7b7',
      text: '#ecfdf5',
    },
    typing: {
      bg: 'linear-gradient(135deg, rgba(6,182,212,0.42), rgba(34,211,238,0.22))',
      border: 'rgba(34,211,238,0.5)',
      dot: '#67e8f9',
      text: '#ecfeff',
    },
    thinking: {
      bg: 'linear-gradient(135deg, rgba(245,158,11,0.42), rgba(251,191,36,0.22))',
      border: 'rgba(251,191,36,0.52)',
      dot: '#fcd34d',
      text: '#fffbeb',
    },
    closed: {
      bg: 'linear-gradient(135deg, rgba(100,116,139,0.42), rgba(148,163,184,0.22))',
      border: 'rgba(148,163,184,0.48)',
      dot: '#94a3b8',
      text: '#f8fafc',
    },
    offline: {
      bg: 'linear-gradient(135deg, rgba(244,63,94,0.38), rgba(251,113,133,0.2))',
      border: 'rgba(251,113,133,0.48)',
      dot: '#fb7185',
      text: '#fff1f2',
    },
  } as const;
  const s = palette[status];
  const pulsing = status === 'typing' || status === 'thinking';

  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold"
      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.text }}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${pulsing ? 'animate-pulse' : ''}`}
        style={{ background: s.dot, boxShadow: pulsing ? `0 0 6px ${s.dot}` : undefined }}
      />
      <span className="truncate">{children}</span>
    </span>
  );
}

function threadStatusLabel(
  showLoading: boolean,
  isThinking: boolean,
  online: boolean,
  isSessionClosed: boolean,
  almogStatusText: string,
  typingStep: number
): { status: 'online' | 'typing' | 'thinking' | 'closed' | 'offline'; label: string } {
  if (showLoading) {
    return isThinking
      ? { status: 'thinking', label: `${almogStatusText}${typingEllipsis(typingStep)}` }
      : { status: 'typing', label: `מקליד${typingEllipsis(typingStep)}` };
  }
  if (!online) return { status: 'offline', label: 'בלי חיבור' };
  if (isSessionClosed) return { status: 'closed', label: 'שיחה נסגרה' };
  return { status: 'online', label: 'זמין עכשיו' };
}

function ThreadHeaderIconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-white backdrop-blur-md transition hover:border-white/18 hover:bg-white/[0.12] active:scale-95 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export interface AIChatWidgetProps {
  userId: string;
  firstName?: string;
}

export function AIChatWidget({ userId, firstName }: AIChatWidgetProps) {
  const { avatarUrl: avatarSrc } = useAlmogAvatarUrl();
  const { url: bgUrl, hasPhoto } = useChatBackground();
  const greeting = getPersonalGreeting();
  const displayName = firstName?.trim() || '';
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState(true);
  const [input, setInput] = useState('');
  const [typingStep, setTypingStep] = useState(0);
  const [statusIdx, setStatusIdx] = useState(0);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [notifyWhenReady, setNotifyWhenReady] = useState(false);
  const [answerReadyToast, setAnswerReadyToast] = useState(false);
  const [hasBackgroundAnswer, setHasBackgroundAnswer] = useState(false);
  const [notificationContext, setNotificationContext] = useState<OpenAlmogChatDetail | null>(null);
  const [quotedReply, setQuotedReply] = useState<{ mentorMessage: string; userReply: string } | null>(
    null
  );
  const sessionIdRef = useRef<string | null>(null);
  const [chatSession, setChatSession] = useState<ChatSessionClientState | null>(null);
  const [sessionActionLoading, setSessionActionLoading] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [panelView, setPanelView] = useState<'inbox' | 'thread'>('inbox');
  const [sessionList, setSessionList] = useState<ChatSessionListItemClient[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [awaitingAssistantRecovery, setAwaitingAssistantRecovery] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const resumeAssistantAttemptedRef = useRef(false);
  const notificationIdRef = useRef<string | null>(null);
  const taskReportHintRef = useRef<TaskReportHint | null>(null);
  const pendingInitialReplyRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wasLoadingRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (s) sessionIdRef.current = s;
      setInput(readChatInputDraft(sessionIdRef.current));
    } catch {
      /* */
    }
  }, []);

  const refreshSessionList = async () => {
    setSessionsLoading(true);
    try {
      await autoCloseStaleChatSessionsApi().catch(() => ({ closedSessionIds: [] }));
      const sessions = await fetchChatSessionsList();
      setSessionList(sessions);
    } catch {
      setSessionList([]);
    } finally {
      setSessionsLoading(false);
    }
  };

  const refreshChatSession = async (sessionId: string | null) => {
    if (!sessionId) {
      setChatSession(null);
      return;
    }
    try {
      await autoCloseStaleChatSessionsApi().catch(() => ({ closedSessionIds: [] }));
      const row = await fetchChatSession(sessionId);
      setChatSession(row ?? { id: sessionId, status: 'open', summary: null });
    } catch {
      setChatSession({ id: sessionId, status: 'open', summary: null });
    }
  };

  const applySessionId = (sessionId: string) => {
    sessionIdRef.current = sessionId;
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    } catch {
      /* */
    }
  };

  useEffect(() => {
    if (!open) return;
    void refreshSessionList();
    if (panelView === 'thread') {
      void refreshChatSession(sessionIdRef.current);
    }
  }, [open, panelView]);

  useEffect(() => {
    if (!open) return;
    const tick = () => {
      void refreshSessionList();
      if (panelView === 'thread' && sessionIdRef.current) {
        void refreshChatSession(sessionIdRef.current);
      }
    };
    const id = window.setInterval(tick, 5 * 60_000);
    return () => window.clearInterval(id);
  }, [open, panelView]);

  const isSessionClosed = chatSession?.status === 'closed';

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    const onOpenChat = (e: Event) => {
      setOpen(true);
      const detail = (e as CustomEvent<OpenAlmogChatDetail>).detail;
      if (detail?.notificationId && detail.mentorMessage) {
        setPanelView('thread');
        setNotificationContext(detail);
        notificationIdRef.current = detail.notificationId;
        taskReportHintRef.current = null;
        if (detail.initialReply?.trim()) {
          pendingInitialReplyRef.current = detail.initialReply.trim();
          setQuotedReply({
            mentorMessage: detail.mentorMessage,
            userReply: detail.initialReply.trim(),
          });
        } else {
          pendingInitialReplyRef.current = null;
          setQuotedReply(null);
        }
      } else {
        setNotificationContext(null);
        setQuotedReply(null);
        notificationIdRef.current = null;
        pendingInitialReplyRef.current = null;
        taskReportHintRef.current = detail?.taskReportHint ?? null;
        const prefill = detail?.prefillText?.trim();
        if (prefill) {
          setPanelView('thread');
          setInput(prefill);
          writeChatInputDraft(sessionIdRef.current, prefill);
        }
      }
    };
    window.addEventListener(OPEN_ALMOG_CHAT_EVENT, onOpenChat);
    return () => window.removeEventListener(OPEN_ALMOG_CHAT_EVENT, onOpenChat);
  }, []);

  const buildOutgoingChatBody = useCallback(() => {
    const hint = taskReportHintRef.current;
    return {
      user_id: userId,
      session_id: sessionIdRef.current ?? undefined,
      notification_id: notificationIdRef.current ?? undefined,
      ...(hint ? { task_report_hint: taskReportHintToPayload(hint) } : {}),
    };
  }, [userId]);

  const clearTaskReportHintAfterSend = () => {
    taskReportHintRef.current = null;
  };

  const [memoryRecallWriterActive, setMemoryRecallWriterActive] = useState(false);

  const fetchWithSession = useMemo(() => {
    return async (url: RequestInfo | URL, init?: RequestInit) => {
      const res = await fetch(url, init);
      const sid = res.headers.get('x-session-id');
      const dbg = res.headers.get('x-debug-id');
      const writer = res.headers.get('x-ai-writer');
      const model = res.headers.get('x-ai-model');
      if (writer === 'memory-recall-tools') {
        setMemoryRecallWriterActive(true);
      }
      if (sid) {
        const previousSessionId = sessionIdRef.current;
        if (previousSessionId !== sid) {
          migrateChatInputDraft(previousSessionId, sid);
        }
        sessionIdRef.current = sid;
        try {
          sessionStorage.setItem(SESSION_STORAGE_KEY, sid);
        } catch {
          /* */
        }
        void refreshChatSession(sid);
      }
      if (!res.ok && dbg) {
        console.error('[ai/chat client] request failed', {
          status: res.status,
          debug_id: dbg,
          debug_stage: res.headers.get('x-debug-stage'),
        });
      } else if (writer && writer !== 'primary') {
        console.info('[ai/chat client] non-primary writer used', {
          writer,
          model,
          debug_id: dbg,
        });
      }
      return res;
    };
  }, []);

  const { messages, setMessages, sendMessage, status, stop, error } = useChat({
    transport: new NuraWellChatTransport({
      api: '/api/v1/ai/chat',
      fetch: fetchWithSession,
      body: () => buildOutgoingChatBody(),
    }),
  });

  useEffect(() => {
    if (!open) return;
    const pending = readPendingChatReply();
    if (!pending?.sessionId) return;
    if (panelView === 'thread' && sessionIdRef.current === pending.sessionId) return;

    applySessionId(pending.sessionId);
    setPanelView('thread');
    setLoadingThread(true);
    void fetchChatSessionMessages(pending.sessionId)
      .then(({ session, messages: turns, awaiting_assistant }) => {
        setChatSession(session);
        setMessages(transcriptTurnsToUiMessages(turns));
        if (awaiting_assistant ?? isAwaitingAssistantResponse(turns)) {
          setAwaitingAssistantRecovery(true);
        }
        setInput(readChatInputDraft(pending.sessionId));
      })
      .catch(() => {
        /* */
      })
      .finally(() => {
        setLoadingThread(false);
      });
  }, [open, panelView, setMessages]);

  const openSessionThread = async (session: ChatSessionListItemClient) => {
    setLoadingThread(true);
    setPanelView('thread');
    setSummaryExpanded(false);
    resumeAssistantAttemptedRef.current = false;
    try {
      applySessionId(session.id);
      const { session: row, messages: turns, awaiting_assistant } =
        await fetchChatSessionMessages(session.id);
      setChatSession(row);
      setMessages(
        transcriptTurnsToUiMessages(
          turns.map((t) => ({
            role: t.role,
            content: t.content,
            created_at: t.created_at,
          }))
        )
      );
      setAwaitingAssistantRecovery(
        awaiting_assistant ?? isAwaitingAssistantResponse(turns)
      );
      setInput(readChatInputDraft(session.id));
    } catch {
      setChatSession({
        id: session.id,
        status: session.status,
        summary: session.summary,
      });
      setAwaitingAssistantRecovery(false);
    } finally {
      setLoadingThread(false);
    }
  };

  const goToInbox = () => {
    if (!notifyWhenReady) stop();
    setPanelView('inbox');
    void refreshSessionList();
  };

  const startNewChatSession = async (prefill?: string) => {
    setSessionActionLoading(true);
    try {
      const created = await createNewChatSession();
      applySessionId(created.id);
      setChatSession(created);
      setMessages([]);
      clearChatInputDraft(created.id);
      setInput(prefill ?? '');
      if (prefill?.trim()) {
        writeChatInputDraft(created.id, prefill);
      }
      setQuotedReply(null);
      setNotificationContext(null);
      notificationIdRef.current = null;
      setPanelView('thread');
      void refreshSessionList();
    } finally {
      setSessionActionLoading(false);
    }
  };

  const handleEndChatSession = async () => {
    const sid = sessionIdRef.current;
    if (!sid || sessionActionLoading || isClosing) return;
    setIsClosing(true);
    setSessionActionLoading(true);
    try {
      const result = await closeChatSessionApi(sid);
      setChatSession(result.session);
      void refreshSessionList();
    } finally {
      setIsClosing(false);
      setSessionActionLoading(false);
    }
  };

  const handleReopenChatSession = async () => {
    const sid = sessionIdRef.current;
    if (!sid || sessionActionLoading) return;
    setSessionActionLoading(true);
    try {
      const reopened = await reopenChatSessionApi(sid);
      setChatSession(reopened);
    } finally {
      setSessionActionLoading(false);
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, status, open]);

  useEffect(() => {
    const text = pendingInitialReplyRef.current;
    if (!open || !text || status === 'submitted' || status === 'streaming') return;
    pendingInitialReplyRef.current = null;
    const replyNotificationId = notificationIdRef.current;
    markChatSendStarted(sessionIdRef.current);
    sendMessage(
      { text },
      {
        body: buildOutgoingChatBody(),
      }
    );
    clearTaskReportHintAfterSend();
    setNotificationContext(null);
    notificationIdRef.current = null;
  }, [open, sendMessage, status, userId, buildOutgoingChatBody]);

  const isLoading = status === 'submitted' || status === 'streaming';
  const showLoading = isLoading || awaitingAssistantRecovery;
  const isThinking = status === 'submitted' || (awaitingAssistantRecovery && !isLoading);
  const pendingRecallTool = useMemo(
    () => messagesHavePendingRecallTool(messages),
    [messages]
  );
  const streamingAssistantText = useMemo(() => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant) return '';
    return extractDisplayTextFromChatMessage(lastAssistant as ChatDisplayMessage);
  }, [messages]);
  const showMemorySearch =
    isLoading &&
    streamingAssistantText.length === 0 &&
    (pendingRecallTool || (memoryRecallWriterActive && isThinking));
  useEffect(() => {
    if (!isLoading) setMemoryRecallWriterActive(false);
  }, [isLoading]);

  useEffect(() => {
    if (!awaitingAssistantRecovery) return;
    if (isLoading) {
      setAwaitingAssistantRecovery(false);
    }
  }, [awaitingAssistantRecovery, isLoading]);

  useEffect(() => {
    if (!isLoading && !awaitingAssistantRecovery) {
      clearPendingChatReply();
      resumeAssistantAttemptedRef.current = false;
    }
  }, [isLoading, awaitingAssistantRecovery]);

  useEffect(() => {
    if (!awaitingAssistantRecovery || isLoading || panelView !== 'thread') return;
    const sid = sessionIdRef.current;
    if (!sid) return;

    let cancelled = false;
    const pending = readPendingChatReply();
    const startedAt = pending?.startedAt
      ? new Date(pending.startedAt).getTime()
      : Date.now();

    const poll = async () => {
      if (cancelled) return;
      try {
        const { session, messages: turns, awaiting_assistant } =
          await fetchChatSessionMessages(sid);
        if (cancelled) return;
        setChatSession(session);
        if (!(awaiting_assistant ?? isAwaitingAssistantResponse(turns))) {
          setMessages(transcriptTurnsToUiMessages(turns));
          setAwaitingAssistantRecovery(false);
          clearPendingChatReply();
          return;
        }
        const elapsed = Date.now() - startedAt;
        if (
          elapsed >= AWAITING_ASSISTANT_RESUME_MS &&
          !resumeAssistantAttemptedRef.current
        ) {
          resumeAssistantAttemptedRef.current = true;
          const lastUser = [...turns].reverse().find((t) => t.role === 'user');
          if (lastUser?.content.trim()) {
            sendMessage(
              { text: lastUser.content },
              {
                body: {
                  user_id: userId,
                  session_id: sid,
                  resume_assistant: true,
                },
              }
            );
          }
        }
      } catch {
        /* */
      }
    };

    void poll();
    const id = window.setInterval(() => void poll(), AWAITING_ASSISTANT_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [awaitingAssistantRecovery, isLoading, panelView, sendMessage, setMessages, userId]);
  const isLongWait = isThinking && waitSeconds >= 15;
  useEffect(() => {
    if (!showLoading) {
      setTypingStep(0);
      return;
    }
    const id = window.setInterval(() => {
      setTypingStep((s) => (s + 1) % 3);
    }, 420);
    return () => window.clearInterval(id);
  }, [showLoading]);
  useEffect(() => {
    if (!showLoading) {
      setWaitSeconds(0);
      return;
    }
    setWaitSeconds(0);
    const startedAt = Date.now();
    const id = window.setInterval(() => {
      setWaitSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [showLoading]);
  // התקדמות הסטטוסים הטבעיים לפי זמן ההמתנה.
  useEffect(() => {
    if (!isThinking) {
      setStatusIdx(0);
      return;
    }
    const timers = ALMOG_STATUS_THRESHOLDS_MS.map((ms, i) =>
      window.setTimeout(() => setStatusIdx(i + 1), ms)
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [isThinking]);
  const almogStatusText = ALMOG_STATUS_PHRASES[statusIdx] ?? ALMOG_STATUS_PHRASES[0];

  useEffect(() => {
    if (wasLoadingRef.current && !showLoading) {
      if (notifyWhenReady) {
        setHasBackgroundAnswer(true);
        setAnswerReadyToast(true);
        window.setTimeout(() => setAnswerReadyToast(false), 3200);
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try {
            new Notification('אלמוג סיים לענות', {
              body: 'התשובה שלך מוכנה בצ׳אט.',
              tag: 'almog-chat-ready',
            });
          } catch {
            /* התראה מקומית בלבד — לא שוברים את הצ׳אט אם הדפדפן חסם */
          }
        }
      }
      setNotifyWhenReady(false);
    }
    wasLoadingRef.current = showLoading;
  }, [showLoading, notifyWhenReady]);

  const continueInBackground = async () => {
    setNotifyWhenReady(true);
    setHasBackgroundAnswer(false);
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {
        /* הרשאה אופציונלית בלבד */
      }
    }
    setOpen(false);
  };

  if (!mounted) return null;

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setHasBackgroundAnswer(false);
          setAnswerReadyToast(false);
        }
        if (!next) {
          setPanelView('inbox');
          setNotificationContext(null);
          notificationIdRef.current = null;
        }
      }}
      direction="bottom"
      shouldScaleBackground
    >
      <Drawer.Trigger asChild>
        <motion.button
          type="button"
          aria-label="שיחה עם אלמוג"
          className="fixed z-[190] flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-full text-white shadow-lg md:h-[3.5rem] md:w-[3.5rem]"
          style={{
            bottom: 'calc(7.25rem + env(safe-area-inset-bottom, 0px))',
            right: 'calc(1rem + env(safe-area-inset-right, 0px))',
            background: 'linear-gradient(145deg, #047857, #10b981)',
            boxShadow: '0 10px 28px rgba(16,185,129,0.35)',
          }}
          whileTap={{ scale: 0.94 }}
        >
          <MessageCircle className="h-7 w-7 md:h-8 md:w-8" strokeWidth={2} />
          {hasBackgroundAnswer ? (
            <span
              className="absolute -top-1 -left-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-white/70 bg-amber-300 px-1 text-[10px] font-black text-emerald-950 shadow-lg"
              aria-label="תשובה חדשה מאלמוג"
            >
              1
            </span>
          ) : null}
        </motion.button>
      </Drawer.Trigger>

      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[200] bg-slate-900/55" />
        <Drawer.Content
          dir="rtl"
          className="fixed bottom-0 right-0 left-0 z-[210] mx-auto w-full max-w-md rounded-t-[28px] outline-none"
          style={{
            border: '1px solid rgba(255,255,255,0.18)',
            background: 'linear-gradient(180deg, rgba(15,23,42,0.96), rgba(2,6,23,0.96))',
            boxShadow: '0 -24px 60px rgba(2,6,23,0.45)',
            height: 'min(94dvh, 720px)',
          }}
        >
          <Drawer.Title className="sr-only">שיחה עם אלמוג</Drawer.Title>
          <Drawer.Description className="sr-only">צ׳אט אישי עם המנטור אלמוג</Drawer.Description>

          <div className="relative h-full flex flex-col overflow-hidden rounded-t-[28px] bg-transparent backdrop-blur-2xl">
            <ChatSessionClosingOverlay visible={isClosing} />
            <div
              className={`shrink-0 rounded-t-[28px] text-white ${
                panelView === 'inbox'
                  ? 'relative overflow-hidden'
                  : 'relative overflow-hidden'
              }`}
            >
              {panelView === 'inbox' && (
                <>
                  {hasPhoto && bgUrl ? (
                    <img src={bgUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
                  ) : null}
                  <div
                    className="absolute inset-0"
                    style={{
                      background: hasPhoto && bgUrl
                        ? 'linear-gradient(180deg, rgba(2,6,23,0.42) 0%, rgba(2,6,23,0.78) 55%, rgba(2,6,23,0.92) 100%)'
                        : 'linear-gradient(155deg, #034d3a 0%, #059669 35%, #0d9488 65%, #10b981 85%, #34d399 100%)',
                    }}
                    aria-hidden
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 h-2/3"
                    style={{
                      background:
                        'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 100%)',
                    }}
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full"
                    style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.28), transparent 68%)' }}
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-8"
                    style={{
                      background: 'linear-gradient(180deg, transparent, #0f172a)',
                    }}
                  />
                </>
              )}
              {panelView === 'inbox' ? (
                <div className="relative pt-2 pb-1 flex justify-center">
                  <div className="w-10 h-1 rounded-full bg-white/40" />
                </div>
              ) : null}
              {panelView === 'inbox' ? (
                <div className="relative min-h-[11.5rem] px-4 pb-6 pt-3 sm:min-h-[12.5rem]">
                  <button
                    type="button"
                    aria-label="סגור"
                    onClick={() => setOpen(false)}
                    className="absolute left-3 top-2 z-10 rounded-lg p-2 hover:bg-white/10"
                  >
                    <X className="h-5 w-5" />
                  </button>
                  <div className="flex flex-col items-center text-center">
                    <div
                      className="rounded-full p-1.5"
                      style={{
                        background: 'linear-gradient(140deg, rgba(255,255,255,0.55), rgba(255,255,255,0.12))',
                        boxShadow: '0 10px 32px rgba(0,0,0,0.24)',
                      }}
                    >
                      <img
                        src={avatarSrc}
                        alt="אלמוג"
                        className="h-[5.5rem] w-[5.5rem] rounded-full object-cover ring-2 ring-white/55 sm:h-24 sm:w-24"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = ALMOG_AVATAR_FALLBACK;
                        }}
                      />
                    </div>
                    <p className="mt-4 text-lg font-bold text-emerald-50/95">
                      {displayName ? (
                        <>
                          שלום {displayName} <span aria-hidden>👋</span>
                        </>
                      ) : (
                        <>
                          שלום <span aria-hidden>👋</span>
                        </>
                      )}
                    </p>
                    <h2 className="mt-1.5 text-[2rem] font-black leading-[1.05] tracking-tight text-white drop-shadow-md sm:text-[2.125rem]">
                      שיחות עם אלמוג
                    </h2>
                    <p className="mt-2 text-[13px] text-emerald-50/80">
                      {greeting.occasionGreeting ?? 'המנטור האישי שלך'}
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  className="relative flex items-center gap-2.5 px-3 pb-3.5 pt-2"
                  style={{
                    background: 'linear-gradient(160deg, #064e3b 0%, #047857 45%, #10b981 100%)',
                    boxShadow: '0 4px 20px rgba(6,78,59,0.28)',
                  }}
                >
                  <ThreadHeaderIconButton label="חזרה לרשימת שיחות" onClick={goToInbox}>
                    <ChevronRight className="h-5 w-5" />
                  </ThreadHeaderIconButton>

                  {/* RTL: אווטאר ראשון = ימין; שם + תגית צמודים משמאלו */}
                  <div className="flex shrink-0 items-center gap-2.5">
                    <div
                      className="shrink-0 rounded-full p-0.5"
                      style={{
                        background: 'linear-gradient(140deg, rgba(255,255,255,0.5), rgba(255,255,255,0.12))',
                        boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
                      }}
                    >
                      <img
                        src={avatarSrc}
                        alt="אלמוג"
                        className="h-10 w-10 rounded-full object-cover ring-2 ring-white/40"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = ALMOG_AVATAR_FALLBACK;
                        }}
                      />
                    </div>
                    <div className="flex flex-col items-start gap-1">
                      <p className="text-[16px] font-black leading-none text-white">אלמוג</p>
                      {(() => {
                        const { status, label } = threadStatusLabel(
                          showLoading,
                          isThinking,
                          online,
                          isSessionClosed,
                          almogStatusText,
                          typingStep
                        );
                        return <ThreadStatusPill status={status}>{label}</ThreadStatusPill>;
                      })()}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1" aria-hidden />

                  <div className="flex shrink-0 items-center gap-1.5">
                    {!isSessionClosed && messages.length > 0 ? (
                      <ThreadHeaderIconButton
                        label="סיום שיחה"
                        disabled={sessionActionLoading || showLoading || isClosing}
                        onClick={() => void handleEndChatSession()}
                      >
                        {isClosing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <LogOut className="h-4 w-4" />
                        )}
                      </ThreadHeaderIconButton>
                    ) : null}
                    <ThreadHeaderIconButton
                      label="סגור"
                      onClick={() => {
                        if (!notifyWhenReady) stop();
                        setOpen(false);
                      }}
                    >
                      <X className="h-4 w-4" strokeWidth={2.5} />
                    </ThreadHeaderIconButton>
                  </div>
                </div>
              )}
            </div>

            {panelView === 'inbox' ? (
              <div className="min-h-0 flex-1 overflow-hidden">
              <ChatSessionInbox
                sessions={sessionList}
                loading={sessionsLoading}
                activeSessionId={sessionIdRef.current}
                onSelectSession={(s) => void openSessionThread(s)}
                onStartNewChat={() => void startNewChatSession()}
                onStartNewChatWithPrefill={(text) => void startNewChatSession(text)}
                startingNew={sessionActionLoading}
                firstName={displayName}
              />
              </div>
            ) : (
            <>
            <div
              className="relative min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 text-right"
              style={{
                WebkitOverflowScrolling: 'touch',
                background:
                  'linear-gradient(180deg, #0f172a 0%, #111827 45%, #0c1222 100%)',
              }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.04]"
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Ccircle cx='2' cy='2' r='1' fill='%23fff'/%3E%3C/svg%3E\")",
                }}
              />
              <div className="relative space-y-3">
              {loadingThread && (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-emerald-300/80" />
                </div>
              )}
              {!loadingThread && notificationContext && !quotedReply && (
                <div className="flex justify-end items-end gap-2">
                  <div
                    className="max-w-[88%] rounded-[20px] rounded-bl-md px-4 py-3 text-[15px] leading-relaxed text-white shadow-lg"
                    style={{
                      background: 'linear-gradient(145deg, #059669 0%, #10b981 100%)',
                      border: '1px solid rgba(255,255,255,0.22)',
                      boxShadow: '0 8px 24px rgba(16,185,129,0.28)',
                    }}
                  >
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-100/90">
                      מאלמוג · התראה
                    </p>
                    <p className="whitespace-pre-wrap">{notificationContext.mentorMessage}</p>
                  </div>
                  <img
                    src={avatarSrc}
                    alt=""
                    aria-hidden
                    className="h-7 w-7 shrink-0 rounded-full object-cover ring-2 ring-emerald-400/40"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = ALMOG_AVATAR_FALLBACK;
                    }}
                  />
                </div>
              )}
              {messages.length === 0 && !notificationContext && !loadingThread && (
                <div className="flex flex-col items-center px-4 py-8 text-center">
                  <img
                    src={avatarSrc}
                    alt=""
                    aria-hidden
                    className="h-16 w-16 rounded-full object-cover ring-2 ring-emerald-400/35"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = ALMOG_AVATAR_FALLBACK;
                    }}
                  />
                  <p className="mt-4 text-[15px] font-bold text-slate-200">אני כאן איתך</p>
                  <p className="mt-1.5 max-w-[16rem] text-[13px] leading-relaxed text-slate-400">
                    כתוב מה עובר עליך — ונבנה יחד צעד קטן, בקצב שלך.
                  </p>
                </div>
              )}
              {messages.length === 0 && notificationContext && (
                <p className="text-center text-xs text-slate-400">כתוב את תשובתך למטה — אלמוג ימשיך משם</p>
              )}

              {error && (
                <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-100" role="alert">
                  בעיה בקבלת תשובה. נסה שוב בעוד כמה שניות.
                </div>
              )}
              {answerReadyToast && (
                <p className="text-center text-[11px] font-semibold text-emerald-300/90">התשובה מוכנה</p>
              )}

              {messages.map((msg, i) => {
                const isUser = msg.role === 'user';
                const displayMsg = msg as ChatDisplayMessage;
                const text = getMessageText(displayMsg);
                if (!isUser && !text) return null;
                const showQuote =
                  isUser &&
                  i === 0 &&
                  quotedReply != null &&
                  text.trim() === quotedReply.userReply.trim();
                return (
                  <div
                    key={msg.id ?? `${i}-${text.slice(0, 16)}`}
                    className={`flex ${isUser ? 'justify-start' : 'justify-end items-end gap-2'}`}
                  >
                    {isUser ? (
                      <div
                        className="max-w-[82%] rounded-[20px] rounded-tr-md px-3.5 py-2.5 text-[14px] leading-relaxed text-slate-100"
                        style={{
                          background: 'linear-gradient(145deg, rgba(51,65,85,0.92), rgba(30,41,59,0.88))',
                          border: '1px solid rgba(255,255,255,0.1)',
                          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                        }}
                      >
                        {showQuote && quotedReply && (
                          <WhatsAppQuote author="אלמוג" text={quotedReply.mentorMessage} />
                        )}
                        <p className="whitespace-pre-wrap">{text}</p>
                        <div className="mt-1.5 text-[10px] text-slate-400">
                          {formatHebrewTime(getMessageCreatedAt(msg))}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div
                          className="max-w-[82%] rounded-[20px] rounded-bl-md px-3.5 py-2.5 text-[14px] leading-relaxed text-white"
                          style={{
                            background: 'linear-gradient(145deg, #047857 0%, #059669 55%, #10b981 100%)',
                            border: '1px solid rgba(255,255,255,0.22)',
                            boxShadow: '0 8px 22px rgba(16,185,129,0.28)',
                          }}
                        >
                          {renderAlmogMessage(text)}
                          <div className="mt-1.5 text-[10px] text-emerald-50/75">
                            {formatHebrewTime(getMessageCreatedAt(msg))}
                          </div>
                        </div>
                        <img
                          src={avatarSrc}
                          alt=""
                          aria-hidden
                          className="mb-0.5 h-7 w-7 shrink-0 rounded-full object-cover ring-2 ring-emerald-500/35"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = ALMOG_AVATAR_FALLBACK;
                          }}
                        />
                      </>
                    )}
                  </div>
                );
              })}

              <MemorySearchIndicator visible={showMemorySearch} />

              {showLoading && !showMemorySearch && (
                <div className="flex justify-end items-end gap-2">
                  <div
                    className="max-w-[80%] rounded-[20px] rounded-bl-md px-3.5 py-2.5 text-[14px] text-white"
                    style={{
                      background: 'linear-gradient(145deg, rgba(51,65,85,0.85), rgba(30,41,59,0.8))',
                      border: '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    <div className="inline-flex items-center gap-2">
                      <AlmogChatTypingDots />
                      {isThinking ? (
                        <span className="text-[12px] text-white/70">{almogStatusText}</span>
                      ) : null}
                    </div>
                    {isLongWait ? (
                      <div className="mt-2 border-t border-white/10 pt-2 text-[11px] leading-relaxed text-slate-300">
                        <p>לפעמים תשובה טובה לוקחת עוד קצת.</p>
                        {!notifyWhenReady ? (
                          <button
                            type="button"
                            onClick={continueInBackground}
                            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-200 hover:text-emerald-100"
                          >
                            <BellRing className="h-3 w-3" />
                            עדכן אותי כשמוכן
                          </button>
                        ) : (
                          <p className="mt-1.5 inline-flex items-center gap-1 text-emerald-200">
                            <BellRing className="h-3 w-3" />
                            אעדכן כשמוכן
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                  <img
                    src={avatarSrc}
                    alt=""
                    aria-hidden
                    className="mb-0.5 h-7 w-7 shrink-0 rounded-full object-cover ring-2 ring-emerald-500/35"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = ALMOG_AVATAR_FALLBACK;
                    }}
                  />
                </div>
              )}

              <div ref={bottomRef} />
              </div>
            </div>

            <div
              className="shrink-0 border-t border-white/8 bg-[#0c1222]/95 px-3 pt-2 backdrop-blur-md"
              style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}
            >
              {isSessionClosed && (
                <div className="mb-2 space-y-2">
                  <button
                    type="button"
                    onClick={() => setSummaryExpanded((value) => !value)}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-[12px] font-semibold text-emerald-50/95 backdrop-blur-md transition hover:bg-emerald-500/15"
                    style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)' }}
                    aria-expanded={summaryExpanded}
                  >
                    <span>סיכום השיחה</span>
                    {summaryExpanded ? (
                      <ChevronUp className="h-4 w-4 shrink-0 text-emerald-200/80" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-emerald-200/80" />
                    )}
                  </button>
                  {summaryExpanded && (
                    <div
                      className="rounded-xl border border-emerald-400/20 bg-emerald-500/8 px-3 py-2.5 text-[13px] leading-relaxed text-emerald-50/95 backdrop-blur-md"
                      style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}
                    >
                      <p className="whitespace-pre-wrap">{chatSession?.summary ?? 'אין סיכום זמין.'}</p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={sessionActionLoading}
                      onClick={() => void handleReopenChatSession()}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-bold text-white backdrop-blur-md transition hover:bg-white/15 disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      פתיחה מחדש
                    </button>
                    <button
                      type="button"
                      disabled={sessionActionLoading}
                      onClick={() => void startNewChatSession()}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-400/35 bg-emerald-500/20 px-3 py-2 text-xs font-bold text-emerald-50 backdrop-blur-md transition hover:bg-emerald-500/30 disabled:opacity-50"
                    >
                      <PlusCircle className="h-3.5 w-3.5" />
                      שיחה חדשה
                    </button>
                  </div>
                </div>
              )}
              {messages.length === 0 && !notificationContext && !isSessionClosed && (
                <div className="mb-2.5 flex flex-wrap justify-end gap-2">
                  {MICRO_WIN_QUICK_STARTERS.map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      disabled={showLoading || isSessionClosed || isClosing}
                      onClick={async () => {
                        if (chip.markWaterHabit) {
                          await postMicroWinHabit();
                        }
                        markChatSendStarted(sessionIdRef.current);
                        sendMessage(
                          { text: chip.text },
                          {
                            body: {
                              user_id: userId,
                              session_id: sessionIdRef.current ?? undefined,
                            },
                          }
                        );
                      }}
                      className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-100 transition active:scale-[0.97] hover:bg-emerald-500/18 disabled:opacity-50"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              )}
              {!isSessionClosed && !isClosing ? (
                <AiChatPrivacyNotice variant="dark" className="mb-2 px-0.5" />
              ) : null}
              <form
                className="flex items-end gap-2 rounded-2xl border border-white/12 bg-white/[0.06] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const text = input.trim();
                    if (!text || showLoading || isSessionClosed || isClosing) return;
                    const replyNotificationId = notificationIdRef.current;
                    markChatSendStarted(sessionIdRef.current);
                    sendMessage(
                      { text },
                      {
                        body: buildOutgoingChatBody(),
                      }
                    );
                    clearTaskReportHintAfterSend();
                    setInput('');
                    clearChatInputDraft(sessionIdRef.current);
                    if (replyNotificationId) {
                      setNotificationContext(null);
                      notificationIdRef.current = null;
                    }
                  }}
                >
                  <textarea
                    dir="rtl"
                    rows={1}
                    value={input}
                    onChange={(e) => {
                      const next = e.target.value;
                      setInput(next);
                      writeChatInputDraft(sessionIdRef.current, next);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
                      }
                    }}
                    disabled={showLoading || isSessionClosed || isClosing}
                    placeholder={
                      isSessionClosed
                        ? 'השיחה נסגרה — פתח מחדש או התחל שיחה חדשה'
                        : notificationContext
                          ? 'ענה לאלמוג על מה ששאל...'
                          : 'כתוב לי מה עובר עליך...'
                    }
                    className="max-h-24 min-h-[40px] flex-1 resize-none rounded-xl border-0 bg-transparent px-3 py-2 text-[14px] leading-snug text-right text-white outline-none placeholder:text-white/35 disabled:opacity-60"
                  />
                  {isLoading && (
                    <>
                      {isLongWait ? (
                        <button
                          type="button"
                          onClick={continueInBackground}
                          className="shrink-0 rounded-xl px-2.5 py-2 text-[11px] font-bold text-amber-100 hover:bg-amber-300/10"
                        >
                          רקע
                        </button>
                      ) : null}
                      <button type="button" onClick={stop} className="shrink-0 rounded-xl px-2.5 py-2 text-[11px] font-bold text-white/80 hover:bg-white/10">
                        עצור
                      </button>
                    </>
                  )}
                  <button
                    type="submit"
                    disabled={showLoading || isSessionClosed || isClosing || !input.trim()}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-lg transition active:scale-95 disabled:opacity-40"
                    style={{
                      background: 'linear-gradient(145deg, #047857, #10b981)',
                      boxShadow: '0 6px 18px rgba(16,185,129,0.35)',
                    }}
                    aria-label="שלח"
                  >
                    {showLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </form>
            </div>
            </>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

