'use client';

import { useEffect, useState } from 'react';
import { Globe, Loader2, Save } from 'lucide-react';
import { PUBLIC_APP_URL_DEFAULT } from '@/lib/public-app-url';

const PRESET_VERCEL = PUBLIC_APP_URL_DEFAULT;
const PRESET_PROD = 'https://nurawell.ai';

export function SiteSettingsForm() {
  const [url, setUrl] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/v1/admin/site-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_app_url: url.trim() }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(typeof j.error === 'string' ? j.error : 'שמירה נכשלה');
        return;
      }
      if (typeof j.public_app_url === 'string') setUrl(j.public_app_url);
      if (typeof j.updated_at === 'string') setUpdatedAt(j.updated_at);
      setMessage('נשמר. הפניות מדומיין Ops ישתמשו בכתובת הזו (גם אם NEXT_PUBLIC_APP_URL ב־Vercel שונה).');
    } catch {
      setError('שמירה נכשלה');
    } finally {
      setSaving(false);
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
        <label htmlFor="public-app-url" className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <Globe className="h-4 w-4 text-emerald-700" aria-hidden />
          כתובת האתר הציבורי (לוגין וקישורים מ־Ops)
        </label>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          כרגע ברירת המחדל בפרויקט היא <strong className="font-semibold">{PRESET_VERCEL}</strong>. אחרי שתחבר את הדומיין
          הקבוע, עדכן כאן ל־<strong className="font-semibold">{PRESET_PROD}</strong> (או ל־URL המדויק של האתר).
        </p>
        <input
          id="public-app-url"
          type="url"
          dir="ltr"
          className="mt-4 w-full rounded-xl border border-slate-300/80 bg-white/80 px-4 py-3 text-left text-base text-slate-900 shadow-inner outline-none ring-emerald-500/30 placeholder:text-slate-400 focus:ring-2"
          placeholder={PRESET_VERCEL}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          autoComplete="off"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-emerald-400/40 bg-emerald-900/10 px-3 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-900/20"
            onClick={() => setUrl(PRESET_VERCEL)}
          >
            מילוי: Vercel (זמני)
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-400/40 bg-slate-900/10 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-900/15"
            onClick={() => setUrl(PRESET_PROD)}
          >
            מעבר ל־NuraWell.ai
          </button>
        </div>
        {updatedAt && (
          <p className="mt-3 text-xs text-slate-500">
            עדכון אחרון: {new Date(updatedAt).toLocaleString('he-IL')}
          </p>
        )}
      </div>

      <button
        type="button"
        disabled={saving || !url.trim()}
        onClick={() => void save()}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3 font-bold text-white shadow-lg shadow-emerald-900/25 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Save className="h-5 w-5" aria-hidden />}
        שמור
      </button>

      {message && <p className="text-sm font-medium text-emerald-800">{message}</p>}
      {error && <p className="text-sm font-medium text-red-700">{error}</p>}
    </div>
  );
}
