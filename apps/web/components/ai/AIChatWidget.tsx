'use client';

import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, Send, Loader2, X, Paperclip, Smile } from 'lucide-react';
import { Drawer } from 'vaul';
import { useChat } from '@ai-sdk/react';
import { TextStreamChatTransport } from 'ai';
import { ALMOG_AVATAR_FALLBACK } from '../../lib/ai/almog-avatar';
import { useAlmogAvatarUrl } from '../../lib/client/useAlmogAvatarUrl';
import {
  OPEN_ALMOG_CHAT_EVENT,
  type OpenAlmogChatDetail,
} from '../../lib/notifications/open-almog-chat';

const SESSION_STORAGE_KEY = 'nurawell_almog_chat_session';

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

function getMessageText(msg: { parts?: Array<{ type: string; text?: string }>; content?: string | null }): string {
  if (typeof msg.content === 'string' && msg.content.trim()) {
    return msg.content.trim();
  }
  const parts = Array.isArray(msg.parts) ? msg.parts : [];
  return parts
    .map((p) => (p.type === 'text' && typeof p.text === 'string' ? p.text : ''))
    .join('')
    .trim();
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
        return (
          <span
            key={`hl-${index}`}
            className={`mx-0.5 rounded-md px-1.5 py-0.5 ${isStrong ? 'font-bold' : 'font-semibold'}`}
            style={{
              background: isStrong
                ? 'linear-gradient(145deg, rgba(255,255,255,0.20), rgba(255,255,255,0.10))'
                : 'linear-gradient(145deg, rgba(255,255,255,0.13), rgba(255,255,255,0.06))',
              color: '#ffffff',
              border: '1px solid rgba(255,255,255,0.22)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
              backdropFilter: 'blur(2px)',
              WebkitBackdropFilter: 'blur(2px)',
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
            className="rounded-2xl border border-white/25 bg-slate-900/30 px-3 py-2"
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

function formatHebrewDate(dateLike: Date | string | undefined): string {
  const date = dateLike ? new Date(dateLike) : new Date();
  return new Intl.DateTimeFormat('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
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
  'אלמוג חושב על זה',
  'אלמוג מנסח לך משהו',
  'רגע, אלמוג רוצה לדייק בשבילך',
];

/** ספי הזמן (ms) למעבר בין הסטטוסים. */
const ALMOG_STATUS_THRESHOLDS_MS: readonly number[] = [1500, 4000, 8000];

/** ציטוט ווטסאפ בתוך בועת הודעה */
function WhatsAppQuote({ author, text }: { author: string; text: string }) {
  return (
    <div
      className="mb-2 rounded-xl bg-black/25 px-2.5 py-2 text-[13px] leading-snug"
      style={{ borderInlineStart: '3px solid rgba(52,211,153,0.75)' }}
    >
      <p className="text-[10px] font-bold text-emerald-200/90">{author}</p>
      <p className="line-clamp-4 whitespace-pre-wrap text-emerald-50/90">{text}</p>
    </div>
  );
}

export interface AIChatWidgetProps {
  userId: string;
}

export function AIChatWidget({ userId }: AIChatWidgetProps) {
  const { avatarUrl: avatarSrc } = useAlmogAvatarUrl();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState(true);
  const [input, setInput] = useState('');
  const [typingStep, setTypingStep] = useState(0);
  const [statusIdx, setStatusIdx] = useState(0);
  const [notificationContext, setNotificationContext] = useState<OpenAlmogChatDetail | null>(null);
  const [quotedReply, setQuotedReply] = useState<{ mentorMessage: string; userReply: string } | null>(
    null
  );
  const sessionIdRef = useRef<string | null>(null);
  const notificationIdRef = useRef<string | null>(null);
  const pendingInitialReplyRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (s) sessionIdRef.current = s;
    } catch {
      /* */
    }
  }, []);

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
        setNotificationContext(detail);
        notificationIdRef.current = detail.notificationId;
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
        const prefill = detail?.prefillText?.trim();
        if (prefill) setInput(prefill);
      }
    };
    window.addEventListener(OPEN_ALMOG_CHAT_EVENT, onOpenChat);
    return () => window.removeEventListener(OPEN_ALMOG_CHAT_EVENT, onOpenChat);
  }, []);

  const fetchWithSession = useMemo(() => {
    return async (url: RequestInfo | URL, init?: RequestInit) => {
      const res = await fetch(url, init);
      const sid = res.headers.get('x-session-id');
      const dbg = res.headers.get('x-debug-id');
      if (sid) {
        sessionIdRef.current = sid;
        try {
          sessionStorage.setItem(SESSION_STORAGE_KEY, sid);
        } catch {
          /* */
        }
      }
      if (!res.ok && dbg) {
        console.error('[ai/chat client] request failed', {
          status: res.status,
          debug_id: dbg,
          debug_stage: res.headers.get('x-debug-stage'),
        });
      }
      return res;
    };
  }, []);

  const { messages, sendMessage, status, stop, error } = useChat({
    transport: new TextStreamChatTransport({
      api: '/api/v1/ai/chat',
      fetch: fetchWithSession,
      body: () => ({
        user_id: userId,
        session_id: sessionIdRef.current ?? undefined,
        notification_id: notificationIdRef.current ?? undefined,
      }),
    }),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, status, open]);

  useEffect(() => {
    const text = pendingInitialReplyRef.current;
    if (!open || !text || status === 'submitted' || status === 'streaming') return;
    pendingInitialReplyRef.current = null;
    const replyNotificationId = notificationIdRef.current;
    sendMessage(
      { text },
      {
        body: {
          user_id: userId,
          session_id: sessionIdRef.current ?? undefined,
          notification_id: replyNotificationId ?? undefined,
        },
      }
    );
    setNotificationContext(null);
    notificationIdRef.current = null;
  }, [open, sendMessage, status, userId]);

  const isLoading = status === 'submitted' || status === 'streaming';
  // "thinking" = ממתינים לתו הראשון מהמודל (כולל זמן ה-reasoning).
  const isThinking = status === 'submitted';
  useEffect(() => {
    if (!isLoading) {
      setTypingStep(0);
      return;
    }
    const id = window.setInterval(() => {
      setTypingStep((s) => (s + 1) % 3);
    }, 420);
    return () => window.clearInterval(id);
  }, [isLoading]);
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
  const firstMessageDate = messages.length > 0 ? getMessageCreatedAt(messages[0]) : undefined;

  if (!mounted) return null;

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
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
          className="fixed z-[190] flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg md:h-[3.75rem] md:w-[3.75rem]"
          style={{
            bottom: 'calc(6.75rem + env(safe-area-inset-bottom, 0px))',
            right: 'calc(1rem + env(safe-area-inset-right, 0px))',
            background: 'linear-gradient(145deg, #047857, #10b981)',
            boxShadow: '0 10px 28px rgba(16,185,129,0.35)',
          }}
          whileTap={{ scale: 0.94 }}
        >
          <MessageCircle className="h-7 w-7 md:h-8 md:w-8" strokeWidth={2} />
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
            height: 'min(92dvh, 680px)',
          }}
        >
          <Drawer.Title className="sr-only">שיחה עם אלמוג</Drawer.Title>
          <Drawer.Description className="sr-only">צ׳אט אישי עם המנטור אלמוג</Drawer.Description>

          <div className="h-full flex flex-col overflow-hidden rounded-t-[28px] bg-transparent backdrop-blur-2xl">
            <div
              className="shrink-0 rounded-t-[28px] text-white shadow-[0_4px_24px_rgba(6,78,59,0.35)]"
              style={{ background: 'linear-gradient(160deg, #064e3b 0%, #047857 45%, #10b981 100%)' }}
            >
              <div className="pt-2.5 pb-2 flex justify-center">
                <div className="w-11 h-1.5 rounded-full bg-white/45" />
              </div>
              <div className="flex items-center justify-between gap-3 px-4 pb-4">
                <div className="flex min-w-0 items-center gap-3">
                  <img
                    src={avatarSrc}
                    alt="אלמוג"
                    className="h-14 w-14 shrink-0 rounded-2xl object-cover border border-white/45 shadow-md"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = ALMOG_AVATAR_FALLBACK;
                    }}
                  />
                  <div className="min-w-0 text-right">
                    <p className="text-2xl font-black leading-none tracking-tight" style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}>
                      אלמוג
                    </p>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-white/85" style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}>
                      {isLoading ? (
                        <>
                          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-200" />
                          {isThinking
                            ? `${almogStatusText}${typingEllipsis(typingStep)}`
                            : `אלמוג מקליד${typingEllipsis(typingStep)}`}
                        </>
                      ) : online ? (
                        <>
                          <span className="h-2 w-2 rounded-full bg-emerald-200" />
                          מחובר וזמין
                        </>
                      ) : (
                        <>
                          <span className="h-2 w-2 rounded-full bg-red-300" />
                          כרגע בלי חיבור
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="סגור"
                  onClick={() => {
                    stop();
                    setOpen(false);
                  }}
                  className="shrink-0 rounded-xl p-2 hover:bg-white/10"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div
              className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-[#0f172a] via-[#111827] to-[#0b1220] px-3 py-4 text-right [box-shadow:inset_0_1px_0_rgba(255,255,255,0.06)]"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {notificationContext && !quotedReply && (
                <div className="flex justify-end">
                  <div className="max-w-[92%] rounded-3xl border border-emerald-400/30 bg-emerald-500/20 px-4 py-3 text-[15px] leading-relaxed text-emerald-50 shadow-sm">
                    <p className="mb-1 text-[11px] font-bold text-emerald-200/90">מאלמוג · התראה</p>
                    <p className="whitespace-pre-wrap">{notificationContext.mentorMessage}</p>
                  </div>
                </div>
              )}
              {messages.length === 0 && !notificationContext && (
                <div
                  className="rounded-2xl border border-white/20 bg-white/10 p-4 text-sm leading-relaxed text-slate-100 shadow-sm"
                  style={{ boxShadow: '0 8px 28px rgba(2,6,23,0.35)' }}
                >
                  אפשר לכתוב לי מה עובר עליך עכשיו, ואבנה איתך צעד קטן ומדויק להיום.
                </div>
              )}
              {messages.length === 0 && notificationContext && (
                <p className="text-center text-xs text-slate-400">כתוב את תשובתך למטה — אלמוג ימשיך משם</p>
              )}

              {messages.length > 0 && (
                <div className="flex justify-center">
                  <div
                    className="rounded-full border px-3 py-1 text-[11px] font-semibold text-white/70"
                    style={{
                      background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(148,163,184,0.08))',
                      borderColor: 'rgba(255,255,255,0.18)',
                      boxShadow: '0 6px 20px rgba(2,6,23,0.35)',
                    }}
                  >
                    {`תחילת שיחה • ${formatHebrewDate(firstMessageDate)}`}
                  </div>
                </div>
              )}

              {error && (
                <div
                  className="rounded-2xl border border-red-300/35 bg-red-500/10 p-3 text-sm leading-relaxed text-red-100 shadow-sm"
                  role="alert"
                >
                  הייתה בעיה בקבלת תשובה מאלמוג כרגע. נסה שוב בעוד כמה שניות.
                </div>
              )}

              {messages.map((msg, i) => {
                const isUser = msg.role === 'user';
                const text = getMessageText(msg as { parts?: Array<{ type: string; text?: string }>; content?: string | null });
                if (!isUser && !text) return null;
                const showQuote =
                  isUser &&
                  i === 0 &&
                  quotedReply != null &&
                  text.trim() === quotedReply.userReply.trim();
                return (
                  <div key={msg.id ?? `${i}-${text.slice(0, 16)}`} className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}>
                    <div
                      className="max-w-[88%] rounded-3xl px-4 py-3 text-[16px] leading-relaxed shadow-[0_8px_26px_rgba(15,23,42,0.08)]"
                      style={
                        isUser
                          ? {
                              background: 'linear-gradient(165deg, rgba(51,65,85,0.62), rgba(30,41,59,0.48))',
                              border: '1px solid rgba(255,255,255,0.2)',
                              color: '#e2e8f0',
                              backdropFilter: 'blur(8px)',
                              boxShadow: '0 8px 24px rgba(2,6,23,0.35), inset 0 1px 0 rgba(255,255,255,0.18)',
                            }
                          : {
                              background: 'linear-gradient(165deg, rgba(16,185,129,0.92), rgba(5,150,105,0.88))',
                              border: '1px solid rgba(16,185,129,0.3)',
                              color: '#f8fafc',
                              boxShadow: '0 10px 30px rgba(16,185,129,0.25), inset 0 1px 0 rgba(255,255,255,0.25)',
                            }
                      }
                    >
                      {isUser ? (
                        <>
                          {showQuote && quotedReply && (
                            <WhatsAppQuote author="אלמוג" text={quotedReply.mentorMessage} />
                          )}
                          <p className="whitespace-pre-wrap">{text}</p>
                        </>
                      ) : (
                        renderAlmogMessage(text)
                      )}
                      <div className={`mt-1.5 text-[11px] ${isUser ? 'text-slate-300/75' : 'text-emerald-50/80'}`}>
                        {formatHebrewTime(getMessageCreatedAt(msg))}
                      </div>
                    </div>
                  </div>
                );
              })}

              {isLoading && (
                <div className="flex justify-end">
                  <div
                    className="max-w-[88%] rounded-3xl px-4 py-3 text-[16px] leading-relaxed shadow-[0_4px_16px_rgba(15,23,42,0.07)]"
                    style={{
                      background: 'linear-gradient(165deg, rgba(30,41,59,0.95), rgba(51,65,85,0.9))',
                      border: '1px solid rgba(255,255,255,0.18)',
                      color: '#f8fafc',
                    }}
                  >
                    <div className="inline-flex items-center gap-2">
                      <AlmogChatTypingDots />
                      {isThinking && (
                        <span className="text-[13px] text-white/75" style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}>
                          {almogStatusText}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            <div className="shrink-0 border-t border-white/10 bg-slate-900/70 p-3 backdrop-blur-2xl" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
              {messages.length === 0 && !notificationContext && (
                <div className="mb-2 flex flex-wrap justify-end gap-2">
                  {MICRO_WIN_QUICK_STARTERS.map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      disabled={isLoading}
                      onClick={async () => {
                        if (chip.markWaterHabit) {
                          await postMicroWinHabit();
                        }
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
                      className="rounded-full border border-emerald-400/35 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-100 shadow-sm transition hover:bg-emerald-500/25 disabled:opacity-50"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="rounded-2xl border border-white/15 bg-white/5 p-2 shadow-[0_-2px_16px_rgba(2,6,23,0.4)]">
                <form
                  className="flex items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const text = input.trim();
                    if (!text || isLoading) return;
                    const replyNotificationId = notificationIdRef.current;
                    sendMessage(
                      { text },
                      {
                        body: {
                          user_id: userId,
                          session_id: sessionIdRef.current ?? undefined,
                          notification_id: replyNotificationId ?? undefined,
                        },
                      }
                    );
                    setInput('');
                    if (replyNotificationId) {
                      setNotificationContext(null);
                      notificationIdRef.current = null;
                    }
                  }}
                >
                  <button
                    type="button"
                    className="shrink-0 rounded-xl p-2 text-white/50 transition hover:bg-white/10 hover:text-white/90"
                    aria-label="צרף"
                  >
                    <Paperclip className="h-[18px] w-[18px]" />
                  </button>
                  <textarea
                    dir="rtl"
                    rows={1}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
                      }
                    }}
                    disabled={isLoading}
                    placeholder={
                      notificationContext ? 'ענה לאלמוג על מה ששאל...' : 'כתוב לי מה עובר עליך...'
                    }
                    className="max-h-28 min-h-[44px] flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[15px] text-right text-white shadow-inner outline-none placeholder:text-white/35 disabled:opacity-60"
                  />
                  <button
                    type="button"
                    className="shrink-0 rounded-xl p-2 text-white/50 transition hover:bg-white/10 hover:text-white/90"
                    aria-label="אימוג׳י"
                  >
                    <Smile className="h-[18px] w-[18px]" />
                  </button>
                  {isLoading && (
                    <button type="button" onClick={stop} className="shrink-0 rounded-xl px-2 py-2 text-xs font-bold text-white/80 hover:bg-white/10">
                      עצור
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={isLoading || !input.trim()}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-md disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg, #047857, #10b981)' }}
                    aria-label="שלח"
                  >
                    {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

