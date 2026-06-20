'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { CloudUpload, Loader2, RotateCcw, Upload } from 'lucide-react';
import type { MediaCredit, MediaKind, MediaSource } from '@/lib/validation/media-asset';
import { defaultCreditForSource } from '@/lib/media/credit-display';
import { glassCardStyle, glassInputClass, progressBarStyle } from './glass-styles';
import { uploadMediaAsset, type UploadProgress } from '@/lib/media-manager/upload-client';
import {
  clearUploadDraft,
  loadUploadDraft,
  saveUploadDraft,
} from '@/lib/media-manager/upload-draft';
import type { MediaAsset } from './types';

type MediaUploadZoneProps = {
  kind: Exclude<MediaKind, 'video'>;
  onUploaded: (asset: MediaAsset) => void;
  onError: (msg: string) => void;
};

const SOURCE_OPTIONS: Record<Exclude<MediaKind, 'video'>, { value: MediaSource; label: string }[]> = {
  image: [
    { value: 'upload', label: 'העלאה שלי' },
    { value: 'pixabay', label: 'Pixabay' },
    { value: 'pexels', label: 'Pexels' },
    { value: 'other', label: 'אחר (רישיון חופשי)' },
  ],
  audio: [
    { value: 'upload', label: 'העלאה שלי' },
    { value: 'suno', label: 'Suno AI Pro' },
    { value: 'pixabay', label: 'Pixabay' },
    { value: 'other', label: 'אחר (רישיון חופשי)' },
  ],
  file: [
    { value: 'upload', label: 'העלאה שלי' },
    { value: 'other', label: 'אחר (רישיון חופשי)' },
  ],
};

