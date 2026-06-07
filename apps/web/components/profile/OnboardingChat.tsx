'use client';

import { useEffect, useRef, useState } from 'react';
import { Drawer } from 'vaul';
import { Check, Loader2, Send, Sparkles, X } from 'lucide-react';

type Turn = { role: 'user' | 'assistant'; content: string };

type ApiResponse = {
  reply: string;
  extracted: Record<string, unknown>;
  ready_for_summary: boolean;
  summary: string | null;
  persisted: boolean;
};

interface OnboardingChatProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

const EXTRACTED_LABELS: Record<string, string> = {
  full_name: 'שם',
  gender: 'פנייה',
  main_goal: 'מטרה',
  current_weight_kg: 'משקל נוכחי',
  goal_weight_kg: 'משקל יעד',
  weakest_time_of_day: 'זמן חלש',
  main_obstacle: 'מכשול',
  main_obstacle_detail: 'פירוט',
  wake_up_time: 'השכמה',
  sleep_time: 'שינה',
};

export function OnboardingChat({ open, onOpenChange, onSaved }: OnboardingChatProps) {
  const [messages, setMessages] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [extracted, setExtracted] = useState<Record<string, unknown>>({});
  const [readyForSummary, setReadyForSummary] = useState(false);
  const [saved, setSaved] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && messages.length === 0) {
      void sendTurn([], true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, loading]);

  async function sendTurn(history: Turn[], isOpening = false, persist = false) {
    setLoading(true);
    try {
      const payload: Turn[] = isOpening
        ? [{ role: 'user', content: 'היי' }]
        : history;
      const res = await fetch('/api/v1/ai/onboarding-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payload, persist }),
      });
      if (!res.ok) return;
      const json = (await res.json()) as ApiResponse;
      setMessages((prev) => {
        const base = isOpening ? [] : prev;
        return [...base, { role: 'assistant', content: json.reply }];
      });
      setExtracted((prev) => ({ ...prev, ...json.extracted }));
      setReadyForSummary(json.ready_for_summary);
      if (persist && json.persisted) {
        setSaved(true);
        onSaved?.();
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    const next: Turn[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    await sendTurn(next);
  }

  async function handleSave() {
    if (loading) return;
    // שולחים שוב את ההיסטוריה עם persist=true כדי לשמור את השדות לפרופיל
    await sendTurn(messages.length > 0 ? messages : [{ role: 'user', content: 'אישור' }], false, true);
  }

  const extractedKeys = Object.keys(extracted).filter((k) => EXTRACTED_LABELS[k]);

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction="bottom">
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[60] bg-black/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-[61] mt-24 flex h-[88vh] flex-col rounded-t-3xl bg-[#EDF5F0] outline-none">
          <div
            dir="rtl"
            className="flex items-center justify-between px-4 py-3 text-white rounded-t-3xl"
            style={{ background: 'linear-gradient(145deg, #047857, #10b981)' }}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              <h3 className="text-base font-black">היכרות עם אלמוג</h3>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/90 hover:bg-white/15"
              aria-label="סגירה"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {extractedKeys.length > 0 ? (
            <div dir="rtl" className="flex flex-wrap gap-1.5 px-4 py-2 border-b border-emerald-200/50">
              {extractedKeys.map((k) => (
                <span
                  key={k}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-emerald-800"
                  style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)' }}
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                  {EXTRACTED_LABELS[k]}
                </span>
              ))}
            </div>
          ) : null}

          <div dir="rtl" className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className="max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed"
                  style={
                    m.role === 'user'
                      ? { background: '#fff', color: '#1A1730', border: '1px solid rgba(0,0,0,0.06)' }
                      : { background: 'linear-gradient(145deg, #047857, #10b981)', color: '#fff' }
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading ? (
              <div className="flex justify-end">
                <div className="rounded-2xl px-3.5 py-2.5 bg-emerald-600 text-white">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          {readyForSummary && !saved ? (
            <div dir="rtl" className="px-4 pb-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white"
                style={{ background: 'linear-gradient(145deg, #b45309, #f59e0b)' }}
              >
                <Check className="h-4 w-4" />
                שמור את מה שהבנו לפרופיל
              </button>
            </div>
          ) : null}

          {saved ? (
            <div dir="rtl" className="px-4 pb-2">
              <p className="text-center text-[13px] font-bold text-emerald-700">
                ✦ עודכן בפרופיל. אפשר להמשיך לדבר.
              </p>
            </div>
          ) : null}

          <div dir="rtl" className="flex items-center gap-2 px-4 py-3 border-t border-emerald-200/50">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="כתוב לאלמוג…"
              className="flex-1 rounded-xl border border-emerald-200 bg-white px-3.5 py-2.5 text-[14px] text-[#1A1730] outline-none focus:border-emerald-400"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={loading || !input.trim()}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(145deg, #047857, #10b981)' }}
              aria-label="שליחה"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
