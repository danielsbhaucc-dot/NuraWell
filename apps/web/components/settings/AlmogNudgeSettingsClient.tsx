'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Bell, ChevronRight, Loader2, MessageCircle, Scale, Send, Sparkles } from 'lucide-react';
import type { AlmogCoachingStyle } from '../../lib/ai/almog-coaching-style';
import { cn } from '../../lib/cn';

const COACHING_OPTIONS: { id: AlmogCoachingStyle; label: string; hint: string }[] = [
  { id: 'warm_friend', label: 'חבר קרוב', hint: 'חם, סקרני, בלי אשמה' },
  { id: 'gentle', label: 'עדין', hint: 'איטי, מרגיע, בלי לחץ' },
  { id: 'direct', label: 'ישיר', hint: 'תכליתי, קצר, עם אנרגיה' },
];

type Props = {
  initialAvoidPush: boolean;
  initialWeightReminders: boolean;
  initialCoachingStyle: AlmogCoachingStyle;
  initialWorkArrivalTime: string;
};

type RecentNotif = {
  id: string;
  type: string;
  title: string;
  archived_at: string | null;
  is_read: boolean;
  created_at: string;
};

type TestNotifResult =
  | {
      kind: 'ok';
      body: string;
      slot: string;
      usedFallback: boolean;
      pendingTasksCount: number;
      eligibleHabitsCount: number;
      insertedId: string | null;
      insertedArchivedAt: string | null;
      recentCount: number;
      recent: RecentNotif[];
      targetUserId: string;
    }
  | { kind: 'blocked'; reason: string; hint?: string }
  | { kind: 'error'; message: string };

