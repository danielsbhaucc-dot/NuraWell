'use client';

import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { ImageUp, Loader2, CheckCircle2, AlertTriangle, Upload } from 'lucide-react';
import { getAlmogAvatarUrl } from '../../lib/ai/almog-avatar';
import {
  encodeImageToWebpBlob,
  isWebpEncodeUnsupportedError,
} from '../../lib/client/encodeAlmogAvatarWebp';

type UploadResult = {
  ok?: boolean;
  avatar_url?: string;
  original_bytes?: number;
  optimized_bytes?: number;
  saved_percent?: number;
  error?: string;
};

function bytesLabel(n?: number): string {
  if (!n) return '—';
  if (n < 1024) return `${n} בתים`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function AdminAlmogAvatarPanel() {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [cacheBuster, setCacheBuster] = useState<string>(() => Date.now().toString());
  const [dragOver, setDragOver] = useState(false);

  const preview = useMemo(
    () => (file ? URL.createObjectURL(file) : getAlmogAvatarUrl(cacheBuster)),
    [file, cacheBuster]
  );

  const pickFiles = useCallback((list: FileList | null) => {
    const f = list?.[0];
    if (f && f.type.startsWith('image/')) setFile(f);
  }, []);

  const onUpload = async () => {
    if (!file || busy) return;
    setBusy(true);
    setResult(null);
    const originalSize = file.size;
    try {
      let webpBlob: Blob;
      try {
        webpBlob = await encodeImageToWebpBlob(file, 900, 0.84);
      } catch (e) {
        if (isWebpEncodeUnsupportedError(e)) {
          setResult({
            error:
              'הדפדפן לא יודע לייצא WebP כאן. פתח את לוח הניהול מכרום, אדג\' או דפדפן מעודכן, ונסה שוב.',
          });
          return;
        }
        setResult({
          error: 'לא הצלחנו להכין את התמונה במכשיר. נסה קובץ אחר או תמונה קטנה יותר.',
        });
        return;
      }

      const webpFile = new File([webpBlob], 'almog.webp', { type: 'image/webp' });
      const form = new FormData();
      form.append('file', webpFile);
      form.append('original_bytes', String(originalSize));
      const res = await fetch('/api/v1/admin/almog-avatar', { method: 'POST', body: form });
      const raw = await res.text();
      let data: UploadResult = {};
      try {
        data = JSON.parse(raw) as UploadResult;
      } catch {
        setResult({
          error:
            res.status === 413
              ? 'הקובץ גדול מדי לשרת. נסה קובץ קטן יותר (עד כ־4MB).'
              : 'תשובה לא צפויה מהשרת. נסה שוב או רענן את הדף.',
        });
        return;
      }

      if (!res.ok) {
        setResult({
          error: data.error || `משהו השתבש (קוד ${res.status})`,
        });
        return;
      }

      setResult(data);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setCacheBuster(Date.now().toString());
    } catch {
      setResult({
        error: 'לא הצלחנו להתחבר לשרת. בדוק חיבור אינטרנט ונסה שוב.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="rounded-2xl p-5 mb-6 overflow-hidden"
      style={{
        background: 'linear-gradient(165deg, #ffffff 0%, #f8fafc 100%)',
        border: '1px solid rgba(6,78,59,0.1)',
        boxShadow: '0 8px 28px rgba(6,78,59,0.07)',
      }}
      dir="rtl"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="text-right flex-1">
          <h2
            className="text-xl font-black tracking-tight"
            style={{ color: '#1A1730', fontFamily: "'Rubik','Heebo',sans-serif" }}
          >
            תמונת אלמוג
          </h2>
          <p className="text-sm text-gray-600 mt-1.5 leading-relaxed max-w-xl">
            מוצגת בצ&apos;אט, במשובים ובהתראות. עדיף תמונה ברורה של הפנים, ריבועית או פורטרט.
          </p>
        </div>
        <div className="flex justify-center sm:justify-end shrink-0">
          <div
            className="relative h-20 w-20 rounded-2xl overflow-hidden ring-2 ring-emerald-200/80 ring-offset-2 ring-offset-white shadow-md"
            style={{ background: '#ecfdf5' }}
          >
            <img src={preview} alt="תצוגה מקדימה" className="h-full w-full object-cover" />
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        id={inputId}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        className="sr-only"
        onChange={(e) => pickFiles(e.target.files)}
      />

      <div className="mt-5 flex flex-col gap-3">
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            pickFiles(e.dataTransfer.files);
          }}
          className={[
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 transition-all',
            dragOver
              ? 'border-emerald-500 bg-emerald-50/80 scale-[1.01]'
              : 'border-gray-200 bg-white/80 hover:border-emerald-300 hover:bg-emerald-50/40',
          ].join(' ')}
        >
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full"
            style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(5,150,105,0.12))' }}
          >
            <Upload className="h-6 w-6 text-emerald-700" strokeWidth={2} />
          </div>
          <p className="text-sm font-bold text-gray-800">גרור תמונה לכאן או לחץ לבחירה</p>
          <p className="text-xs text-gray-500">PNG, JPEG, WebP או AVIF · עד כ־4MB</p>
          {file && (
            <p className="text-xs font-semibold text-emerald-800 mt-1">
              נבחר: {file.name}
            </p>
          )}
        </label>

        <button
          type="button"
          onClick={() => void onUpload()}
          disabled={!file || busy}
          className="inline-flex w-full sm:w-auto sm:self-end items-center justify-center gap-2 rounded-2xl px-6 py-3.5 font-bold text-white shadow-lg disabled:opacity-45 disabled:shadow-none transition-transform active:scale-[0.98]"
          style={{
            background: 'linear-gradient(135deg, #047857, #10b981)',
            boxShadow: '0 8px 24px rgba(16,185,129,0.35)',
          }}
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageUp className="h-5 w-5" />}
          שמור תמונה
        </button>
      </div>

      {result?.error && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-900">
          <p className="inline-flex items-start gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            {result.error}
          </p>
        </div>
      )}

      {result?.ok && (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/95 px-4 py-3 text-sm text-emerald-950">
          <p className="inline-flex items-center gap-2 font-bold">
            <CheckCircle2 className="h-4 w-4" />
            נשמר בהצלחה
          </p>
          <p className="mt-1.5 text-emerald-900/90">
            גודל לפני: {bytesLabel(result.original_bytes)} · אחרי אופטימיזציה:{' '}
            {bytesLabel(result.optimized_bytes)}
            {typeof result.saved_percent === 'number' ? ` · כ־${result.saved_percent}% פחות נפח` : null}
          </p>
        </div>
      )}
    </section>
  );
}
