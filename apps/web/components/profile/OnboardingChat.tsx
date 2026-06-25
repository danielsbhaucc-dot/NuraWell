'use client';

import { useEffect, useRef, useState } from 'react';
import { Drawer } from 'vaul';
import { Check, FileLock2, Loader2, Send, Sparkles, X, Zap, PartyPopper } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlmogAvatarChipWithNameTag } from '@/components/journey/AlmogPresence';
import { useAlmogAvatarUrl } from '@/lib/client/useAlmogAvatarUrl';
import { useChatBackground } from '@/lib/client/useChatBackground';
import type { OnboardingExtracted } from '@/lib/ai/onboarding-chat-llm';
import type { DiscreteFieldKey } from '@/lib/ai/onboarding-discrete-fields';
import {
  DISCRETE_FIELD_LABELS,
  DISCRETE_FIELD_PLACEHOLDERS,
} from '@/lib/ai/onboarding-discrete-fields';

type Turn = { role: 'user' | 'assistant'; content: string; secret?: boolean };

type OnboardingPath = 'quick' | 'fun';

type ApiResponse = {
  reply: string;
  extracted: OnboardingExtracted;
  request_discrete_field: DiscreteFieldKey | null;
  ready_for_summary: boolean;
  summary: string | null;
  persisted: boolean;
  error?: string;
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
  const [path, setPath] = useState<OnboardingPath | null>(null);
  const [messages, setMessages] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [extracted, setExtracted] = useState<OnboardingExtracted>({});
  const [discreteField, setDiscreteField] = useState<DiscreteFieldKey | null>(null);
  const [discreteValue, setDiscreteValue] = useState('');
  const [readyForSummary, setReadyForSummary] = useState(false);
  const [saved, setSaved] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { avatarUrl } = useAlmogAvatarUrl();
  const { url: backgroundUrl } = useChatBackground();

  useEffect(() => {
    if (!open) {
      setPath(null);
      setMessages([]);
      setExtracted({});
      setDiscreteField(null);
      setDiscreteValue('');
      setReadyForSummary(false);
      setSaved(false);
      setInput('');
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, loading, discreteField]);

  async function apiCall(body: Record<string, unknown>): Promise<ApiResponse | null> {
    const res = await fetch('/api/v1/ai/onboarding-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, extracted }),
    });
    if (!res.ok) return null;
    return (await res.json()) as ApiResponse;
  }

  async function startPath(selected: OnboardingPath) {
    setPath(selected);
    setLoading(true);
    const json = await apiCall({ is_opening: true, path: selected, messages: [] });
    setLoading(false);
    if (!json) return;
    setMessages([{ role: 'assistant', content: json.reply }]);
    setExtracted(json.extracted);
    setDiscreteField(json.request_discrete_field);
    setReadyForSummary(json.ready_for_summary);
  }

  async function sendDiscrete() {
    const value = discreteValue.trim();
    if (!value || !discreteField || loading) return;
    setLoading(true);
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: '📎 קובץ סודי נשלח לאלמוג', secret: true },
    ]);
    setDiscreteValue('');
    const key = discreteField;
    setDiscreteField(null);

    const json = await apiCall({ discrete_field: { key, value } });
    setLoading(false);
    if (!json) return;
    setExtracted(json.extracted);
    setMessages((prev) => [...prev, { role: 'assistant', content: json.reply }]);
    setReadyForSummary(json.ready_for_summary);
  }

  async function sendTurn(history: Turn[], persist = false) {
    setLoading(true);
    const json = await apiCall({
      messages: history.map(({ role, content }) => ({ role, content })),
      path,
      persist,
    });
    setLoading(false);
    if (!json) return;

    if (!persist) {
      setMessages((prev) => [...prev, { role: 'assistant', content: json.reply }]);
    }
    setExtracted(json.extracted);
    setDiscreteField(json.request_discrete_field);
    setReadyForSummary(json.ready_for_summary);
    if (persist && json.persisted) {
      setSaved(true);
      onSaved?.();
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading || !path) return;
    setInput('');
    const next: Turn[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    await sendTurn(next);
  }

  async function handleSave() {
    if (loading) return;
    await sendTurn(messages, true);
  }

  const extractedKeys = Object.keys(extracted).filter((k) => EXTRACTED_LABELS[k]);

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction="bottom">
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-[3px]" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-[61] flex h-[92vh] flex-col rounded-t-[28px] outline-none overflow-hidden"
          style={{
            background: '#0c1222',
            boxShadow: '0 -24px 80px rgba(4,120,87,0.25)',
          }}
        >
          <Drawer.Title className="sr-only">עדכון פרופיל עם אלמוג</Drawer.Title>
          <Drawer.Description className="sr-only">שיחה לעדכון פרטים אישיים</Drawer.Description>

          {/* רקע פרימיום */}
          <div className="absolute inset-0 pointer-events-none">
            {backgroundUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={backgroundUrl}
                alt=""
                className="h-full w-full object-cover opacity-[0.18]"
              />
            ) : null}
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(180deg, rgba(4,120,87,0.35) 0%, rgba(12,18,34,0.92) 45%, #0c1222 100%)',
              }}
            />
          </div>

          {/* Header */}
          <div dir="rtl" className="relative z-10 flex items-center justify-between px-4 pt-3 pb-2">
            <div className="flex items-center gap-3">
              <AlmogAvatarChipWithNameTag size={48} />
              <div className="text-right">
                <h3 className="text-base font-black text-white">עדכון עם אלמוג</h3>
                <p className="text-[11px] text-emerald-200/80">שיחה חמה · לא טופס</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white/90 backdrop-blur-md border border-white/15"
              aria-label="סגירה"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* בחירת מסלול */}
          {!path ? (
            <div dir="rtl" className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 gap-5">
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatarUrl}
                  alt="אלמוג"
                  className="h-24 w-24 rounded-full object-cover object-top mx-auto border-4 border-emerald-400/40 shadow-2xl"
                />
                <p className="mt-4 text-center text-white/90 text-[15px] font-semibold leading-relaxed max-w-xs">
                  היי! בוא נעדכן את הפרופיל שלך — איך בא לך לעבור?
                </p>
              </motion.div>
              <div className="w-full max-w-sm space-y-3">
                <button
                  type="button"
                  onClick={() => void startPath('quick')}
                  className="w-full flex items-center gap-3 rounded-2xl px-4 py-4 text-right transition active:scale-[0.98]"
                  style={{
                    background: 'linear-gradient(135deg, rgba(16,185,129,0.9), rgba(5,150,105,0.85))',
                    boxShadow: '0 8px 32px rgba(16,185,129,0.35)',
                  }}
                >
                  <Zap className="h-6 w-6 text-white shrink-0" />
                  <span>
                    <span className="block text-white font-black text-sm">מסלול מהיר ⚡</span>
                    <span className="block text-emerald-100 text-xs mt-0.5">שאלות ישירות ונחמדות</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void startPath('fun')}
                  className="w-full flex items-center gap-3 rounded-2xl px-4 py-4 text-right transition active:scale-[0.98]"
                  style={{
                    background: 'linear-gradient(135deg, rgba(245,158,11,0.92), rgba(236,72,153,0.85))',
                    boxShadow: '0 8px 32px rgba(245,158,11,0.3)',
                  }}
                >
                  <PartyPopper className="h-6 w-6 text-white shrink-0" />
                  <span>
                    <span className="block text-white font-black text-sm">מסלול כייפי 🎉</span>
                    <span className="block text-amber-100 text-xs mt-0.5">יותר הומור והפתעות — ארוך יותר</span>
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {extractedKeys.length > 0 ? (
                <div dir="rtl" className="relative z-10 flex flex-wrap gap-1.5 px-4 py-2">
                  {extractedKeys.map((k) => (
                    <span
                      key={k}
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold text-emerald-100 backdrop-blur-md"
                      style={{
                        background: 'rgba(16,185,129,0.2)',
                        border: '1px solid rgba(52,211,153,0.35)',
                      }}
                    >
                      <Check className="h-3 w-3" strokeWidth={3} />
                      {EXTRACTED_LABELS[k]}
                    </span>
                  ))}
                </div>
              ) : null}

              <div dir="rtl" className="relative z-10 flex-1 overflow-y-auto px-4 py-3 space-y-3">
                <AnimatePresence initial={false}>
                  {messages.map((m, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex gap-2 ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}
                    >
                      {m.role === 'assistant' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={avatarUrl}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover object-top shrink-0 mt-1 border border-emerald-400/30"
                        />
                      ) : null}
                      <div
                        className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed ${
                          m.secret ? 'border border-amber-400/40' : ''
                        }`}
                        style={
                          m.role === 'user'
                            ? {
                                background: 'rgba(255,255,255,0.12)',
                                color: '#f1f5f9',
                                border: '1px solid rgba(255,255,255,0.12)',
                                backdropFilter: 'blur(12px)',
                              }
                            : {
                                background: 'linear-gradient(145deg, rgba(4,120,87,0.95), rgba(16,185,129,0.88))',
                                color: '#fff',
                                boxShadow: '0 4px 20px rgba(4,120,87,0.35)',
                              }
                        }
                      >
                        {m.secret ? (
                          <span className="flex items-center gap-1.5 text-amber-200">
                            <FileLock2 className="h-3.5 w-3.5" />
                            {m.content}
                          </span>
                        ) : (
                          m.content
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {loading ? (
                  <div className="flex justify-end gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full opacity-60" />
                    <div
                      className="rounded-2xl px-4 py-3 backdrop-blur-md"
                      style={{ background: 'rgba(16,185,129,0.25)' }}
                    >
                      <Loader2 className="h-4 w-4 animate-spin text-emerald-200" />
                    </div>
                  </div>
                ) : null}
                <div ref={bottomRef} />
              </div>

              {/* ערוץ דיסקרטי */}
              {discreteField ? (
                <div
                  dir="rtl"
                  className="relative z-10 mx-4 mb-2 rounded-2xl p-3 backdrop-blur-xl"
                  style={{
                    background: 'rgba(245,158,11,0.12)',
                    border: '1px solid rgba(251,191,36,0.35)',
                  }}
                >
                  <p className="text-xs font-bold text-amber-200 mb-2 flex items-center gap-1.5">
                    <FileLock2 className="h-4 w-4" />
                    {DISCRETE_FIELD_LABELS[discreteField]} — ערוץ מאובטח (לא נשמר בצ&apos;אט הפתוח)
                  </p>
                  <div className="flex gap-2">
                    <input
                      value={discreteValue}
                      onChange={(e) => setDiscreteValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void sendDiscrete();
                      }}
                      placeholder={DISCRETE_FIELD_PLACEHOLDERS[discreteField]}
                      className="flex-1 rounded-xl px-3 py-2 text-sm text-slate-900 outline-none"
                      style={{ background: 'rgba(255,255,255,0.92)' }}
                      dir="rtl"
                      type={discreteField.includes('weight') ? 'number' : 'text'}
                    />
                    <button
                      type="button"
                      onClick={() => void sendDiscrete()}
                      disabled={!discreteValue.trim() || loading}
                      className="shrink-0 rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg, #b45309, #f59e0b)' }}
                    >
                      שלח בצורה דיסקרטית
                    </button>
                  </div>
                </div>
              ) : null}

              {readyForSummary && !saved ? (
                <div dir="rtl" className="relative z-10 px-4 pb-2">
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={loading}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold text-white"
                    style={{
                      background: 'linear-gradient(145deg, #b45309, #f59e0b)',
                      boxShadow: '0 8px 24px rgba(245,158,11,0.35)',
                    }}
                  >
                    <Check className="h-4 w-4" />
                    שמור לפרופיל (בלי לחשוף פרטים בהיסטוריה)
                  </button>
                </div>
              ) : null}

              {saved ? (
                <div dir="rtl" className="relative z-10 px-4 pb-2">
                  <p className="text-center text-[13px] font-bold text-emerald-300 flex items-center justify-center gap-1.5">
                    <Sparkles className="h-4 w-4" />
                    עודכן! תיעוד סגור נוסף להיסטוריית השיחות — בלי פרטים אישיים
                  </p>
                </div>
              ) : null}

              <div dir="rtl" className="relative z-10 px-4 pb-2">
                <p className="text-[10px] text-slate-400 leading-snug text-center">
                  פרטים רגישים (שם, משקל, שעות) נשלחים בערוץ מאובטח — לא בטקסט חופשי.
                  שיחה מעובדת דרך AI בינלאומי תחת הגנות פרטיות.
                </p>
              </div>

              <div
                dir="rtl"
                className="relative z-10 flex items-center gap-2 px-4 py-3 border-t border-white/8"
                style={{ background: 'rgba(12,18,34,0.85)', backdropFilter: 'blur(16px)' }}
              >
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
                  className="flex-1 rounded-2xl px-4 py-3 text-[14px] text-slate-100 outline-none placeholder:text-slate-500"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.12)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={loading || !input.trim()}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white disabled:opacity-40"
                  style={{
                    background: 'linear-gradient(145deg, #047857, #10b981)',
                    boxShadow: '0 4px 16px rgba(16,185,129,0.4)',
                  }}
                  aria-label="שליחה"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
