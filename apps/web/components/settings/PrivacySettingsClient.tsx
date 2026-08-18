'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Download, Trash2, Shield, Loader2, Mail, Lock, CheckCircle2, XCircle } from 'lucide-react';
import { AnimatedDialog } from '@/components/shared/AnimatedDialog';
import { signOutClient } from '@/lib/auth/sign-out-client';
import { LegalLinksRow } from '@/components/legal/LegalLinksRow';

type PrivacySettingsClientProps = {
  email: string;
};

type PendingRequest = {
  id: string;
  session_id: string | null;
  reason: string;
  created_at: string;
  expires_at: string;
};

export function PrivacySettingsClient({ email }: PrivacySettingsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [transcriptConsent, setTranscriptConsent] = useState<boolean | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(true);
  const [transcriptSaving, setTranscriptSaving] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const loadTranscriptConsent = useCallback(async () => {
    setTranscriptLoading(true);
    try {
      const res = await fetch('/api/v1/account/transcript-access-consent', { cache: 'no-store' });
      const data = (await res.json()) as {
        granted?: boolean;
        pending_requests?: PendingRequest[];
      };
      if (res.ok) {
        setTranscriptConsent(data.granted === true);
        setPendingRequests(data.pending_requests ?? []);
      }
    } finally {
      setTranscriptLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTranscriptConsent();
  }, [loadTranscriptConsent]);

  const handleTranscriptConsentToggle = async (granted: boolean) => {
    setTranscriptSaving(true);
    try {
      const res = await fetch('/api/v1/account/transcript-access-consent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ granted }),
      });
      if (!res.ok) throw new Error('עדכון נכשל');
      setTranscriptConsent(granted);
    } catch {
      setExportError('עדכון הסכמת תמליל נכשל');
    } finally {
      setTranscriptSaving(false);
    }
  };

  const resolveRequest = async (requestId: string, approve: boolean) => {
    setResolvingId(requestId);
    try {
      const res = await fetch('/api/v1/account/transcript-access-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, approve }),
      });
      if (!res.ok) throw new Error('פעולה נכשלה');
      setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
      const highlight = searchParams.get('transcript_request');
      if (highlight === requestId) {
        router.replace('/settings/privacy');
      }
    } catch {
      setExportError('טיפול בבקשה נכשל');
    } finally {
      setResolvingId(null);
    }
  };

  const highlightedRequest = searchParams.get('transcript_request');

  const handleExport = async () => {
    setExportError(null);
    setExporting(true);
    try {
      const res = await fetch('/api/v1/account/export');
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? 'ייצוא נכשל');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nurawell-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'ייצוא נכשל');
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    setDeleteError(null);
    setDeleting(true);
    try {
      const res = await fetch('/api/v1/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm_email: confirmEmail.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'מחיקה נכשלה');

      await signOutClient('/');
      router.push('/');
      router.refresh();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'מחיקה נכשלה');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="container-mobile py-6 pt-6 md:pt-16 pb-10 space-y-5" dir="rtl">
      <div className="crystal-surface rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="crystal-pill w-10 h-10 rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-emerald-700" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900">פרטיות ונתונים</h1>
            <p className="text-sm text-slate-600">מימוש זכויותיך לפי חוק הגנה הפרטיות (תיקון 13)</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed mt-3">
          כאן תוכל/י לייצא עותק של הנתונים השמורים עליך, או לבקש מחיקת חשבון. לשאלות נוספות:{' '}
          <a href="mailto:privacy@nurawell.ai" className="font-semibold text-emerald-700 underline">
            privacy@nurawell.ai
          </a>
        </p>
      </div>

      <section className="crystal-surface rounded-2xl p-5 space-y-3">
        <h2 className="font-bold text-slate-900 flex items-center gap-2">
          <Download className="w-4 h-4 text-emerald-600" />
          ייצוא נתונים (ניידות)
        </h2>
        <p className="text-sm text-slate-600">
          הורד/י קובץ JSON עם הפרופיל, ההסכמות, ההתקדמות, השיחות והנתונים הקשורים לחשבונך.
        </p>
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={exporting}
          className="w-full min-h-[48px] rounded-xl font-bold text-white bg-gradient-to-l from-emerald-600 to-teal-500 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {exporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-4 h-4" />}
          הורד את הנתונים שלי
        </button>
        {exportError ? <p className="text-sm font-semibold text-red-600">{exportError}</p> : null}
      </section>

      <section className="crystal-surface rounded-2xl p-5 space-y-3">
        <h2 className="font-bold text-slate-900 flex items-center gap-2">
          <Lock className="w-4 h-4 text-indigo-600" />
          גישת צוות לתמלילי שיחה
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          כברירת מחדל, צוות התמיכה <strong>לא</strong> יכול לצפות בתמלילי השיחות שלך. ניתן לאשר גישה
          גלובלית (למקרי תמיכה), או לאשר/לדחות בקשות ספציפיות.
        </p>
        {transcriptLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        ) : (
          <>
            <label className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-white/60 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={transcriptConsent === true}
                disabled={transcriptSaving}
                onChange={(e) => void handleTranscriptConsentToggle(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300"
              />
              <span className="text-sm text-slate-700">
                <span className="font-bold text-slate-900 block mb-0.5">
                  אני מאשר/ת לצוות NuraWell לצפות בתמלילי השיחות שלי
                </span>
                ניתן לבטל בכל עת. כל גישה נרשמת ביומן audit פנימי.
              </span>
            </label>

            {pendingRequests.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-bold text-amber-800">בקשות ממתינות לאישור</p>
                {pendingRequests.map((req) => (
                  <div
                    key={req.id}
                    className={`rounded-xl border p-3 ${
                      highlightedRequest === req.id
                        ? 'border-indigo-400 bg-indigo-50/80'
                        : 'border-amber-200 bg-amber-50/60'
                    }`}
                  >
                    <p className="text-xs text-slate-500 mb-1">נשלח {new Date(req.created_at).toLocaleString('he-IL')}</p>
                    <p className="text-sm text-slate-800 mb-2">{req.reason}</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={resolvingId === req.id}
                        onClick={() => void resolveRequest(req.id, true)}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        אשר
                      </button>
                      <button
                        type="button"
                        disabled={resolvingId === req.id}
                        onClick={() => void resolveRequest(req.id, false)}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        דחה
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className="rounded-2xl p-5 border border-red-200/80 bg-red-50/60">
        <h2 className="font-bold text-red-900 flex items-center gap-2">
          <Trash2 className="w-4 h-4" />
          מחיקת חשבון
        </h2>
        <p className="text-sm text-red-900/80 mt-2 leading-relaxed">
          פעולה זו <strong>בלתי הפיכה</strong>. יימחקו החשבון, הפרופיל, המסע, השיחות, ההתראות וכל
          הנתונים האישיים, למעט מה שאנו מחויבים לשמור על-פי דין. ראה/י{' '}
          <Link href="/privacy" className="underline font-semibold">
            מדיניות הפרטיות §11
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={() => {
            setConfirmEmail('');
            setDeleteError(null);
            setDeleteOpen(true);
          }}
          className="mt-4 w-full min-h-[48px] rounded-xl font-bold text-red-800 border border-red-300 bg-white hover:bg-red-50"
        >
          מחק/י את החשבון שלי
        </button>
      </section>

      <LegalLinksRow tone="light" />

      <AnimatedDialog
        open={deleteOpen}
        onClose={() => !deleting && setDeleteOpen(false)}
        zIndex={280}
        aria-labelledby="delete-account-title"
        variant="sheet"
        mobileChromePadding
        backdropClassName="absolute inset-0 bg-slate-900/45"
        panelClassName="crystal-surface max-w-md rounded-2xl p-5 shadow-2xl sm:rounded-2xl"
      >
            <h3 id="delete-account-title" className="text-lg font-black text-slate-900">
              מחיקת חשבון לצמיתות
            </h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              לא ניתן לשחזר את החשבון. לאשר, הזן/י את כתובת האימייל שלך:
            </p>
            <label className="block mt-4">
              <span className="text-xs font-bold text-slate-600 flex items-center gap-1 mb-1">
                <Mail className="w-3 h-3" />
                {email}
              </span>
              <input
                type="email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                dir="ltr"
                autoComplete="email"
                placeholder={email}
                disabled={deleting}
              />
            </label>
            {deleteError ? <p className="mt-2 text-sm font-semibold text-red-600">{deleteError}</p> : null}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting || !confirmEmail.trim()}
                className="flex-1 min-h-[44px] rounded-xl font-bold text-white bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {deleting ? 'מוחק…' : 'מחק לצמיתות'}
              </button>
              <button
                type="button"
                onClick={() => !deleting && setDeleteOpen(false)}
                disabled={deleting}
                className="px-4 min-h-[44px] rounded-xl font-bold border border-slate-200 text-slate-700"
              >
                ביטול
              </button>
            </div>
      </AnimatedDialog>
    </div>
  );
}
