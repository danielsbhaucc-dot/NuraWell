'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ImageUp, Loader2, CheckCircle2, AlertTriangle, Upload, UserCircle } from 'lucide-react';
import type { MentorId } from '@/lib/mentors/registry';
import { MENTORS } from '@/lib/mentors/registry';
import { useMentorAvatarUrl } from '@/lib/client/useMentorAvatarUrl';
import {
  encodeImageToWebpBlob,
  isWebpEncodeUnsupportedError,
} from '@/lib/client/encodeAlmogAvatarWebp';
import { OpenMediaManagerButton } from '@/components/media-manager/OpenMediaManagerButton';
import { applyMentorAvatarFromAsset } from '@/lib/media-manager/apply-asset';
import type { MediaAsset } from '@/components/media-manager/types';

type UploadResult = {
  ok?: boolean;
  error?: string;
  saved_percent?: number;
};

type AdminMentorAvatarPanelProps = {
  mentorId: MentorId;
};

export function AdminMentorAvatarPanel({ mentorId }: AdminMentorAvatarPanelProps) {
  const mentor = MENTORS[mentorId];
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [uploadTick, setUploadTick] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [fileObjectUrl, setFileObjectUrl] = useState<string | null>(null);
  const { avatarUrl: remoteAvatarUrl, hasCustom, ready, cdnConfigured, cdnHostname, refresh } =
    useMentorAvatarUrl(mentorId, uploadTick);

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
    try {
      let webpBlob: Blob;
      try {
        webpBlob = await encodeImageToWebpBlob(file, 900, 0.84);
      } catch (e) {
        if (isWebpEncodeUnsupportedError(e)) {
          setResult({ error: 'הדפדפן לא תומך ב-WebP כאן.' });
          return;
        }
        setResult({ error: 'לא הצלחנו להכין את התמונה.' });
        return;
      }

      const webpFile = new File([webpBlob], `${mentorId}.webp`, { type: 'image/webp' });
      const form = new FormData();
      form.append('file', webpFile);
      form.append('original_bytes', String(file.size));
      const res = await fetch(`/api/v1/admin/mentors/${mentorId}/avatar`, { method: 'POST', body: form });
      const data = (await res.json()) as UploadResult;
      if (!res.ok) {
        setResult({ error: data.error || `שגיאה ${res.status}` });
        return;
      }
      setResult(data);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setUploadTick((t) => t + 1);
      void refresh();
    } catch {
      setResult({ error: 'שגיאת רשת' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="relative mb-6 overflow-hidden rounded-3xl border border-white/40 bg-white/45 p-4 shadow-[0_12px_40px_rgba(15,23,42,0.12)] backdrop-blur-2xl sm:p-6"
      dir="rtl"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 text-right">
          <h2
            className="flex flex-wrap items-center gap-2 text-lg font-black text-slate-800 sm:text-xl"
            style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
          >
            <UserCircle className="h-6 w-6 shrink-0 text-emerald-500" aria-hidden />
            {ready && hasCustom ? `עדכון — ${mentor.name}` : mentor.name}
          </h2>
          <p className="mt-1.5 text-sm text-slate-600">{mentor.description}</p>
          {ready && cdnConfigured && cdnHostname ? (
            <p className="text-xs text-gray-500 mt-2">
              CDN <span className="font-semibold">{cdnHostname}</span>
              <code className="mx-1 rounded bg-slate-100 px-1" dir="ltr">
                /{mentor.objectKey}
              </code>
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 justify-center sm:justify-end">
          <div className="relative h-20 w-20 overflow-hidden rounded-2xl ring-2 ring-emerald-200/80">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="תצוגה מקדימה של אוatar מנטור" className="h-full w-full object-cover" />
          </div>
        </div>
      </div>

      <OpenMediaManagerButton
        kind="image"
        label="העלאת תמונה"
        className="mb-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-300/60 bg-emerald-800/10 px-4 py-3 text-sm font-bold text-emerald-900 sm:w-auto"
        onPicked={(asset: MediaAsset) => {
          void (async () => {
            if (!asset.object_key || busy) return;
            setBusy(true);
            setResult(null);
            try {
              const res = await applyMentorAvatarFromAsset(mentorId, asset);
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

      <input
        ref={fileInputRef}
        id={inputId}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        className="sr-only"
        onChange={(e) => pickFiles(e.target.files)}
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
          'mt-5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 transition-all',
          dragOver ? 'border-emerald-500 bg-emerald-50/90' : 'border-emerald-200/90 bg-emerald-50/40',
        ].join(' ')}
      >
        <Upload className="h-6 w-6 text-emerald-600" />
        <p className="text-sm font-bold text-slate-800">גרור תמונה או לחץ לבחירה</p>
        {file ? <p className="text-xs text-emerald-800">{file.name}</p> : null}
      </label>

      <button
        type="button"
        onClick={() => void onUpload()}
        disabled={!file || busy}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-emerald-600 to-teal-500 px-6 py-3 font-bold text-white disabled:opacity-45 sm:w-auto sm:self-end"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageUp className="h-5 w-5" />}
        שמור תמונת {mentor.name}
      </button>

      {result?.error ? (
        <p className="mt-3 text-sm text-red-800 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {result.error}
        </p>
      ) : null}
      {result?.ok ? (
        <p className="mt-3 text-sm text-emerald-900 flex gap-2">
          <CheckCircle2 className="w-4 h-4" />
          נשמר ב-R2
          {result.saved_percent != null ? ` · ${result.saved_percent}% פחות נפח` : null}
        </p>
      ) : null}
    </section>
  );
}