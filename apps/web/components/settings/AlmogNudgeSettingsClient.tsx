'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Bell, ChevronRight, Scale, Sparkles } from 'lucide-react';
import { cn } from '../../lib/cn';

type Props = {
  initialAvoidPush: boolean;
  initialWeightReminders: boolean;
};

export function AlmogNudgeSettingsClient({
  initialAvoidPush,
  initialWeightReminders,
}: Props) {
  const router = useRouter();
  const [avoidPush, setAvoidPush] = useState(initialAvoidPush);
  const [weightReminders, setWeightReminders] = useState(initialWeightReminders);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setAvoidPush(initialAvoidPush);
    setWeightReminders(initialWeightReminders);
  }, [initialAvoidPush, initialWeightReminders]);

  const dirty =
    avoidPush !== initialAvoidPush || weightReminders !== initialWeightReminders;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/profile/nudge-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avoid_push: avoidPush,
          weight_reminders: weightReminders,
        }),
      });
      if (!res.ok) throw new Error('save_failed');
      setSavedAt(Date.now());
      router.refresh();
    } catch {
      setError('לא הצלחנו לשמור. נסו שוב בעוד רגע.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f2fbf8] via-[#f8fafc] to-white">
      <div className="container-mobile py-6 pb-10 space-y-5">
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 text-sm text-slate-500"
        >
          <Link href="/profile" className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline">
            פרופיל
            <ChevronRight className="h-4 w-4 rotate-180" aria-hidden />
          </Link>
          <span className="text-slate-400">/</span>
          <span className="text-slate-700">התראות מאלמוג</span>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-black text-slate-900">איך אלמוג נוגע בכם מחוץ לצ׳אט</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
            אלמוג יכול לשלוח עדכונים קצרים באפליקציה — כשמפספסים יום במסע, כשנותנים רצף ימים,
            או כשחסר עדכון משקל. כאן אפשר להרגיע או לכוון בלי מילים טכניות.
          </p>
        </motion.div>

        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-[0_10px_30px_rgba(16,185,129,0.08)] space-y-4"
        >
          <div className="flex gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
              style={{
                background: 'linear-gradient(145deg, #059669, #14b8a6)',
                boxShadow: '0 6px 18px rgba(5,150,105,0.35)',
              }}
            >
              <Sparkles className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h2 className="font-bold text-slate-900">פחות הודעות מעודדות</h2>
              <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                כשמופעל — אלמוג לא ישלח תזכורות חיצוניות (חגיגות רצף, בדיקת חזרה למסע, ניצחון קטן).
                הצ׳אט עם אלמוג נשאר זמין תמיד.
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={avoidPush}
            onClick={() => setAvoidPush((v) => !v)}
            className={cn(
              'flex w-full items-center justify-between rounded-2xl border px-4 py-3.5 text-right transition-colors',
              avoidPush
                ? 'border-emerald-300 bg-emerald-50/80'
                : 'border-slate-200 bg-slate-50/80 hover:bg-slate-50'
            )}
          >
            <span className="text-sm font-semibold text-slate-800">להפחית תזכורות מאלמוג</span>
            <span
              className={cn(
                'relative h-8 w-14 shrink-0 rounded-full transition-colors',
                avoidPush ? 'bg-emerald-500' : 'bg-slate-300'
              )}
            >
              <span
                className={cn(
                  'absolute top-1 h-6 w-6 rounded-full bg-white shadow-md transition-[inset-inline-start]',
                  avoidPush ? 'start-1' : 'end-1'
                )}
              />
            </span>
          </button>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={cn(
            'rounded-3xl border p-5 shadow-[0_10px_30px_rgba(16,185,129,0.06)] space-y-4',
            avoidPush ? 'border-slate-200 bg-slate-50/60 opacity-75' : 'border-teal-100 bg-white'
          )}
        >
          <div className="flex gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-100 text-teal-800">
              <Scale className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h2 className="font-bold text-slate-900">תזכורות לעדכון משקל</h2>
              <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                לפעמים אלמוג מזכיר בעדינות לעדכן משקל אחרי כמה ימים בלי דיווח — רק אם זה רלוונטי למסע שלכם.
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={weightReminders}
            disabled={avoidPush}
            onClick={() => setWeightReminders((v) => !v)}
            className={cn(
              'flex w-full items-center justify-between rounded-2xl border px-4 py-3.5 text-right transition-colors',
              avoidPush && 'cursor-not-allowed opacity-60',
              !avoidPush &&
                (weightReminders
                  ? 'border-teal-200 bg-teal-50/70'
                  : 'border-slate-200 bg-slate-50/80 hover:bg-slate-50')
            )}
          >
            <span className="text-sm font-semibold text-slate-800">לאפשר תזכורות משקל</span>
            <span
              className={cn(
                'relative h-8 w-14 shrink-0 rounded-full transition-colors',
                weightReminders ? 'bg-teal-500' : 'bg-slate-300'
              )}
            >
              <span
                className={cn(
                  'absolute top-1 h-6 w-6 rounded-full bg-white shadow-md transition-[inset-inline-start]',
                  weightReminders ? 'start-1' : 'end-1'
                )}
              />
            </span>
          </button>
          {avoidPush ? (
            <p className="text-xs text-slate-500">
              כש&quot;פחות הודעות&quot; דלוק — כל סוגי ההתראות האלה כבויות, כולל משקל.
            </p>
          ) : null}
        </motion.section>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <button
            type="button"
            disabled={saving || !dirty}
            onClick={() => void save()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-emerald-600 to-teal-600 px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:brightness-105 disabled:opacity-45"
          >
            <Bell className="h-5 w-5" aria-hidden />
            {saving ? 'שומרים…' : 'שמירת העדפות'}
          </button>
          {savedAt && !dirty ? (
            <p className="text-center text-sm font-medium text-emerald-700 sm:text-right">נשמר בהצלחה</p>
          ) : null}
          {error ? (
            <p className="text-center text-sm font-medium text-red-600 sm:text-right" role="alert">
              {error}
            </p>
          ) : null}
        </motion.div>

        <p className="text-xs leading-relaxed text-slate-500 px-1">
          שינויים נכנסים לתוקף בתזמון הריצה היומית של המערכת ובהתאם לפעילות האחרונה שלכם.
          אין להתראות האלה השפעה על שיעורים, מסע או צ׳אט ישיר עם אלמוג.
        </p>
      </div>
    </div>
  );
}
