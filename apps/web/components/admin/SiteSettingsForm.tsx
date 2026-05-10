'use client';

import { useEffect, useState } from 'react';
import { Globe, Loader2, Sparkles } from 'lucide-react';
import { PUBLIC_APP_URL_DEFAULT } from '@/lib/public-app-url';

const PRESET_PROD = 'https://nurawell.ai';

const REMINDER_TEXT = `NuraWell — תזכורת (שלב מעבר):
כשהדומיין והאתר יציבים, עדכן ב-Vercel את NEXT_PUBLIC_APP_URL, ושקול להחזיר ב"הגדרות אתר" לכתובת Vercel או למחוק override זמני מהמסד.
אפשר למחוק הודעה זו אחרי ביצוע.`;

export function SiteSettingsForm() {
  const [url, setUrl] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/admin/site-settings');
        const j = await res.json();
        if (!cancelled && res.ok && typeof j.public_app_url === 'string') {
          setUrl(j.public_app_url);
          setUpdatedAt(typeof j.updated_at === 'string' ? j.updated_at : null);
        }
      } catch {
        if (!cancelled) setError('טעינה נכשלה');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyProdPreset = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/v1/admin/site-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_app_url: PRESET_PROD }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(typeof j.error === 'string' ? j.error : 'שמירה נכשלה');
        return;
      }
      if (typeof j.public_app_url === 'string') setUrl(j.public_app_url);
      if (typeof j.updated_at === 'string') setUpdatedAt(j.updated_at);

      try {
        await navigator.clipboard.writeText(REMINDER_TEXT);
        setMessage(
          'ההפניות מ־Ops מצביעות כעת ל־nurawell.ai. הודעת תזכורת הועתקה ללוח — שלח לעצמך במייל/ווטסאפ ומחק אחרי שסיימת את השלב.',
        );
      } catch {
        setMessage(
          `ההפניות עודכנו ל־${PRESET_PROD}. העתק ידנית את התזכורת מהתיבה למטה ושלח לעצמך.`,
        );
      }
    } catch {
      setError('שמירה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        טוען…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/35 bg-white/40 p-5 shadow-lg backdrop-blur-xl sm:p-6">
        <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <Globe className="h-4 w-4 text-emerald-700" aria-hidden />
          כתובת האתר הציבורי
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          ברירת המחדל בקוד היא <strong className="font-semibold">{PUBLIC_APP_URL_DEFAULT}</strong>. ערך נשמר במסד ומעדכן
          הפניות מדומיין Ops (לוגין וכו׳).
        </p>
        <p
          dir="ltr"
          className="mt-3 rounded-xl border border-slate-200/80 bg-white/70 px-4 py-3 text-left text-sm text-slate-800"
        >
          {url || '—'}
        </p>
        {updatedAt && (
          <p className="mt-2 text-xs text-slate-500">עדכון אחרון: {new Date(updatedAt).toLocaleString('he-IL')}</p>
        )}
      </div>

      <div className="rounded-2xl border border-amber-400/35 bg-amber-50/50 p-5 shadow-md backdrop-blur-xl sm:p-6">
        <p className="text-sm font-bold text-amber-950">שלב מעבר — מעבר ל־NuraWell.ai</p>
        <p className="mt-2 text-sm text-amber-950/90">
          לחיצה אחת מעדכנת את כתובת ההפניות ל־<strong className="font-semibold">{PRESET_PROD}</strong> ומעתיקה תזכורת לניקוי
          ההגדרה כשתסיים עם השלב.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void applyProdPreset()}
          className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-amber-600 px-6 py-3 font-bold text-white shadow-lg transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Sparkles className="h-5 w-5" aria-hidden />}
          החלף ל־NuraWell.ai והעתק תזכורת
        </button>
      </div>

      <div className="rounded-xl border border-slate-300/60 bg-slate-50/80 p-4 text-sm text-slate-700">
        <p className="font-semibold text-slate-800">טקסט התזכורת (להעתקה ידנית)</p>
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-white/90 p-3 text-xs leading-relaxed text-slate-800">
          {REMINDER_TEXT}
        </pre>
      </div>

      {message && <p className="text-sm font-medium text-emerald-800">{message}</p>}
      {error && <p className="text-sm font-medium text-red-700">{error}</p>}
    </div>
  );
}
