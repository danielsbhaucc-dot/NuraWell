'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, Lock, Shield, XCircle } from 'lucide-react';
import { AnimatedDialog } from '@/components/shared/AnimatedDialog';
import type { ProfileGender } from '@/lib/privacy/gender-hebrew';
import { genderPress } from '@/lib/privacy/gender-hebrew';

export type TranscriptAccessRequestPayload = {
  id: string;
  session_id: string | null;
  reason: string;
  created_at: string;
  expires_at: string;
};

type TranscriptAccessRequestDialogProps = {
  open: boolean;
  request: TranscriptAccessRequestPayload | null;
  gender?: ProfileGender;
  busy?: boolean;
  onApprove: (requestId: string) => void;
  onDeny: (requestId: string, denialReason?: string) => void;
  onClose: () => void;
};

function fmt(iso: string): string {
  try {
    return new Intl.DateTimeFormat('he-IL', {
      timeZone: 'Asia/Jerusalem',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function TranscriptAccessRequestDialog({
  open,
  request,
  gender,
  busy = false,
  onApprove,
  onDeny,
  onClose,
}: TranscriptAccessRequestDialogProps) {
  const [denyMode, setDenyMode] = useState(false);
  const [denyReason, setDenyReason] = useState('');

  if (!request) return null;

  const press = genderPress(gender);
  const scopeLabel = request.session_id
    ? 'תמליל שיחה ספציפית (24 שעות לאחר אישור)'
    : 'תמליל שיחה (בקשה כללית)';

  const exposedItems = request.session_id
    ? ['תמליל השיחה המלא', 'כותרת השיחה', 'תאריכי ההודעות']
    : ['תמליל השיחה המבוקש', 'כותרת וסיכום השיחה'];

  const handleClose = () => {
    if (busy) return;
    setDenyMode(false);
    setDenyReason('');
    onClose();
  };

  return (
    <AnimatedDialog
      open={open}
      onClose={handleClose}
      zIndex={320}
      aria-labelledby="transcript-req-title"
      variant="sheet"
      mobileChromePadding
      backdropClassName="absolute inset-0 bg-slate-900/45 backdrop-blur-sm"
      panelClassName="crystal-surface max-w-md overflow-hidden rounded-2xl p-0 shadow-2xl sm:rounded-2xl"
    >
      <div className="border-b border-[#E8D5B5] bg-gradient-to-l from-[#FFF8ED] to-[#F5F0FF] px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-indigo-200 bg-indigo-50 text-indigo-700">
            <Lock className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 id="transcript-req-title" className="text-lg font-black text-slate-900">
              בקשה לצפייה בתמליל
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              צוות NuraWell מבקש את אישורך. {press} לאשר או לדחות.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-5 py-4" dir="rtl">
        <div className="rounded-xl border border-[#E8D5B5] bg-[#FFFBF5] p-3 text-sm">
          <p className="mb-1 text-xs font-bold text-stone-500">סיבת הבקשה</p>
          <p className="leading-relaxed text-stone-800">{request.reason}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-stone-200 bg-white/80 px-2.5 py-2">
            <p className="font-bold text-stone-500">נשלח</p>
            <p className="mt-0.5 font-medium text-stone-800">{fmt(request.created_at)}</p>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white/80 px-2.5 py-2">
            <p className="font-bold text-stone-500">תוקף הבקשה</p>
            <p className="mt-0.5 font-medium text-stone-800">{fmt(request.expires_at)}</p>
          </div>
        </div>

        <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/60 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-indigo-900">
            <Shield className="h-3.5 w-3.5" />
            מה ייחשף לאחר אישור
          </p>
          <p className="mb-2 text-xs font-semibold text-indigo-800">{scopeLabel}</p>
          <ul className="space-y-1 text-xs text-indigo-900/90">
            {exposedItems.map((item) => (
              <li key={item} className="flex items-start gap-1.5">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-indigo-500" />
                {item}
              </li>
            ))}
          </ul>
          {request.session_id ? (
            <p className="mt-2 text-[11px] text-indigo-800/80">
              הגישה תקפה ל-24 שעות מרגע האישור, ואז תיסגר אוטומטית.
            </p>
          ) : null}
        </div>

        {denyMode ? (
          <div className="space-y-2">
            <label className="block text-xs font-bold text-stone-700">הסבר לדחייה (אופציונלי)</label>
            <textarea
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              rows={2}
              disabled={busy}
              className="w-full rounded-xl border border-[#E8D5B5] bg-[#FFFBF5] px-3 py-2 text-sm text-stone-800"
              placeholder="למשל: מעדיף/ה לא לשתף את השיחה הזו"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => onDeny(request.id, denyReason)}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-rose-600 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                שלח דחייה
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setDenyMode(false);
                  setDenyReason('');
                }}
                className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-bold text-stone-600"
              >
                חזרה
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={busy}
              onClick={() => onApprove(request.id)}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-emerald-600 to-teal-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              אשר גישה
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onDeny(request.id)}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-rose-300 bg-[#FFF5F0] px-4 py-3 text-sm font-bold text-rose-800 disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              דחה
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setDenyMode(true)}
              className="rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-bold text-stone-700 disabled:opacity-50"
            >
              דחה עם הסבר
            </button>
          </div>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={handleClose}
          className="w-full rounded-xl py-2 text-xs font-semibold text-stone-500 hover:text-stone-700"
        >
          אחר כך — אטפל בהגדרות פרטיות
        </button>
      </div>
    </AnimatedDialog>
  );
}
