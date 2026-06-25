'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Camera, Heart, Loader2, Sparkles, Trash2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { encodeProfileAvatarWebp } from '@/lib/client/encodeProfileAvatarWebp';
import { isWebpEncodeUnsupportedError } from '@/lib/client/encodeAlmogAvatarWebp';
import type { ProfileGender } from '@/lib/profile/personalized-copy';
import { AnimatedDialog } from '../shared/AnimatedDialog';

type Props = {
  open: boolean;
  onClose: () => void;
  currentInitials: string;
  firstName: string;
  gender?: ProfileGender;
  onUploaded: (url: string | null) => void;
};

function uploadIntro(gender: ProfileGender, firstName: string): string {
  if (gender === 'female') {
    return `${firstName}, בואי נוסיף פנים לפרופיל — תמונה שמרגישה נכונה לך.`;
  }
  if (gender === 'male') {
    return `${firstName}, בוא נוסיף פנים לפרופיל — תמונה שמרגישה נכונה לך.`;
  }
  return 'בואו נוסיף פנים לפרופיל — תמונה שמרגישה נכונה לכם.';
}

export function ProfileAvatarUpload({
  open,
  onClose,
  currentInitials,
  firstName,
  gender = null,
  onUploaded,
}: Props) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setError(null);
      setDragOver(false);
    }
  }, [open]);

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
            ? 'הדפדפן לא תומך בהכנת התמונה — נסה כרום או אדג׳'
            : 'לא הצלחנו להכין את התמונה, נסה תמונה אחרת'
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
        setError(data.error ?? 'משהו לא הצליח — נסה שוב בעוד רגע');
        return;
      }

      onUploaded(data.avatar_url ?? null);
      setFile(null);
      onClose();
    } catch {
      setError('אין חיבור כרגע — נסה שוב');
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
        setError('לא הצלחנו להסיר — נסה שוב');
        return;
      }
      onUploaded(null);
      setFile(null);
      onClose();
    } catch {
      setError('אין חיבור כרגע');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatedDialog
      open={open}
      onClose={onClose}
      zIndex={290}
      aria-label="תמונת פרופיל"
      backdropClassName="absolute inset-0 bg-slate-900/55 backdrop-blur-sm"
      panelClassName="max-w-md overflow-hidden rounded-3xl shadow-2xl border border-white/20"
      panelStyle={{
        background: 'linear-gradient(165deg, #ecfdf5 0%, #ffffff 42%, #f0fdfa 100%)',
      }}
    >
      <div
        dir="rtl"
        className="relative px-5 pt-5 pb-2"
        style={{
          background: 'linear-gradient(145deg, #047857 0%, #10b981 55%, #14b8a6 100%)',
        }}
      >
        <div className="absolute inset-0 opacity-25 pointer-events-none bg-[radial-gradient(circle_at_20%_0%,white,transparent_55%)]" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold text-emerald-100/90 flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5" />
              הפרופיל שלך
            </p>
            <h3 className="mt-1 text-xl font-black text-white leading-tight">תמונה שמייצגת אותך</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white hover:bg-white/25"
            aria-label="סגור"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="px-5 py-5 space-y-4">
        <p className="text-[15px] text-slate-700 text-right leading-relaxed font-medium">
          {uploadIntro(gender, firstName)}
        </p>
        <p className="text-[13px] text-slate-500 text-right leading-relaxed -mt-2">
          אפשר לבחור מהגלריה, לגרור לכאן, או להדביק תמונה — אנחנו נדאג לשאר.
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
          className={`relative flex flex-col items-center justify-center rounded-3xl border-2 border-dashed p-7 transition cursor-pointer ${
            dragOver
              ? 'border-emerald-400 bg-emerald-50 scale-[1.01]'
              : 'border-emerald-200 bg-white/80 shadow-inner'
          }`}
        >
          <AnimatePresence mode="wait">
            {preview ? (
              <motion.img
                key="preview"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                src={preview}
                alt="איך זה ייראה בפרופיל"
                className="h-32 w-32 rounded-3xl object-cover shadow-xl ring-4 ring-white"
              />
            ) : (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex h-32 w-32 items-center justify-center rounded-3xl text-4xl font-black text-white shadow-xl ring-4 ring-white"
                style={{ background: 'linear-gradient(135deg, #14b8a6, #059669)' }}
              >
                {currentInitials}
              </motion.div>
            )}
          </AnimatePresence>
          <p className="mt-4 text-sm font-bold text-emerald-800 flex items-center gap-1.5">
            <Camera className="h-4 w-4" />
            {file ? 'נראה מעולה — מוכן לשמירה' : 'לחץ או גרור תמונה לכאן'}
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

        {error ? (
          <p className="text-sm font-semibold text-red-600 text-right rounded-xl bg-red-50 px-3 py-2">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => void upload()}
            disabled={!file || busy}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-black text-white disabled:opacity-50 shadow-lg"
            style={{ background: 'linear-gradient(135deg, #059669, #10b981)' }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" />}
            {busy ? 'שומר…' : 'זהו, נשמור!'}
          </button>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-bold text-slate-600"
          >
            <Trash2 className="h-4 w-4" />
            הסר
          </button>
        </div>
      </div>
    </AnimatedDialog>
  );
}
