'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Mic, Send, Leaf } from 'lucide-react';
import { useAlmogAvatarUrl } from '@/lib/client/useAlmogAvatarUrl';
import { ALMOG_AVATAR_FALLBACK } from '@/lib/ai/almog-avatar';
import { DemoExitBanner } from './DemoExitBanner';

type Turn = { role: 'user' | 'assistant'; content: string };

export function ChallengeInterviewGlass() {
  const router = useRouter();
  const { avatarUrl } = useAlmogAvatarUrl();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollDown = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollDown();
  }, [turns, scrollDown]);

  const sendTurn = async (userText?: string) => {
    const text = (userText ?? input).trim();
    if (!text && started) return;

    setLoading(true);
    setInput('');

    const nextMessages: Turn[] = started ? [...turns, { role: 'user', content: text }] : turns;

    try {
      const res = await fetch('/api/v1/challenge/interview', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const data = await res.json();
      if (!res.ok) return;

      if (!started) {
        setStarted(true);
        setTurns([{ role: 'assistant', content: data.reply }]);
      } else {
        setTurns([...nextMessages, { role: 'assistant', content: data.reply }]);
      }

      if (data.done) {
        setTimeout(() => router.push('/challenge/dashboard'), 2200);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="relative flex min-h-dvh flex-col overflow-hidden bg-linear-to-b from-[#0a1628] via-[#1a1035] to-[#05010f]"
      dir="rtl"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-e-1/4 top-20 h-64 w-64 rounded-full bg-iris-500/20 blur-3xl" />
        <div className="absolute bottom-32 inset-s-1/4 h-72 w-72 rounded-full bg-primary-500/15 blur-3xl" />
      </div>

      <header className="relative z-10 border-b border-on-dark/10 bg-background-card/5 px-4 py-4 backdrop-blur-xl">
        <div className="mx-auto max-w-lg">
          <DemoExitBanner />
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full ring-2 ring-primary-400/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={avatarUrl}
                alt="אלמוג"
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.currentTarget.src = ALMOG_AVATAR_FALLBACK;
                }}
              />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold text-on-dark">ריאיון עם אלמוג</h1>
              <p className="text-xs text-on-dark/50">כמה דקות — כדי שאזהה את ההצלחות שלך</p>
            </div>
            <Leaf className="ms-auto h-5 w-5 text-primary-400" />
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto w-full max-w-lg flex-1 overflow-y-auto px-4 py-6">
        {!started ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl border border-on-dark/15 bg-background-card/10 p-6 text-center backdrop-blur-2xl"
          >
            <Mic className="mx-auto mb-4 h-10 w-10 text-primary-300" />
            <p className="leading-relaxed text-on-dark/80">
              אלמוג ישאל אותך על המוטיבציה, הקשיים, ומה הצלחה אומרת עבורך —
              <strong className="text-primary-300"> לא בהכרח ירידה במשקל</strong>.
            </p>
            <button
              type="button"
              disabled={loading}
              onClick={() => sendTurn()}
              className="mt-6 w-full rounded-2xl bg-primary-500 py-3.5 font-bold text-on-dark shadow-lg shadow-primary-600/25 disabled:opacity-60"
            >
              {loading ? 'מתחבר...' : 'התחל ריאיון'}
            </button>
          </motion.div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence initial={false}>
              {turns.map((t, i) => (
                <motion.div
                  key={`${i}-${t.content.slice(0, 20)}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${t.role === 'user' ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      t.role === 'user'
                        ? 'rounded-es-md bg-background-card/15 text-on-dark'
                        : 'rounded-ee-md border border-primary-400/20 bg-primary-500/10 text-primary-50'
                    }`}
                  >
                    {t.content}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {loading ? (
              <div className="flex justify-end">
                <Loader2 className="h-6 w-6 animate-spin text-primary-400" />
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {started ? (
        <div className="relative z-10 border-t border-on-dark/10 bg-forest-950/40 px-4 py-4 backdrop-blur-xl">
          <form
            className="mx-auto flex max-w-lg gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              sendTurn();
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="כתבו בכנות..."
              disabled={loading}
              className="min-h-12 flex-1 rounded-2xl border border-on-dark/10 bg-background-card/10 px-4 text-on-dark placeholder:text-on-dark/35 focus:border-primary-400/50 focus:outline-hidden"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-500 text-on-dark disabled:opacity-50"
            >
              <Send className="h-5 w-5" />
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
