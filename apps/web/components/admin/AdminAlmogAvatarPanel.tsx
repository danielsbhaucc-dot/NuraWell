'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ImageUp, Loader2, CheckCircle2, AlertTriangle, Upload, UserCircle } from 'lucide-react';
import { useAlmogAvatarUrl } from '../../lib/client/useAlmogAvatarUrl';
import {
  encodeImageToWebpBlob,
  isWebpEncodeUnsupportedError,
} from '../../lib/client/encodeAlmogAvatarWebp';
import { OpenMediaManagerButton } from '@/components/media-manager/OpenMediaManagerButton';
import { applyAlmogAvatarFromAsset } from '@/lib/media-manager/apply-asset';
import type { MediaAsset } from '@/components/media-manager/types';

type UploadResult = {
  ok?: boolean;
  avatar_url?: string | null;
  cdn_base?: string | null;
  cdn_hostname?: string | null;
  public_object_path?: string;
  cdn_configured?: boolean;
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
  const [uploadTick, setUploadTick] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [fileObjectUrl, setFileObjectUrl] = useState<string | null>(null);
  const {
    avatarUrl: remoteAvatarUrl,
    hasCustom,
    ready: avatarMetaReady,
    cdnConfigured,
    cdnHostname,
    refresh,
  } = useAlmogAvatarUrl(uploadTick);

  useEffect(() => {
    if (!file) {
      setFileObjectUrl(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setFileObjectUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const preview = file && fileObjectUrl ? fileObjectUrl : remoteAvatarUrl;

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
      setUploadTick((t) => t + 1);
      void refresh();
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
      className="relative mb-6 overflow-hidden rounded-3xl border border-white/40 bg-white/45 p-4 shadow-[0_12px_40px_rgba(15,23,42,0.12)] backdrop-blur-2xl transition-all sm:p-6 md:p-8 sm:hover:border-emerald-400/30 sm:hover:shadow-[0_12px_44px_rgba(16,185,129,0.15)]"
      dir="rtl"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 text-right">
          <h2
            className="flex flex-wrap items-center gap-2 text-lg font-black tracking-tight text-slate-800 sm:text-xl"
            style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
          >
            <UserCircle className="h-6 w-6 shrink-0 text-emerald-500" aria-hidden />
            {avatarMetaReady && hasCustom ? 'עדכון תמונת פרופיל — אלמוג' : 'תמונת פרופיל — אלמוג'}
          </h2>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-slate-600">
            רק לדמות אלמוג בצ&apos;אט: מוצגת בצ&apos;אט, במשובים ובהתראות. עדיף תמונה ברורה של פנים,
            ריבועית או פורטרט.
          </p>
          {avatarMetaReady && cdnConfigured && cdnHostname ? (
            <p className="text-xs text-gray-500 mt-2 leading-relaxed max-w-xl">
              קובץ ציבורי ב־CDN{' '}
              <span className="font-semibold text-emerald-800">{cdnHostname}</span>
              {': '}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700" dir="ltr">
                /almog/avatar
              </code>
              <span className="text-gray-500"> — כל העלאה מחליפה את אותו האובייקט ב־R2.</span>
            </p>
          ) : avatarMetaReady ? (
            <p className="text-xs text-amber-800 mt-2 leading-relaxed max-w-xl rounded-lg bg-amber-50/90 border border-amber-200/80 px-3 py-2">
              חסרה כתובת CDN בשרת (<code className="text-[11px]">NEXT_PUBLIC_CDN_URL</code>, למשל{' '}
              <code className="text-[11px]" dir="ltr">
                https://cdn.nurawell.ai
              </code>
              ). בלי זה העלאה ל־R2 עדיין עובדת, אבל האתר לא יבנה קישור ציבורי להצגה.
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 justify-center sm:justify-end">
          <div className="relative h-20 w-20 overflow-hidden rounded-2xl bg-emerald-50 shadow-md ring-2 ring-emerald-200/80 ring-offset-2 ring-offset-white">
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
        <OpenMediaManagerButton
          kind="image"
          label="העלאת תמונה"
          pickLabel="תמונת אלמוג"
          onPicked={(asset: MediaAsset) => {
            void (async () => {
              if (!asset.object_key || busy) return;
              setBusy(true);
              setResult(null);
              try {
                const res = await applyAlmogAvatarFromAsset(asset);
                const data = (await res.json()) as UploadResult;
                if (!res.ok) {
                  setResult({ error: data.error || 'שמירה נכשלה' });
                  return;
                }
                setResult(data);
                setUploadTick((t) => t + 1);
                void refresh();
              } catch {
                setResult({ error: 'שגיאת רשת' });
              } finally {
                setBusy(false);
              }
            })();
          }}
        />

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
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-10 transition-all active:scale-[0.99] sm:py-8',
            dragOver
              ? 'scale-[1.01] border-emerald-500 bg-emerald-50/90'
              : 'border-emerald-200/90 bg-emerald-50/40 hover:border-emerald-300 hover:bg-emerald-50/70',
          ].join(' ')}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-emerald-100">
            <Upload className="h-6 w-6 text-emerald-600" strokeWidth={2} />
          </div>
          <p className="text-sm font-bold text-slate-800">גרור תמונה לכאן או לחץ לבחירה</p>
          <p className="text-xs text-slate-500">PNG, JPEG, WebP או AVIF · עד כ־4MB</p>
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
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-emerald-600 to-teal-500 px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-emerald-500/30 transition-transform hover:brightness-110 active:scale-[0.98] disabled:opacity-45 disabled:shadow-none sm:w-auto sm:self-end sm:text-[15px]"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageUp className="h-5 w-5" />}
          {avatarMetaReady && hasCustom ? 'עדכן תמונת אלמוג' : 'שמור תמונת אלמוג'}
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
            נשמר ב־R2 והוחלף הקובץ הציבורי
          </p>
          <p className="mt-1.5 text-emerald-900/90">
            גודל לפני: {bytesLabel(result.original_bytes)} · אחרי אופטימיזציה:{' '}
            {bytesLabel(result.optimized_bytes)}
            {typeof result.saved_percent === 'number' ? ` · כ־${result.saved_percent}% פחות נפח` : null}
          </p>
          {typeof result.avatar_url === 'string' && result.avatar_url.startsWith('https://') ? (
            <p className="mt-3 text-right">
              <span className="text-xs font-bold text-emerald-900 block mb-1">
                קישור CDN{result.cdn_hostname ? ` (${result.cdn_hostname})` : ''}
              </span>
              <a
                href={result.avatar_url}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-xs font-mono text-emerald-800 underline decoration-emerald-400 hover:text-emerald-950"
                dir="ltr"
              >
                {result.avatar_url}
              </a>
            </p>
          ) : (
            <p className="mt-3 text-xs text-amber-900 bg-amber-100/80 rounded-lg px-3 py-2 border border-amber-200">
              הקובץ עלה לדלי. הגדר ב־Vercel את{' '}
              <code className="text-[11px]">NEXT_PUBLIC_CDN_URL=https://cdn.nurawell.ai</code> כדי שהממשק יציג
              קישור מלא ושהדפדפן יטען מה־CDN.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
