'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, Send, Loader2, X } from 'lucide-react';
import { Drawer } from 'vaul';
import { ALMOG_AVATAR_FALLBACK } from '../../lib/ai/almog-avatar';
import { useAlmogAvatarUrl } from '../../lib/client/useAlmogAvatarUrl';

const SESSION_STORAGE_KEY = 'nurawell_almog_chat_session';

type ChatMessage = { role: 'user' | 'assistant'; text: string };

function parseSseBlocks(buffer: string): { events: { event: string; data: string }[]; rest: string } {
  const events: { event: string; data: string }[] = [];
  let rest = buffer;
  for (;;) {
    const idx = rest.search(/\r?\n\r?\n/);
    if (idx === -1) break;
    const raw = rest.slice(0, idx);
    const sepLen = rest[idx] === '\r' ? 4 : 2;
    rest = rest.slice(idx + sepLen);
    let eventName = 'message';
    const dataLines: string[] = [];
    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    events.push({ event: eventName, data: dataLines.join('') });
  }
  return { events, rest };
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
  /** Must match the logged-in user; server rejects mismatched IDs. Context is loaded for this user. */
  userId: string;
}

export function AIChatWidget({ userId }: AIChatWidgetProps) {
  const { avatarUrl: avatarSrc } = useAlmogAvatarUrl();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [waitingTokens, setWaitingTokens] = useState(false);
  const [online, setOnline] = useState(true);
  const sessionIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (s) sessionIdRef.current = s;
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, waitingTokens, open]);

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

  const stopStream = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const requestNonStreamFallback = useCallback(
    async (text: string): Promise<string | null> => {
      try {
        const res = await fetch('/api/v1/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            stream: false,
            user_id: userId,
            ...(sessionIdRef.current ? { session_id: sessionIdRef.current } : {}),
          }),
        });
        const data = (await res.json()) as { reply?: string; session_id?: string };
        if (!res.ok || !data.reply) return null;
        if (typeof data.session_id === 'string') {
          sessionIdRef.current = data.session_id;
          try {
            sessionStorage.setItem(SESSION_STORAGE_KEY, data.session_id);
          } catch {
            // noop
          }
        }
        return data.reply;
      } catch {
        return null;
      }
    },
    [userId]
  );

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text }]);
    setBusy(true);
    setWaitingTokens(true);
    setMessages((m) => [...m, { role: 'assistant', text: '' }]);

    const ac = new AbortController();
    abortRef.current = ac;

    let streamDeliveredToken = false;

    const applySseEvent = (event: string, dataStr: string) => {
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(dataStr || '{}') as Record<string, unknown>;
      } catch {
        return;
      }
      if (event === 'meta' && typeof payload.session_id === 'string') {
        sessionIdRef.current = payload.session_id;
        try {
          sessionStorage.setItem(SESSION_STORAGE_KEY, payload.session_id);
        } catch {
          /* */
        }
      }
      if (event === 'token' && typeof payload.t === 'string') {
        const piece = payload.t;
        if (!piece) return;
        streamDeliveredToken = true;
        setWaitingTokens(false);
        setMessages((m) => {
          const next = [...m];
          const last = next[next.length - 1];
          if (last?.role === 'assistant') {
            next[next.length - 1] = { role: 'assistant', text: last.text + piece };
          }
          return next;
        });
      }
      if (event === 'error') {
        throw new Error(typeof payload.message === 'string' ? payload.message : 'שגיאת סטרים');
      }
    };

    const drainSseBuffer = (buf: string): string => {
      let rest = buf;
      for (let i = 0; i < 64; i++) {
        const { events, rest: r } = parseSseBlocks(rest);
        rest = r;
        for (const { event, data } of events) {
          applySseEvent(event, data);
        }
        if (events.length === 0) break;
      }
      return rest;
    };

    try {
      const res = await fetch('/api/v1/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ac.signal,
        body: JSON.stringify({
          message: text,
          stream: true,
          user_id: userId,
          ...(sessionIdRef.current ? { session_id: sessionIdRef.current } : {}),
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error('אין גוף תשובה מהשרת');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (value) {
          buffer += decoder.decode(value, { stream: true });
        }
        buffer = drainSseBuffer(buffer);
        if (done) {
          buffer += decoder.decode();
          buffer = drainSseBuffer(buffer);
          break;
        }
      }

      if (!streamDeliveredToken) {
        const fallbackReply = await requestNonStreamFallback(text);
        setMessages((m) => {
          const next = [...m];
          const last = next[next.length - 1];
          if (last?.role === 'assistant' && !last.text?.trim()) {
            next[next.length - 1] = fallbackReply
              ? { role: 'assistant', text: fallbackReply }
              : {
                  role: 'assistant',
                  text: 'משהו נתקע בדרך. נסה שוב עוד רגע?',
                };
          }
          return next;
        });
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        setMessages((m) => {
          const next = [...m];
          const last = next[next.length - 1];
          if (last?.role === 'assistant' && !last.text) next.pop();
          return next;
        });
      } else {
        const fallbackReply = await requestNonStreamFallback(text);
        setMessages((m) => {
          const next = [...m];
          const last = next[next.length - 1];
          if (last?.role === 'assistant') {
            next[next.length - 1] = fallbackReply
              ? { role: 'assistant', text: fallbackReply }
              : { role: 'assistant', text: 'אני איתך, אבל החיבור היה לא יציב. אפשר לנסות שוב באותה שאלה.' };
          }
          return next;
        });
      }
    } finally {
      setWaitingTokens(false);
      setBusy(false);
      abortRef.current = null;
    }
  }, [busy, input, userId, requestNonStreamFallback]);

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
                      {busy ? (
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
                    stopStream();
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

              {messages.map((msg, i) => {
                const isUser = msg.role === 'user';
                return (
                  <div key={`${i}-${msg.text.slice(0, 16)}`} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
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
                      {!isUser && waitingTokens && i === messages.length - 1 && !msg.text ? (
                        <AlmogChatTypingDots />
                      ) : (
                        msg.text || '\u00a0'
                      )}
                    </div>
                  </div>
                );
              })}

              <div ref={bottomRef} />
            </div>

            <div
              className="shrink-0 border-t border-slate-200/90 bg-white p-3"
              style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
            >
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-2 shadow-[0_-2px_16px_rgba(15,23,42,0.05)]">
                <div className="flex items-end gap-2">
                  <textarea
                    dir="rtl"
                    rows={1}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void sendMessage();
                      }
                    }}
                    disabled={busy}
                    placeholder="כתוב לי מה עובר עליך..."
                    className="max-h-28 min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[15px] text-right text-gray-900 shadow-inner outline-none disabled:opacity-60"
                  />
                  {busy && (
                    <button
                      type="button"
                      onClick={stopStream}
                      className="shrink-0 rounded-xl px-2 py-2 text-xs font-bold text-gray-600 hover:bg-slate-100/90"
                    >
                      עצור
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy || !input.trim()}
                    onClick={() => void sendMessage()}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-md disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg, #047857, #10b981)' }}
                    aria-label="שלח"
                  >
                    {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
