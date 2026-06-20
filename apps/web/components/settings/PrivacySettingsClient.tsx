'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Download, Trash2, Shield, Loader2, Mail } from 'lucide-react';
import { signOutClient } from '@/lib/auth/sign-out-client';
import { LegalLinksRow } from '@/components/legal/LegalLinksRow';

type PrivacySettingsClientProps = {
  email: string;
};

export function PrivacySettingsClient({ email }: PrivacySettingsClientProps) {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

      {deleteOpen ? (
        <div
          className="fixed inset-0 z-[280] flex items-end sm:items-center justify-center bg-slate-900/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
        >
          <div dir="rtl" className="crystal-surface w-full max-w-md rounded-2xl p-5 shadow-2xl">
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
          </div>
        </div>
      ) : null}
    </div>
  );
}
