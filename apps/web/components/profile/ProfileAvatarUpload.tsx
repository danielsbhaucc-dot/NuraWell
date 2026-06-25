'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Camera, ImageUp, Loader2, Trash2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { encodeProfileAvatarWebp } from '@/lib/client/encodeProfileAvatarWebp';
import { isWebpEncodeUnsupportedError } from '@/lib/client/encodeAlmogAvatarWebp';
import { AnimatedDialog } from '../shared/AnimatedDialog';

type Props = {
  open: boolean;
  onClose: () => void;
  currentInitials: string;
  onUploaded: (url: string | null) => void;
};

export function ProfileAvatarUpload({ open, onClose, currentInitials, onUploaded }: Props) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const pickFile = useCallback((f: File | null) => {
    if (f && f.type.startsWith('image/')) {
      setFile(f);
      setError(null);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) pickFile(blob);
          break;
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [open, pickFile]);

  const upload = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    const originalSize = file.size;
    try {
      let webpBlob: Blob;
      try {
        webpBlob = await encodeProfileAvatarWebp(file);
      } catch (e) {
        setError(
          isWebpEncodeUnsupportedError(e)
            ? 'הדפדפן לא תומך בדחיסה — נסה כרום או אדג׳'
            : 'לא הצלחנו להכין את התמונה'
        );
        return;
      }

      const webpFile = new File([webpBlob], 'avatar.webp', { type: 'image/webp' });
      const form = new FormData();
      form.append('file', webpFile);
      form.append('original_bytes', String(originalSize));

      const res = await fetch('/api/v1/profile/avatar', { method: 'POST', body: form });
      const data = (await res.json()) as { avatar_url?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? 'העלאה נכשלה');
        return;
      }

      onUploaded(data.avatar_url ?? null);
      setFile(null);
      onClose();
    } catch {
      setError('בעיית רשת — נסה שוב');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/profile/avatar', { method: 'DELETE' });
      if (!res.ok) {
        setError('מחיקה נכשלה');
        return;
      }
      onUploaded(null);
      setFile(null);
      onClose();
    } catch {
      setError('בעיית רשת');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatedDialog
      open={open}
      onClose={onClose}
      zIndex={290}
      aria-label="העלאת תמונת פרופיל"
      backdropClassName="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
      panelClassName="crystal-surface max-w-md overflow-hidden rounded-3xl shadow-2xl"
    >
      <div dir="rtl" className="crystal-header flex items-center justify-between px-4 py-3">
        <h3 className="text-lg font-black text-white flex items-center gap-2">
          <Camera className="h-5 w-5" />
          תמונת פרופיל
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/90 hover:bg-white/15"
          aria-label="סגור"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-5 space-y-4">
        <p className="text-sm text-slate-600 text-right leading-relaxed">
          גרור תמונה, לחץ לבחירה, או <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">Ctrl+V</kbd> להדבקה.
          התמונה תידחס אוטומטית ותישמר בצורה מאובטחת.
        </p>

        <div
          role="button"
          tabIndex={0}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            pickFile(e.dataTransfer.files?.[0] ?? null);
          }}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click();
          }}
          className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 transition cursor-pointer ${
            dragOver
              ? 'border-emerald-400 bg-emerald-50/80'
              : 'border-emerald-200/80 bg-gradient-to-br from-emerald-50/60 to-teal-50/40'
          }`}
        >
          <AnimatePresence mode="wait">
            {preview ? (
              <motion.img
                key="preview"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                src={preview}
                alt="תצוגה מקדימה"
                className="h-28 w-28 rounded-2xl object-cover shadow-lg"
              />
            ) : (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex h-28 w-28 items-center justify-center rounded-2xl text-3xl font-black text-white shadow-lg"
                style={{ background: 'linear-gradient(135deg, #14b8a6, #10b981)' }}
              >
                {currentInitials}
              </motion.div>
            )}
          </AnimatePresence>
          <p className="mt-3 text-sm font-bold text-emerald-800 flex items-center gap-1.5">
            <ImageUp className="h-4 w-4" />
            {file ? file.name : 'בחר או גרור תמונה'}
          </p>
          <input
            id={inputId}
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
        </div>

        {error ? <p className="text-sm font-semibold text-red-600 text-right">{error}</p> : null}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void upload()}
            disabled={!file || busy}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
            שמור תמונה
          </button>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700"
          >
            <Trash2 className="h-4 w-4" />
            הסר
          </button>
        </div>
      </div>
    </AnimatedDialog>
  );
}
