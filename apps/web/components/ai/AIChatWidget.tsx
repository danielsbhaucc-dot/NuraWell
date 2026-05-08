'use client';

import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, Send, Loader2, X } from 'lucide-react';
import { Drawer } from 'vaul';
import { useChat } from '@ai-sdk/react';
import { TextStreamChatTransport } from 'ai';
import { ALMOG_AVATAR_FALLBACK } from '../../lib/ai/almog-avatar';
import { useAlmogAvatarUrl } from '../../lib/client/useAlmogAvatarUrl';

const SESSION_STORAGE_KEY = 'nurawell_almog_chat_session';

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

function renderInlineStyledText(text: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|__[^_]+__)/g);
  return tokens
    .filter(Boolean)
    .map((token, index) => {
      const boldByStars = token.startsWith('**') && token.endsWith('**') && token.length > 4;
      const boldByUnderscore = token.startsWith('__') && token.endsWith('__') && token.length > 4;
      if (boldByStars || boldByUnderscore) {
        const clean = token.slice(2, -2).trim();
        return (
          <span
            key={`hl-${index}`}
            className="mx-0.5 rounded-md px-1.5 py-0.5 font-bold"
            style={{ background: 'rgba(16,185,129,0.15)', color: '#065f46' }}
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
            className="rounded-xl border border-emerald-100/80 bg-emerald-50/35 px-2.5 py-1.5"
            style={{ boxShadow: 'inset 0 0 0 1px rgba(16,185,129,0.08)' }}
          >
            <ul className="m-0 list-none space-y-1.5 p-0">
              {block.items.map((item, itemIndex) => (
                <li
                  key={`li-${blockIndex}-${itemIndex}`}
                  className="flex items-start gap-2.5 border-b border-emerald-100/80 pb-1.5 last:border-b-0 last:pb-0"
                >
                  <span
                    className="mt-1 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-1.5 text-xs font-bold"
                    style={{
                      background: 'linear-gradient(135deg, rgba(16,185,129,0.26), rgba(16,185,129,0.1))',
                      color: '#047857',
                    }}
                  >
                    {item.kind === 'numbered' ? item.number : '•'}
                  </span>
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

function AlmogChatTypingDots() {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.35)]"
          animate={{ y: [0, -5, 0], opacity: [0.35, 1, 0.35] }}
          transition={{ duration: 0.75, repeat: Infinity, ease: 'easeInOut', delay: i * 0.14 }}
        />
      ))}
    </span>
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
  const sessionIdRef = useRef<string | null>(null);
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
      }),
    }),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, status, open]);

  const isLoading = status === 'submitted' || status === 'streaming';

  if (!mounted) return null;

  return (
    <Drawer.Root open={open} onOpenChange={setOpen} direction="bottom" shouldScaleBackground>
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
          className="fixed bottom-0 right-0 left-0 z-[210] mx-auto w-full max-w-md rounded-t-[28px] outline-none bg-white"
          style={{
            border: '1px solid rgba(16,185,129,0.18)',
            boxShadow: '0 -16px 48px rgba(6,78,59,0.18)',
            height: 'min(92dvh, 680px)',
          }}
        >
          <Drawer.Title className="sr-only">שיחה עם אלמוג</Drawer.Title>
          <Drawer.Description className="sr-only">צ׳אט אישי עם המנטור אלמוג</Drawer.Description>

          <div className="h-full flex flex-col overflow-hidden rounded-t-[28px] bg-white">
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
                    className="h-12 w-12 shrink-0 rounded-2xl object-cover border border-white/45 shadow-md"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = ALMOG_AVATAR_FALLBACK;
                    }}
                  />
                  <div className="min-w-0 text-right">
                    <p className="text-xl font-black leading-none" style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}>
                      אלמוג
                    </p>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-white/85">
                      {isLoading ? (
                        <>
                          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-200" />
                          אלמוג מקליד
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
              className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-[#f0fdf9] via-[#f8fafc] to-white px-3 py-4 text-right [box-shadow:inset_0_1px_0_rgba(255,255,255,0.9)]"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {messages.length === 0 && (
                <div
                  className="rounded-2xl border border-emerald-100/90 bg-white p-4 text-sm leading-relaxed text-gray-700 shadow-sm"
                  style={{ boxShadow: '0 8px 28px rgba(6,78,59,0.07)' }}
                >
                  אפשר לכתוב לי מה עובר עליך עכשיו, ואבנה איתך צעד קטן ומדויק להיום.
                </div>
              )}

              {error && (
                <div
                  className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm leading-relaxed text-red-700 shadow-sm"
                  role="alert"
                >
                  הייתה בעיה בקבלת תשובה מאלמוג כרגע. נסה שוב בעוד כמה שניות.
                </div>
              )}

              {messages.map((msg, i) => {
                const isUser = msg.role === 'user';
                const text = getMessageText(msg as { parts?: Array<{ type: string; text?: string }>; content?: string | null });
                if (!isUser && !text) return null;
                return (
                  <div key={msg.id ?? `${i}-${text.slice(0, 16)}`} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className="max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed shadow-[0_4px_16px_rgba(15,23,42,0.07)]"
                      style={
                        isUser
                          ? {
                              background: 'linear-gradient(145deg, #e0f2fe, #dbeafe)',
                              border: '1px solid rgba(59,130,246,0.35)',
                              color: '#1e3a8a',
                            }
                          : {
                              background: '#ffffff',
                              border: '1px solid rgba(16,185,129,0.22)',
                              color: '#1A1730',
                            }
                      }
                    >
                      {isUser ? <p className="whitespace-pre-wrap">{text}</p> : renderAlmogMessage(text)}
                    </div>
                  </div>
                );
              })}

              {isLoading && (
                <div className="flex justify-start">
                  <div
                    className="max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed shadow-[0_4px_16px_rgba(15,23,42,0.07)]"
                    style={{
                      background: '#ffffff',
                      border: '1px solid rgba(16,185,129,0.22)',
                      color: '#1A1730',
                    }}
                  >
                    <AlmogChatTypingDots />
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            <div className="shrink-0 border-t border-slate-200/90 bg-white p-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-2 shadow-[0_-2px_16px_rgba(15,23,42,0.05)]">
                <form
                  className="flex items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const text = input.trim();
                    if (!text || isLoading) return;
                    sendMessage(
                      { text },
                      {
                        body: {
                          user_id: userId,
                          session_id: sessionIdRef.current ?? undefined,
                        },
                      }
                    );
                    setInput('');
                  }}
                >
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
                    placeholder="כתוב לי מה עובר עליך..."
                    className="max-h-28 min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[15px] text-right text-gray-900 shadow-inner outline-none disabled:opacity-60"
                  />
                  {isLoading && (
                    <button type="button" onClick={stop} className="shrink-0 rounded-xl px-2 py-2 text-xs font-bold text-gray-600 hover:bg-slate-100/90">
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

