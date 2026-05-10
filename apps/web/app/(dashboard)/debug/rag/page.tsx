'use client';

import { useCallback, useState } from 'react';

type StatusPayload = {
  ok?: boolean;
  openrouter_key_configured?: boolean;
  upstash_env_configured?: boolean;
  upstash_reachable?: boolean;
  upstash_error?: string;
};

export default function RagDebugPage() {
  const [message, setMessage] = useState(
    'קשה לי בסופי שבוע לאכול נכון. ביום שני בבוקר אני מתכנן הליכה חצי שעה.'
  );
  const [prodSecret, setProdSecret] = useState('');
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [previewJson, setPreviewJson] = useState<string | null>(null);
  const [writeJson, setWriteJson] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<'idle' | 'status' | 'preview' | 'write'>('idle');

  const checkConnection = useCallback(async () => {
    setError(null);
    setLoading('status');
    try {
      const res = await fetch('/api/v1/ai/rag-debug/status', { credentials: 'include' });
      const j = (await res.json()) as StatusPayload & { error?: string };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setStatus(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading('idle');
    }
  }, []);

  const postSelfTest = async (write: boolean) => {
    setError(null);
    setLoading(write ? 'write' : 'preview');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const sec = prodSecret.trim();
      if (sec) headers['x-rag-self-test-secret'] = sec;

      const res = await fetch('/api/v1/ai/rag-self-test', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ message, write }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      const formatted = JSON.stringify(j, null, 2);
      if (write) {
        setWriteJson(formatted);
      } else {
        setPreviewJson(formatted);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading('idle');
    }
  };

  const busy = loading !== 'idle';

  return (
    <div dir="rtl" className="mx-auto max-w-2xl px-4 py-8 text-right">
      <h1 className="mb-2 text-xl font-semibold text-neutral-900">בדיקת זיכרון RAG</h1>
      <p className="mb-6 text-sm leading-relaxed text-neutral-600">
        כאן רואים מה המערכת <strong>מחלצת</strong> מהטקסט (Llama Scout), אילו וקטורים דומים נמצאו ב-Upstash,
        ומה קורה אם מפעילים כתיבה. התחברות חובה (עמוד זה בתוך האפליקציה המשוחזרת).
      </p>

      <section className="mb-8 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 font-medium text-neutral-800">איך לוודא שזה עובד (פשוט)</h2>
        <ol className="list-decimal pr-5 text-sm leading-relaxed text-neutral-700 space-y-2">
          <li>
            לחץ <strong>«בדיקת חיבור»</strong> — צריך לראות ירוק: מפתח OpenRouter מוגדר ו-Upstash נגיש.
          </li>
          <li>
            הקלד משפט על הרגלים/משקל (לא «היי» בלבד), ולחץ <strong>«חילוץ בלבד»</strong> — ב־
            <code className="rounded bg-neutral-100 px-1 text-xs">preview.extraction.facts</code> יופיעו עובדות.
          </li>
          <li>
            אופציונלי: <strong>«חילוץ + כתיבה ל-Upstash»</strong> — רק אחרי שחיבור תקין; אם כבר יש זיכרון דומה,
            תראה <code className="rounded bg-neutral-100 px-1 text-xs">merged</code> או{' '}
            <code className="rounded bg-neutral-100 px-1 text-xs">exact_refresh</code>.
          </li>
          <li>
            אם הגדרת ב-Vercel את{' '}
            <code className="rounded bg-neutral-100 px-1 text-xs">RAG_SELF_TEST_SECRET</code> — חובה להזין אותו בשדה למטה
            (כותרת לשרת). בלי משתנה כזה בשרת, מספיק להיות מחובר לאפליקציה.
          </li>
        </ol>
      </section>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">טקסט לבדיקה</label>
          <textarea
            className="min-h-[120px] w-full rounded-lg border border-neutral-300 bg-white p-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={busy}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            סוד בדיקה ב-production (אופציונלי)
          </label>
          <input
            type="password"
            className="w-full rounded-lg border border-neutral-300 bg-white p-2 text-sm text-neutral-900 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            value={prodSecret}
            onChange={(e) => setProdSecret(e.target.value)}
            placeholder="RAG_SELF_TEST_SECRET — רק אם צריך"
            disabled={busy}
            autoComplete="off"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            disabled={busy}
            onClick={() => void checkConnection()}
          >
            {loading === 'status' ? 'בודק…' : 'בדיקת חיבור'}
          </button>
          <button
            type="button"
            className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
            disabled={busy || !message.trim()}
            onClick={() => void postSelfTest(false)}
          >
            {loading === 'preview' ? 'שולח…' : 'חילוץ בלבד (ללא כתיבה)'}
          </button>
          <button
            type="button"
            className="rounded-lg border border-amber-600 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            disabled={busy || !message.trim()}
            onClick={() => {
              if (!confirm('לכתוב וקטורים ל-Upstash עבור המשתמש המחובר?')) return;
              void postSelfTest(true);
            }}
          >
            {loading === 'write' ? 'כותב…' : 'חילוץ + כתיבה ל-Upstash'}
          </button>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
        ) : null}

        {status ? (
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
            <p className="font-medium text-neutral-800">סטטוס חיבור</p>
            <ul className="mt-2 space-y-1 text-neutral-700">
              <li>OpenRouter (מפתח מוגדר): {status.openrouter_key_configured ? 'כן' : 'לא'}</li>
              <li>Upstash (משתני סביבה): {status.upstash_env_configured ? 'כן' : 'לא'}</li>
              <li>Upstash (רשת): {status.upstash_reachable ? 'כן' : 'לא'}</li>
              {status.upstash_error ? (
                <li className="text-red-700">שגיאה: {status.upstash_error}</li>
              ) : null}
              <li className="pt-1 font-medium">
                סה״כ:{' '}
                <span className={status.ok ? 'text-emerald-700' : 'text-amber-800'}>
                  {status.ok ? 'מוכן לחילוץ' : 'חסר משהו — תקן env והרץ שוב'}
                </span>
              </li>
            </ul>
          </div>
        ) : null}

        {previewJson ? (
          <div>
            <p className="mb-1 text-sm font-medium text-neutral-700">תוצאת חילוץ (preview)</p>
            <pre className="max-h-[320px] overflow-auto rounded-lg border border-neutral-200 bg-neutral-900 p-3 text-xs text-emerald-100">
              {previewJson}
            </pre>
          </div>
        ) : null}

        {writeJson ? (
          <div>
            <p className="mb-1 text-sm font-medium text-neutral-700">תוצאה אחרי כתיבה</p>
            <pre className="max-h-[320px] overflow-auto rounded-lg border border-amber-200 bg-neutral-900 p-3 text-xs text-amber-100">
              {writeJson}
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}