export function AlmogNudgeSettingsClient({
  initialAvoidPush,
  initialWeightReminders,
  initialCoachingStyle,
  initialWorkArrivalTime,
}: Props) {
  const router = useRouter();
  const [avoidPush, setAvoidPush] = useState(initialAvoidPush);
  const [weightReminders, setWeightReminders] = useState(initialWeightReminders);
  const [coachingStyle, setCoachingStyle] = useState<AlmogCoachingStyle>(initialCoachingStyle);
  const [workArrivalTime, setWorkArrivalTime] = useState(initialWorkArrivalTime);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestNotifResult | null>(null);

  useEffect(() => {
    setAvoidPush(initialAvoidPush);
    setWeightReminders(initialWeightReminders);
    setCoachingStyle(initialCoachingStyle);
    setWorkArrivalTime(initialWorkArrivalTime);
  }, [
    initialAvoidPush,
    initialWeightReminders,
    initialCoachingStyle,
    initialWorkArrivalTime,
  ]);

  const dirty =
    avoidPush !== initialAvoidPush ||
    weightReminders !== initialWeightReminders ||
    coachingStyle !== initialCoachingStyle ||
    workArrivalTime !== initialWorkArrivalTime;

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
          coaching_style: coachingStyle,
          work_arrival_time: workArrivalTime.trim() ? workArrivalTime.trim() : null,
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

  async function sendTestNotification() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/v1/ai/cron/habit-checkpoints/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        details?: string;
        notification_body?: string;
        slot?: string;
        used_fallback_habit?: boolean;
        pending_tasks_count?: number;
        eligible_habits_count?: number;
        target_user_id?: string;
        inserted_notification?: { id?: string; archived_at?: string | null };
        recent_notifications_count?: number;
        recent_notifications?: RecentNotif[];
        reason?: string;
        hint_he?: string;
      };
      if (!res.ok || data.ok === false) {
        if (data.error === 'blocked_by_gate') {
          setTestResult({
            kind: 'blocked',
            reason: data.reason ?? 'unknown',
            hint: data.hint_he,
          });
        } else {
          const fullMessage = [
            `HTTP ${res.status}`,
            data.error,
            data.details,
            data.hint_he,
          ]
            .filter(Boolean)
            .join(' · ');
          setTestResult({
            kind: 'error',
            message: fullMessage || 'לא הצלחנו לשלוח התראת בדיקה.',
          });
        }
        return;
      }
      setTestResult({
        kind: 'ok',
        body: data.notification_body ?? '',
        slot: data.slot ?? '',
        usedFallback: Boolean(data.used_fallback_habit),
        pendingTasksCount: Number(data.pending_tasks_count ?? 0),
        eligibleHabitsCount: Number(data.eligible_habits_count ?? 0),
        insertedId: data.inserted_notification?.id ?? null,
        insertedArchivedAt: data.inserted_notification?.archived_at ?? null,
        recentCount: Number(data.recent_notifications_count ?? 0),
        recent: Array.isArray(data.recent_notifications) ? data.recent_notifications : [],
        targetUserId: data.target_user_id ?? '',
      });
    } catch (e) {
      setTestResult({
        kind: 'error',
        message: e instanceof Error ? e.message : 'שגיאת רשת',
      });
    } finally {
      setTesting(false);
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
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-3xl border-2 border-amber-400 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50 p-5 shadow-[0_10px_30px_rgba(217,119,6,0.15)] space-y-3"
        >
          <div className="flex gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white"
              style={{
                background: 'linear-gradient(145deg, #f59e0b, #f97316)',
                boxShadow: '0 6px 18px rgba(217,119,6,0.32)',
              }}
            >
              <Send className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black text-slate-900">בדיקת התראה עכשיו</h2>
              <p className="mt-1 text-sm text-slate-700 leading-relaxed">
                לחיצה כאן שולחת מיד התראה אמיתית מאלמוג לפעמון שלך — בלי להמתין לתזמון.
                מתאים לוודא שהזרימה עובדת אחרי שינוי או בדיקה ראשונה.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={testing}
            onClick={() => void sendTestNotification()}
            className={cn(
              'inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-black text-white transition',
              testing
                ? 'bg-amber-400/70 cursor-wait'
                : 'bg-gradient-to-l from-amber-500 to-orange-500 hover:brightness-105 shadow-lg shadow-amber-500/30 active:scale-[0.98]'
            )}
          >
            {testing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                שולחים…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" aria-hidden />
                שלחו לי התראת בדיקה עכשיו
              </>
            )}
          </button>

          {avoidPush ? (
            <p className="text-xs text-amber-800 bg-amber-100/70 rounded-xl px-3 py-2">
              שימו לב: ההעדפה &quot;פחות הודעות מעודדות&quot; דלוקה, ולכן ה-CRON האוטומטי
              מדלג עליכם. הבדיקה הידנית כאן עוקפת את ההעדפה כדי לוודא שהזרימה עובדת.
            </p>
          ) : null}

          {testResult?.kind === 'ok' ? (
            <div className="rounded-2xl border-2 border-emerald-400 bg-white px-4 py-3 text-right space-y-2">
              <p className="text-xs font-black text-emerald-700">
                ✓ ההתראה נשלחה ({testResult.slot}
                {testResult.usedFallback ? ' · פלייסהולדר' : ''})
              </p>
              <p className="text-[11px] font-semibold text-slate-500">
                {testResult.pendingTasksCount > 0
                  ? `${testResult.pendingTasksCount} משימות פתוחות`
                  : 'אין משימות פתוחות'}
                {' · '}
                {testResult.eligibleHabitsCount > 0
                  ? `${testResult.eligibleHabitsCount} הרגלים`
                  : 'אין הרגלים תואמים'}
              </p>
              <p className="text-[13px] leading-relaxed text-slate-800 whitespace-pre-wrap pt-1 border-t border-emerald-100 pt-2">
                {testResult.body}
              </p>

              <div className="mt-3 pt-3 border-t border-emerald-100 space-y-1.5">
                <p className="text-[11px] font-black text-slate-700">
                  בדיקה — מה ב-DB עכשיו (admin, עוקף RLS):
                </p>
                <p className="text-[10px] text-slate-600 font-mono break-all">
                  inserted_id: {testResult.insertedId ?? '(לא הוחזר)'}
                </p>
                {testResult.insertedArchivedAt ? (
                  <p className="text-[11px] font-bold text-red-600">
                    ⚠️ ההתראה נוצרה עם archived_at — לא תופיע בפעמון!
                  </p>
                ) : null}
                <p className="text-[10px] text-slate-600">
                  סך התראות אחרונות שלך ב-DB: <strong>{testResult.recentCount}</strong>
                </p>
                {testResult.recent.length > 0 ? (
                  <ul className="text-[10px] text-slate-600 space-y-0.5">
                    {testResult.recent.map((r) => (
                      <li key={r.id} className="font-mono flex gap-1">
                        <span className={r.archived_at ? 'text-red-500' : 'text-emerald-700'}>
                          {r.archived_at ? '🗄️' : '📬'}
                        </span>
                        <span className="truncate">
                          {new Date(r.created_at).toLocaleTimeString('he-IL', {
                            timeZone: 'Asia/Jerusalem',
                          })}
                          {' · '}
                          {r.type}
                          {' · '}
                          {r.is_read ? 'נקרא' : 'חדש'}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] font-bold text-red-600">
                    ⚠️ אין שום התראה ב-DB עבור המשתמש שלך! משהו מוחק אותן.
                  </p>
                )}
                <p className="text-[10px] text-slate-500 pt-1">
                  user_id: <span className="font-mono">{testResult.targetUserId}</span>
                </p>
              </div>

              <p className="text-[11px] text-emerald-700 pt-2 font-bold">
                פתחו את הפעמון עכשיו — אמורה להופיע ההתראה האחרונה.
              </p>
            </div>
          ) : null}

          {testResult?.kind === 'blocked' ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50/90 px-4 py-3 text-right">
              <p className="text-xs font-bold text-amber-800">
                נחסם על-ידי gate ({testResult.reason})
              </p>
              {testResult.hint ? (
                <p className="mt-1.5 text-[13px] leading-relaxed text-amber-900">
                  {testResult.hint}
                </p>
              ) : null}
            </div>
          ) : null}

          {testResult?.kind === 'error' ? (
            <div className="rounded-2xl border border-red-300 bg-red-50/90 px-4 py-3 text-right">
              <p className="text-sm font-bold text-red-700" role="alert">
                ✗ {testResult.message}
              </p>
              <p className="text-[11px] text-red-600 mt-1">
                בדקו את הקונסול ב-DevTools (Network) לפרטים נוספים.
              </p>
            </div>
          ) : null}
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04 }}
          className="rounded-3xl border border-violet-100 bg-white p-5 shadow-[0_10px_30px_rgba(139,92,246,0.08)] space-y-4"
        >
          <div className="flex gap-3">
            <motion.div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
              style={{
                background: 'linear-gradient(145deg, #7c3aed, #a855f7)',
                boxShadow: '0 6px 18px rgba(124,58,237,0.35)',
              }}
            >
              <MessageCircle className="h-5 w-5" aria-hidden />
            </motion.div>
            <div>
              <h2 className="font-bold text-slate-900">איך אלמוג מדבר איתכם</h2>
              <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                בוחרים טון — חבר, עדין, או ישיר. משפיע על התראות ועל הצ׳אט.
              </p>
            </div>
          </div>

          <motion.div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="סגנון ליווי">
            {COACHING_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={coachingStyle === opt.id}
                onClick={() => setCoachingStyle(opt.id)}
                className={cn(
                  'rounded-2xl border px-3 py-3 text-right transition',
                  coachingStyle === opt.id
                    ? 'border-violet-400 bg-violet-50 ring-2 ring-violet-300/60'
                    : 'border-slate-200 bg-slate-50/80 hover:border-violet-200'
                )}
              >
                <span className="block text-sm font-bold text-slate-900">{opt.label}</span>
                <span className="mt-0.5 block text-xs text-slate-600">{opt.hint}</span>
              </button>
            ))}
          </motion.div>

          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-slate-800">שעת הגעה לעבודה (אופציונלי)</span>
            <span className="block text-xs text-slate-500 leading-relaxed">
              מגע קצר לפני ההגעה. התזמון מקורב (בדיקה כל ~30 דק׳).
            </span>
            <input
              type="time"
              value={workArrivalTime}
              onChange={(e) => setWorkArrivalTime(e.target.value)}
              className="w-full max-w-[10rem] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900"
            />
          </label>
        </motion.section>

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