export function MediaUploadZone({
  kind,
  onUploaded,
  onError,
}: MediaUploadZoneProps) {
  const inputId = useId();
  const titleFieldId = `${inputId}-title`;
  const sourceFieldId = `${inputId}-source`;
  const authorFieldId = `${inputId}-author`;
  const licenseFieldId = `${inputId}-license`;
  const linkFieldId = `${inputId}-link`;
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<UploadProgress>({ phase: 'idle', percent: 0 });
  const [title, setTitle] = useState('');
  const [source, setSource] = useState<MediaSource>('upload');
  const [author, setAuthor] = useState('');
  const [license, setLicense] = useState('');
  const [link, setLink] = useState('');
  const [draftRestored, setDraftRestored] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    hydrated.current = false;
    const draft = loadUploadDraft(kind);
    if (draft && (draft.title || draft.author || draft.license || draft.link || draft.source !== 'upload')) {
      setTitle(draft.title);
      setSource(draft.source);
      setAuthor(draft.author);
      setLicense(draft.license);
      setLink(draft.link);
      setDraftRestored(true);
    } else {
      setTitle('');
      setSource('upload');
      setAuthor('');
      setLicense('');
      setLink('');
      setDraftRestored(false);
    }
    hydrated.current = true;
  }, [kind]);

  useEffect(() => {
    if (!hydrated.current) return;
    saveUploadDraft(kind, { title, source, author, license, link });
  }, [kind, title, source, author, license, link]);

  const resetDraft = useCallback(() => {
    clearUploadDraft(kind);
    setTitle('');
    setSource('upload');
    setAuthor('');
    setLicense('');
    setLink('');
    setDraftRestored(false);
  }, [kind]);

  const accept =
    kind === 'image'
      ? 'image/png,image/jpeg,image/webp,image/avif'
      : kind === 'audio'
        ? 'audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus'
        : '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.txt';

  const processFiles = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0];
      if (!file || busy) return;
      setBusy(true);
      setProgress({ phase: 'transcoding', percent: 0 });

      const hasCreditInfo =
        source !== 'upload' || !!author.trim() || !!license.trim() || !!link.trim();
      const credit: MediaCredit = hasCreditInfo
        ? {
            ...defaultCreditForSource(source),
            author: author.trim() || undefined,
            license: license.trim() || undefined,
            link: link.trim() || undefined,
          }
        : {};

      try {
        const row = await uploadMediaAsset({
          kind,
          file,
          title: title.trim() || undefined,
          source,
          credit,
          onProgress: setProgress,
        });
        onUploaded(row as unknown as MediaAsset);
        clearUploadDraft(kind);
        setTitle('');
        setAuthor('');
        setLicense('');
        setLink('');
        setSource('upload');
        setDraftRestored(false);
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message === 'WEBP_UNSUPPORTED'
              ? 'הדפדפן לא תומך ב-WebP. נסה מכרום/אדג׳.'
              : e.message === 'AUDIO_UNSUPPORTED'
                ? 'לא ניתן לפענח את האודיו. נסה MP3/WAV אחר.'
                : e.message
            : 'העלאה נכשלה';
        onError(msg);
        setProgress({ phase: 'error', percent: 0 });
      } finally {
        setBusy(false);
        if (fileRef.current) fileRef.current.value = '';
      }
    },
    [author, busy, kind, license, link, onError, onUploaded, source, title]
  );

  return (
    <div className="space-y-3">
      {draftRestored ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-300/50 bg-amber-200/15 px-3 py-2 backdrop-blur-sm">
          <span className="text-xs font-semibold text-amber-900">
            שחזרנו את הפרטים שמילאת קודם (כותרת/מקור/קרדיט). בחר קובץ והעלה.
          </span>
          <button
            type="button"
            onClick={resetDraft}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-amber-300/60 bg-white/20 px-2.5 py-1 text-[11px] font-bold text-amber-900"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            התחל מחדש
          </button>
        </div>
      ) : null}

      <div>
        <label htmlFor={titleFieldId} className="mb-1 block text-xs font-bold text-slate-700">
          כותרת (אופציונלי)
        </label>
        <input
          id={titleFieldId}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={glassInputClass}
        />
      </div>

      <div className="rounded-2xl border border-white/40 p-3" style={{ background: 'rgba(255,255,255,0.1)' }}>
        <p className="mb-2 text-xs font-black text-slate-700">מקור וקרדיט</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <label htmlFor={sourceFieldId} className="mb-1 block text-xs font-bold text-slate-700">
              מקור
            </label>
            <select
              id={sourceFieldId}
              value={source}
              onChange={(e) => setSource(e.target.value as MediaSource)}
              className={glassInputClass}
            >
              {SOURCE_OPTIONS[kind].map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={authorFieldId} className="mb-1 block text-xs font-bold text-slate-700">
              יוצר / אמן
            </label>
            <input
              id={authorFieldId}
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className={glassInputClass}
            />
          </div>
          <div>
            <label htmlFor={licenseFieldId} className="mb-1 block text-xs font-bold text-slate-700">
              רישיון
            </label>
            <input
              id={licenseFieldId}
              value={license}
              onChange={(e) => setLicense(e.target.value)}
              className={glassInputClass}
            />
          </div>
        </div>
        <div className="mt-2">
          <label htmlFor={linkFieldId} className="mb-1 block text-xs font-bold text-slate-700">
            קישור למקור (לא חובה)
          </label>
          <input
            id={linkFieldId}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            className={glassInputClass}
            placeholder="https://..."
            dir="ltr"
            inputMode="url"
          />
        </div>
        {source !== 'upload' ? (
          <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
            ודאו עמידה בתנאי הרישיון של המקור. הקרדיט יישמר ויוצג למשתמשים בעת הצורך.
          </p>
        ) : null}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void processFiles(e.dataTransfer.files);
        }}
        className={`relative rounded-2xl p-6 text-center transition ${dragOver ? 'ring-2 ring-emerald-400/70' : ''}`}
        style={glassCardStyle}
      >
        <CloudUpload className="mx-auto h-10 w-10 text-emerald-700/80" />
        <p className="mt-2 text-sm font-bold text-slate-800">גרור קבצים לכאן</p>
        <p className="mt-1 text-xs text-slate-600">או</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-800/85 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          בחר קבצים
        </button>
        <input
          ref={fileRef}
          id={inputId}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(e) => void processFiles(e.target.files)}
        />
      </div>

      {busy || progress.phase !== 'idle' ? (
        <div className="space-y-1">
          <div className="flex justify-between text-xs font-semibold text-slate-700">
            <span>{progress.message ?? progress.phase}</span>
            <span>{progress.percent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/30">
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{ ...progressBarStyle, width: `${progress.percent}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
