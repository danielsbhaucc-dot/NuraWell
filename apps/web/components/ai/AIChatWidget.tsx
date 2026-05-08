'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, Send, Loader2, Sparkles, X } from 'lucide-react';
import { Drawer } from 'vaul';
import { getAlmogAvatarUrl } from '../../lib/ai/almog-avatar';

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

export interface AIChatWidgetProps {
  /** Must match the logged-in user; server rejects mismatched IDs. Context is loaded for this user. */
  userId: string;
}

export function AIChatWidget({ userId }: AIChatWidgetProps) {
  const avatarSrc = getAlmogAvatarUrl();
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
      let gotToken = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = parseSseBlocks(buffer);
        buffer = rest;

        for (const { event, data: dataStr } of events) {
          let payload: Record<string, unknown> = {};
          try {
            payload = JSON.parse(dataStr || '{}') as Record<string, unknown>;
          } catch {
            continue;
          }
          if (event === 'meta' && typeof payload.session_id === 'string') {
            sessionIdRef.current = payload.session_id;
            try {
              sessionStorage.setItem(SESSION_STORAGE_KEY, payload.session_id);
            } catch {
              /* */
            }
          }
          if (event === 'token' && typeof payload.t === 'string' && payload.t) {
            if (!gotToken) {
              gotToken = true;
              setWaitingTokens(false);
            }
            const piece = payload.t;
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
        }
      }

      setMessages((m) => {
        const next = [...m];
        const last = next[next.length - 1];
        if (last?.role === 'assistant' && !last.text.trim()) {
          next[next.length - 1] = {
            role: 'assistant',
            text: 'משהו נתקע בדרך. נסה שוב עוד רגע?',
          };
        }
        return next;
      });
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
  }, [busy, input, userId]);

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
        <Drawer.Overlay className="fixed inset-0 z-[200] bg-slate-900/45" />
        <Drawer.Content
          dir="rtl"
          className="fixed bottom-0 right-0 left-0 z-[210] mx-auto w-full max-w-md rounded-t-[28px] outline-none"
          style={{
            background: '#fff',
            border: '1px solid rgba(16,185,129,0.2)',
            boxShadow: '0 -12px 40px rgba(0,0,0,0.18)',
            height: 'min(92dvh, 680px)',
          }}
        >
          <div
            className="h-full flex flex-col overflow-hidden rounded-t-[28px]"
            style={{ background: 'linear-gradient(180deg, #f5fffb 0%, #ffffff 18%)' }}
          >
            <div className="pt-2 pb-1 shrink-0 flex justify-center">
              <div className="w-12 h-1.5 rounded-full bg-white/70" />
            </div>

            <div
              className="shrink-0 px-4 pt-2 pb-4 text-white"
              style={{ background: 'linear-gradient(145deg, #064e3b, #047857 60%, #10b981)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  aria-label="סגור"
                  onClick={() => {
                    stopStream();
                    setOpen(false);
                  }}
                  className="rounded-xl p-2 hover:bg-white/10"
                >
                  <X className="h-5 w-5" />
                </button>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xl font-black leading-none" style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}>
                      אלמוג
                    </p>
                    <p className="text-xs text-white/85 mt-1 inline-flex items-center gap-1.5">
                      {busy ? (
                        <>
                          <span className="h-2 w-2 rounded-full bg-emerald-200 animate-pulse" />
                          מקליד...
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
                  <img
                    src={avatarSrc}
                    alt="אלמוג"
                    className="h-12 w-12 rounded-2xl object-cover border border-white/45 shadow-sm"
                  />
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 text-right" style={{ WebkitOverflowScrolling: 'touch' }}>
              {messages.length === 0 && (
                <div className="rounded-2xl p-4 bg-white/85 border border-emerald-100 text-gray-700 leading-relaxed text-sm">
                  אפשר לכתוב לי מה עובר עליך עכשיו, ואבנה איתך צעד קטן ומדויק להיום.
                </div>
              )}

              {messages.map((msg, i) => {
                const isUser = msg.role === 'user';
                return (
                  <div key={`${i}-${msg.text.slice(0, 16)}`} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className="max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed shadow-sm"
                      style={
                        isUser
                          ? {
                              background: 'linear-gradient(145deg, #e0f2fe, #dbeafe)',
                              border: '1px solid rgba(59,130,246,0.22)',
                              color: '#1e3a8a',
                            }
                          : {
                              background: '#ffffff',
                              border: '1px solid rgba(16,185,129,0.16)',
                              color: '#1A1730',
                            }
                      }
                    >
                      {!isUser && waitingTokens && i === messages.length - 1 && !msg.text ? (
                        <span className="inline-flex items-center gap-2 text-gray-600">
                          <Loader2 className="h-5 w-5 animate-spin shrink-0 text-emerald-600" />
                          <span className="font-semibold">אלמוג מקליד</span>
                          <span className="inline-flex gap-1">
                            <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-emerald-500/80" />
                            <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-emerald-500/70" style={{ animationDelay: '120ms' }} />
                            <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-emerald-500/60" style={{ animationDelay: '240ms' }} />
                          </span>
                        </span>
                      ) : (
                        msg.text || '\u00a0'
                      )}
                    </div>
                  </div>
                );
              })}

              <div ref={bottomRef} />
            </div>

            <div className="shrink-0 border-t border-gray-100 p-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
              <div className="rounded-2xl border border-gray-200 bg-white p-2">
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    disabled={busy || !input.trim()}
                    onClick={() => void sendMessage()}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg, #047857, #10b981)' }}
                    aria-label="שלח"
                  >
                    {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  </button>
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
                    className="max-h-28 min-h-[44px] flex-1 resize-none rounded-xl bg-white px-3 py-2.5 text-[15px] text-right text-gray-900 outline-none disabled:opacity-60"
                  />
                  {busy && (
                    <button type="button" onClick={stopStream} className="rounded-xl px-2 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100">
                      עצור
                    </button>
                  )}
                </div>
                <p className="mt-1 px-1 text-[11px] text-gray-500 inline-flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-emerald-500" />
                  תשובות קצרות, אישיות, ולעניין.
                </p>
              </div>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
