'use client';

import { useState } from 'react';

/**
 * 🧪 עמוד בדיקה זמני (admin) — מעבדת מודלים להתראות.
 * יוצר התראת אמת כמו ה-CRON, בלי הגבלה, עם בורר מודל.
 * ⚠️ למחיקה אחרי בחירת מודל.
 */

const MODELS: Array<{ key: string; label: string }> = [
  { key: 'claude', label: 'Claude (Sonnet 4.6)' },
  { key: 'gemini', label: 'Gemini 3.5 Flash' },
  { key: 'gpt5mini', label: 'GPT-5 mini' },
  { key: 'qwen', label: 'Qwen 3.7 Plus' },
  { key: 'deepseek', label: 'DeepSeek' },
  { key: 'llama_groq', label: 'LLaMA 4 (Groq)' },
];

const SLOTS: Array<{ key: string; label: string }> = [
  { key: 'auto', label: 'אוטומטי (לפי השעה)' },
  { key: 'morning', label: 'בוקר' },
  { key: 'midday', label: 'צהריים' },
  { key: 'evening', label: 'ערב' },
];

type ResultRow = {
  model: string;
  modelLabel: string;
  ok: boolean;
  title?: string | null;
  body?: string | null;
  error?: string;
  synthetic?: boolean;
  at: string;
};

export default function NotifyModelLabPage() {
  const [model, setModel] = useState('gpt5mini');
  const [slot, setSlot] = useState('auto');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ResultRow[]>([]);

  const run = async () => {
    setBusy(true);
    const modelLabel = MODELS.find((m) => m.key === model)?.label ?? model;
    try {
      const res = await fetch('/api/v1/admin/notify-model-lab', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          ...(slot !== 'auto' ? { slot } : {}),
        }),
      });
      const j = await res.json();
      setResults((prev) => [
        {
          model,
          modelLabel,
          ok: Boolean(j.ok),
          title: j.title ?? null,
          body: j.body ?? null,
          error: j.error,
          synthetic: j.used_synthetic_payload,
          at: new Date().toLocaleTimeString('he-IL'),
        },
        ...prev,
      ]);
    } catch (e) {
      setResults((prev) => [
        {
          model,
          modelLabel,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
          at: new Date().toLocaleTimeString('he-IL'),
        },
        ...prev,
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div dir="rtl" className="mx-auto max-w-2xl px-4 py-8 text-right">
      <h1 className="mb-2 text-xl font-semibold text-neutral-900">🧪 מעבדת מודלים להתראות</h1>
      <p className="mb-6 text-sm leading-relaxed text-neutral-600">
        יוצר התראת אמת <strong>בדיוק כמו ה-CRON</strong> (אותו תכנון, אותו prompt), אבל ללא הגבלה ועם
        בחירת מודל. ההתראה נכנסת לפעמון אצלך. כלי זמני — יימחק אחרי בחירת מודל.
      </p>

      <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">מודל</label>
          <select
            className="w-full rounded-lg border border-neutral-300 bg-white p-2 text-sm text-neutral-900 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={busy}
          >
            {MODELS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">חלון יום (slot)</label>
          <select
            className="w-full rounded-lg border border-neutral-300 bg-white p-2 text-sm text-neutral-900 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            value={slot}
            onChange={(e) => setSlot(e.target.value)}
            disabled={busy}
          >
            {SLOTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          disabled={busy}
          onClick={() => void run()}
        >
          {busy ? 'יוצר התראה…' : 'צור התראה אמיתית עכשיו'}
        </button>
      </div>

      {results.length > 0 ? (
        <div className="mt-6 space-y-3">
          <h2 className="text-sm font-medium text-neutral-700">תוצאות (האחרונה למעלה)</h2>
          {results.map((r, i) => (
            <div
              key={i}
              className={`rounded-lg border p-3 text-sm ${
                r.ok
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-red-200 bg-red-50'
              }`}
            >
              <div className="mb-1 flex items-center justify-between text-xs text-neutral-500">
                <span className="font-semibold text-neutral-700">{r.modelLabel}</span>
                <span>{r.at}</span>
              </div>
              {r.ok ? (
                <>
                  {r.title ? (
                    <p className="font-semibold text-neutral-900">{r.title}</p>
                  ) : null}
                  <p className="mt-1 leading-relaxed text-neutral-800">{r.body}</p>
                  {r.synthetic ? (
                    <p className="mt-2 text-xs text-amber-700">
                      ⚠️ אין משימה פתוחה כרגע — נוצר payload סינתטי לבדיקה.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-red-800">שגיאה: {r.error}</p>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
