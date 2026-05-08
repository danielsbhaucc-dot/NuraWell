'use client';

import { useMemo, useState } from 'react';
import { ImageUp, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { getAlmogAvatarUrl } from '../../lib/ai/almog-avatar';

type UploadResult = {
  ok?: boolean;
  avatar_url?: string;
  original_bytes?: number;
  optimized_bytes?: number;
  saved_percent?: number;
  error?: string;
};

function bytesLabel(n?: number): string {
  if (!n) return '-';
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(2)}MB`;
}

export function AdminAlmogAvatarPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [cacheBuster, setCacheBuster] = useState<string>(() => Date.now().toString());

  const preview = useMemo(
    () => (file ? URL.createObjectURL(file) : getAlmogAvatarUrl(cacheBuster)),
    [file, cacheBuster]
  );

  const onUpload = async () => {
    if (!file || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/v1/admin/almog-avatar', { method: 'POST', body: form });
      const data = (await res.json()) as UploadResult;
      setResult(data);
      if (res.ok) {
        setFile(null);
        setCacheBuster(Date.now().toString());
      }
    } catch {
      setResult({ error: 'העלאה נכשלה. בדוק הרשאות/חיבור ונסה שוב.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="rounded-2xl p-4 mb-6"
      style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 4px 16px rgba(0,0,0,0.05)' }}
      dir="rtl"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="text-right">
          <h2 className="text-lg font-black" style={{ color: '#1A1730', fontFamily: "'Rubik','Heebo',sans-serif" }}>
            אווטאר אלמוג (R2)
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            העלה תמונה אחת — המערכת תדחוס, תמיר ל־WebP ותשמור ב־R2 בנתיב קבוע.
          </p>
        </div>
        <img src={preview} alt="תצוגת אלמוג" className="h-16 w-16 rounded-2xl object-cover border border-emerald-200" />
      </div>

      <div className="mt-4 flex flex-col sm:flex-row gap-3">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void onUpload()}
          disabled={!file || busy}
          className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #047857, #10b981)' }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
          העלה ל־R2
        </button>
      </div>

      {result?.error && (
        <p className="mt-3 inline-flex items-center gap-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4" />
          {result.error}
        </p>
      )}
      {result?.ok && (
        <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-900">
          <p className="inline-flex items-center gap-2 font-bold">
            <CheckCircle2 className="h-4 w-4" />
            הועלה בהצלחה
          </p>
          <p className="mt-1">לפני: {bytesLabel(result.original_bytes)} | אחרי: {bytesLabel(result.optimized_bytes)}</p>
          <p>חיסכון משוער: {result.saved_percent ?? 0}%</p>
        </div>
      )}
    </section>
  );
}

