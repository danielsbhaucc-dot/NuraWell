'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, Send, X, Loader2 } from 'lucide-react';

const SESSION_STORAGE_KEY = 'nurawell_almog_chat_session';

type ChatMessage = { role: 'user' | 'assistant'; text: string };

function parseSseBlocks(buffer: string): { events: { event: string; data: string }[]; rest: string } {
  const events: { event: string; data: string }[] = [];
  let rest = buffer;
  for (;;) {
    const idx = rest.indexOf('\n\n');
    if (idx === -1) break;
    const raw = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
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
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [waitingTokens, setWaitingTokens] = useState(false);
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

  const stopStream = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

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

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }

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
        setMessages((m) => {
          const next = [...m];
          const last = next[next.length - 1];
          if (last?.role === 'assistant') {
            next[next.length - 1] = {
              role: 'assistant',
              text: 'לא הצלחתי להשלים את התשובה. בדוק חיבור או נסה שוב.',
            };
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
    <>
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
        onClick={() => setOpen((o) => !o)}
      >
        <MessageCircle className="h-7 w-7 md:h-8 md:w-8" strokeWidth={2} />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-end sm:justify-end sm:p-4"
            style={{ background: 'rgba(15,23,42,0.35)' }}
            onClick={() => {
              stopStream();
              setOpen(false);
            }}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              dir="rtl"
              className="flex h-[min(92dvh,640px)] w-full max-w-md flex-col overflow-hidden rounded-t-3xl sm:h-[min(78dvh,560px)] sm:rounded-3xl sm:shadow-2xl"
              style={{
                marginBottom: 'env(safe-area-inset-bottom, 0px)',
                background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 12%)',
                border: '1px solid rgba(16,185,129,0.18)',
                boxShadow: '0 -12px 40px rgba(0,0,0,0.12)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="flex shrink-0 items-center justify-between px-4 py-3 text-white"
                style={{ background: 'linear-gradient(135deg, #064e3b, #047857, #10b981)' }}
              >
                <div className="text-right">
                  <p className="text-sm font-black">אלמוג</p>
                  <p className="text-[11px] text-white/85">כאן בשבילך במסע</p>
                </div>
                <div className="flex items-center gap-1">
                  {busy && (
                    <button
                      type="button"
                      onClick={stopStream}
                      className="rounded-xl px-2 py-1.5 text-xs font-bold text-white/90 hover:bg-white/10"
                    >
                      עצור
                    </button>
                  )}
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
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4">
                {messages.length === 0 && (
                  <p className="text-center text-sm text-gray-500 leading-relaxed px-2">
                    אפשר לספר מה עובר עליך, או לשאול כל דבר קטן על ההרגלים והשיעורים.
                  </p>
                )}
                {messages.map((msg, i) => (
                  <div
                    key={`${i}-${msg.text.slice(0, 12)}`}
                    className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
                  >
                    <div
                      className="max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed shadow-sm"
                      style={
                        msg.role === 'user'
                          ? {
                              background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)',
                              border: '1px solid rgba(16,185,129,0.2)',
                              color: '#1A1730',
                            }
                          : {
                              background: '#fff',
                              border: '1px solid rgba(0,0,0,0.06)',
                              color: '#1A1730',
                            }
                      }
                    >
                      {msg.role === 'assistant' && waitingTokens && i === messages.length - 1 && !msg.text ? (
                        <span className="inline-flex items-center gap-2 text-gray-500">
                          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                          <span>אלמוג כותב…</span>
                          <span className="inline-flex gap-0.5">
                            <span className="h-1 w-1 animate-bounce rounded-full bg-emerald-500/80" />
                            <span
                              className="h-1 w-1 animate-bounce rounded-full bg-emerald-500/80"
                              style={{ animationDelay: '120ms' }}
                            />
                            <span
                              className="h-1 w-1 animate-bounce rounded-full bg-emerald-500/80"
                              style={{ animationDelay: '240ms' }}
                            />
                          </span>
                        </span>
                      ) : (
                        msg.text || '\u00a0'
                      )}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              <div
                className="shrink-0 border-t border-gray-100 p-3"
                style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
              >
                <div className="flex items-end gap-2">
                  <textarea
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
                    placeholder="כתוב כאן..."
                    className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl border border-gray-200 bg-white px-3 py-2.5 text-[15px] text-gray-900 shadow-inner outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
                  />
                  <button
                    type="button"
                    disabled={busy || !input.trim()}
                    onClick={() => void sendMessage()}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg, #047857, #10b981)' }}
                    aria-label="שלח"
                  >
                    {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
