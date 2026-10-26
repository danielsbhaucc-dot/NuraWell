'use client';
import { PageBackButton } from '../shared/PageBackButton';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Bell, ChevronRight, Loader2, MessageCircle, Scale, Send, Shield, Sparkles } from 'lucide-react';
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
  initialGuardianOptedIn: boolean;
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
  initialGuardianOptedIn,
}: Props) {
  const router = useRouter();
  const [avoidPush, setAvoidPush] = useState(initialAvoidPush);
  const [weightReminders, setWeightReminders] = useState(initialWeightReminders);
  const [coachingStyle, setCoachingStyle] = useState<AlmogCoachingStyle>(initialCoachingStyle);
  const [workArrivalTime, setWorkArrivalTime] = useState(initialWorkArrivalTime);
  const [guardianOptedIn, setGuardianOptedIn] = useState(initialGuardianOptedIn);
  const [guardianSaving, setGuardianSaving] = useState(false);
  const [guardianError, setGuardianError] = useState<string | null>(null);
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

  async function saveGuardianOptIn(next: boolean) {
    setGuardianSaving(true);
    setGuardianError(null);
    const prev = guardianOptedIn;
    setGuardianOptedIn(next);
    try {
      const res = await fetch('/api/v1/profile/guardian-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opted_in: next }),
      });
      if (!res.ok) throw new Error('save_failed');
      router.refresh();
    } catch {
      setGuardianOptedIn(prev);
      setGuardianError('לא הצלחנו לשמור — תנסה שוב.');
    } finally {
      setGuardianSaving(false);
    }
  }

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
      setError('לא הצלחנו לשמור — תנסה שוב בעוד רגע.');
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
    <div className="min-h-screen bg-linear-to-b from-[#cfe9dc] via-[#cfe9dc] to-background-card">
      <div className="container-mobile py-6 pb-10 space-y-5">
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 text-sm text-ink-faint"
        >
          <PageBackButton href="/profile" label="לפרופיל" ariaLabel="חזרה לפרופיל" variant="onLight" />
          <span className="text-ink-soft">התראות מאלמוג</span>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-black text-ink">איך אלמוג נוגע בך מחוץ לצ׳אט</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            אלמוג יכול לשלוח עדכונים קצרים באפליקציה — כשמפספסים יום במסע, כשנותנים רצף ימים,
            או כשחסר עדכון משקל. כאן אפשר להרגיע או לכוון בלי מילים טכניות.
          </p>
        </motion.div>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-3xl border-2 border-accent-400 bg-linear-to-br from-accent-50 via-energy-50 to-accent-50 p-5 shadow-[0_10px_30px_rgba(217,119,6,0.15)] space-y-3"
        >
          <div className="flex gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-on-dark"
              style={{
                background: 'linear-gradient(145deg, #f59e0b, #f97316)',
                boxShadow: '0 6px 18px rgba(217,119,6,0.32)',
              }}
            >
              <Send className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black text-ink">בדיקת התראה עכשיו</h2>
              <p className="mt-1 text-sm text-ink-soft leading-relaxed">
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
              'inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-black text-on-dark transition',
              testing
                ? 'bg-accent-400/70 cursor-wait'
                : 'bg-linear-to-l from-accent-500 to-energy-500 hover:brightness-105 shadow-lg shadow-accent-500/30 active:scale-[0.98]'
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
            <p className="text-xs text-accent-800 bg-accent-100/70 rounded-xl px-3 py-2">
              שימו לב: ההעדפה &quot;פחות הודעות מעודדות&quot; דלוקה, ולכן ה-CRON האוטומטי
              מדלג עליכם. הבדיקה הידנית כאן עוקפת את ההעדפה כדי לוודא שהזרימה עובדת.
            </p>
          ) : null}

          {testResult?.kind === 'ok' ? (
            <div className="rounded-2xl border-2 border-primary-400 bg-background-card px-4 py-3 text-start space-y-2">
              <p className="text-xs font-black text-primary-700">
                ✓ ההתראה נשלחה ({testResult.slot}
                {testResult.usedFallback ? ' · פלייסהולדר' : ''})
              </p>
              <p className="text-[11px] font-semibold text-ink-faint">
                {testResult.pendingTasksCount > 0
                  ? `${testResult.pendingTasksCount} משימות פתוחות`
                  : 'אין משימות פתוחות'}
                {' · '}
                {testResult.eligibleHabitsCount > 0
                  ? `${testResult.eligibleHabitsCount} הרגלים`
                  : 'אין הרגלים תואמים'}
              </p>
              <p className="text-[13px] leading-relaxed text-ink whitespace-pre-wrap pt-1 border-t border-primary-100 pt-2">
                {testResult.body}
              </p>

              <div className="mt-3 pt-3 border-t border-primary-100 space-y-1.5">
                <p className="text-[11px] font-black text-ink-soft">
                  בדיקה — מה ב-DB עכשיו (admin, עוקף RLS):
                </p>
                <p className="text-[10px] text-ink-soft font-mono break-all">
                  inserted_id: {testResult.insertedId ?? '(לא הוחזר)'}
                </p>
                {testResult.insertedArchivedAt ? (
                  <p className="text-[11px] font-bold text-coral-600">
                    ⚠️ ההתראה נוצרה עם archived_at — לא תופיע בפעמון!
                  </p>
                ) : null}
                <p className="text-[10px] text-ink-soft">
                  סך התראות אחרונות שלך ב-DB: <strong>{testResult.recentCount}</strong>
                </p>
                {testResult.recent.length > 0 ? (
                  <ul className="text-[10px] text-ink-soft space-y-0.5">
                    {testResult.recent.map((r) => (
                      <li key={r.id} className="font-mono flex gap-1">
                        <span className={r.archived_at ? 'text-coral-500' : 'text-primary-700'}>
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
                  <p className="text-[11px] font-bold text-coral-600">
                    ⚠️ אין שום התראה ב-DB עבור המשתמש שלך! משהו מוחק אותן.
                  </p>
                )}
                <p className="text-[10px] text-ink-faint pt-1">
                  user_id: <span className="font-mono">{testResult.targetUserId}</span>
                </p>
              </div>

              <p className="text-[11px] text-primary-700 pt-2 font-bold">
                פתחו את הפעמון עכשיו — אמורה להופיע ההתראה האחרונה.
              </p>
            </div>
          ) : null}

          {testResult?.kind === 'blocked' ? (
            <div className="rounded-2xl border border-accent-300 bg-accent-50/90 px-4 py-3 text-start">
              <p className="text-xs font-bold text-accent-800">
                נחסם על-ידי gate ({testResult.reason})
              </p>
              {testResult.hint ? (
                <p className="mt-1.5 text-[13px] leading-relaxed text-accent-900">
                  {testResult.hint}
                </p>
              ) : null}
            </div>
          ) : null}

          {testResult?.kind === 'error' ? (
            <div className="rounded-2xl border border-coral-300 bg-coral-50/90 px-4 py-3 text-start">
              <p className="text-sm font-bold text-coral-700" role="alert">
                ✗ {testResult.message}
              </p>
              <p className="text-[11px] text-coral-600 mt-1">
                בדקו את הקונסול ב-DevTools (Network) לפרטים נוספים.
              </p>
            </div>
          ) : null}
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04 }}
          className="rounded-3xl border border-iris-100 bg-background-card p-5 shadow-[0_10px_30px_rgba(139,92,246,0.08)] space-y-4"
        >
          <div className="flex gap-3">
            <motion.div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-on-dark"
              style={{
                background: 'linear-gradient(145deg, #7c3aed, #a855f7)',
                boxShadow: '0 6px 18px rgba(124,58,237,0.35)',
              }}
            >
              <MessageCircle className="h-5 w-5" aria-hidden />
            </motion.div>
            <div>
              <h2 className="font-bold text-ink">איך אלמוג מדבר איתכם</h2>
              <p className="mt-1 text-sm text-ink-soft leading-relaxed">
                בוחרים טון — חבר, עדין, או ישיר. משפיע על התראות ועל הצ׳אט.
              </p>
              <details className="group mt-2 text-xs text-slate-500" data-testid="quality-check-info">
                <summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center gap-1.5 rounded-lg text-violet-700 hover:text-violet-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  חלק מההתראות ומהתשובות עוברות בקרת איכות אוטומטית
                  <span className="text-slate-400 group-open:hidden" aria-hidden>ⓘ</span>
                </summary>
                <p className="mt-1 rounded-xl bg-violet-50/70 p-3 leading-relaxed text-slate-600">
                  לפני שחלק מההתראות יוצאות, בקרת איכות אוטומטית בודקת דקדוק, פנייה ומגדר נכונים, שימוש בשם
                  הנכון, משפטים שבורים או לא הגיוניים ובלבול בפרטים בתוך הטקסט. גם חלק מהתשובות של אלמוג בצ׳אט
                  נבדקות כך מיד אחרי שנכתבו. השם הפרטי מוסתר בבקרה ולא נשלח שום פרט מזהה. התיקונים נשמרים בלי שם ובלי מזהה משתמש, כדי שהניסוח
                  ישתפר עם הזמן.
                </p>
              </details>
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
                  'rounded-2xl border px-3 py-3 text-start transition',
                  coachingStyle === opt.id
                    ? 'border-iris-400 bg-iris-50 ring-2 ring-iris-300/60'
                    : 'border-hairline bg-surface-sunken/80 hover:border-iris-200'
                )}
              >
                <span className="block text-sm font-bold text-ink">{opt.label}</span>
                <span className="mt-0.5 block text-xs text-ink-soft">{opt.hint}</span>
              </button>
            ))}
          </motion.div>

          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-ink">שעת הגעה לעבודה (אופציונלי)</span>
            <span className="block text-xs text-ink-faint leading-relaxed">
              מגע קצר לפני ההגעה. התזמון מקורב (בדיקה כל ~30 דק׳).
            </span>
            <input
              type="time"
              value={workArrivalTime}
              onChange={(e) => setWorkArrivalTime(e.target.value)}
              className="w-full max-w-40 rounded-xl border border-hairline bg-background-card px-3 py-2.5 text-sm font-medium text-ink"
            />
          </label>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-3xl border border-primary-100 bg-background-card p-5 shadow-[0_10px_30px_rgba(16,185,129,0.08)] space-y-4"
        >
          <div className="flex gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-on-dark"
              style={{
                background: 'linear-gradient(145deg, #059669, #14b8a6)',
                boxShadow: '0 6px 18px rgba(5,150,105,0.35)',
              }}
            >
              <Sparkles className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h2 className="font-bold text-ink">פחות הודעות מעודדות</h2>
              <p className="mt-1 text-sm text-ink-soft leading-relaxed">
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
              'flex w-full items-center justify-between rounded-2xl border px-4 py-3.5 text-start transition-colors',
              avoidPush
                ? 'border-primary-300 bg-primary-50/80'
                : 'border-hairline bg-surface-sunken/80 hover:bg-surface-sunken'
            )}
          >
            <span className="text-sm font-semibold text-ink">להפחית תזכורות מאלמוג</span>
            <span
              className={cn(
                'relative h-8 w-14 shrink-0 rounded-full transition-colors',
                avoidPush ? 'bg-primary-500' : 'bg-ink-300'
              )}
            >
              <span
                className={cn(
                  'absolute top-1 h-6 w-6 rounded-full bg-background-card shadow-md transition-[inset-inline-start]',
                  avoidPush ? 'inset-s-1' : 'inset-e-1'
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
            avoidPush ? 'border-hairline bg-surface-sunken/60 opacity-75' : 'border-secondary-100 bg-background-card'
          )}
        >
          <div className="flex gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-secondary-100 text-secondary-800">
              <Scale className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h2 className="font-bold text-ink">תזכורות לעדכון משקל</h2>
              <p className="mt-1 text-sm text-ink-soft leading-relaxed">
                לפעמים אלמוג מזכיר בעדינות לעדכן משקל אחרי כמה ימים בלי דיווח — רק אם זה רלוונטי למסע שלך.
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
              'flex w-full items-center justify-between rounded-2xl border px-4 py-3.5 text-start transition-colors',
              avoidPush && 'cursor-not-allowed opacity-60',
              !avoidPush &&
                (weightReminders
                  ? 'border-secondary-200 bg-secondary-50/70'
                  : 'border-hairline bg-surface-sunken/80 hover:bg-surface-sunken')
            )}
          >
            <span className="text-sm font-semibold text-ink">לאפשר תזכורות משקל</span>
            <span
              className={cn(
                'relative h-8 w-14 shrink-0 rounded-full transition-colors',
                weightReminders ? 'bg-secondary-500' : 'bg-ink-300'
              )}
            >
              <span
                className={cn(
                  'absolute top-1 h-6 w-6 rounded-full bg-background-card shadow-md transition-[inset-inline-start]',
                  weightReminders ? 'inset-s-1' : 'inset-e-1'
                )}
              />
            </span>
          </button>
          {avoidPush ? (
            <p className="text-xs text-ink-faint">
              כש&quot;פחות הודעות&quot; דלוק — כל סוגי ההתראות האלה כבויות, כולל משקל.
            </p>
          ) : null}
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="rounded-3xl border border-primary-100 bg-background-card p-5 shadow-[0_10px_30px_rgba(16,185,129,0.06)] space-y-4"
        >
          <div className="flex gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-100 text-primary-800">
              <Shield className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h2 className="font-bold text-ink">רגע לפני — מגע עדין מראש</h2>
              <p className="mt-1 text-sm text-ink-soft leading-relaxed">
                אלמוג יכול לשלוח הודעה קטנה <strong>לפני</strong> חלונות שקשה לך — לא במקום SOS,
                אלא כדי לעזור לעצור רגע לפני ש&quot;בורחים&quot;. רק אם אתה מאשר, ובלי יותר מ-3 בשבוע.
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={guardianOptedIn}
            disabled={guardianSaving}
            onClick={() => void saveGuardianOptIn(!guardianOptedIn)}
            className={cn(
              'flex w-full items-center justify-between rounded-2xl border px-4 py-3.5 text-start transition-colors',
              guardianOptedIn
                ? 'border-primary-300 bg-primary-50/80'
                : 'border-hairline bg-surface-sunken/80 hover:bg-surface-sunken',
              guardianSaving && 'opacity-70'
            )}
          >
            <span className="text-sm font-semibold text-ink">
              {guardianSaving ? 'שומר…' : 'לאפשר מגע &quot;רגע לפני&quot;'}
            </span>
            <span
              className={cn(
                'relative h-8 w-14 shrink-0 rounded-full transition-colors',
                guardianOptedIn ? 'bg-primary-500' : 'bg-ink-300'
              )}
            >
              <span
                className={cn(
                  'absolute top-1 h-6 w-6 rounded-full bg-background-card shadow-md transition-[inset-inline-start]',
                  guardianOptedIn ? 'inset-s-1' : 'inset-e-1'
                )}
              />
            </span>
          </button>

          {guardianError ? (
            <p className="text-xs font-medium text-coral-600" role="alert">
              {guardianError}
            </p>
          ) : null}

          <p className="text-xs text-ink-faint leading-relaxed">
            SOS (&quot;רגע… קשה לי&quot;) תמיד זמין — גם כשהמגע היזום כבוי. אפשר גם להפעיל אחרי SOS ראשון
            מהפופאפ.
          </p>
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
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-linear-to-l from-primary-600 to-secondary-600 px-6 py-3.5 text-base font-bold text-on-dark shadow-lg shadow-primary-600/25 transition hover:brightness-105 disabled:opacity-45"
          >
            <Bell className="h-5 w-5" aria-hidden />
            {saving ? 'שומרים…' : 'שמירת העדפות'}
          </button>
          {savedAt && !dirty ? (
            <p className="text-center text-sm font-medium text-primary-700 sm:text-start">נשמר בהצלחה</p>
          ) : null}
          {error ? (
            <p className="text-center text-sm font-medium text-coral-600 sm:text-start" role="alert">
              {error}
            </p>
          ) : null}
        </motion.div>

        <p className="text-xs leading-relaxed text-ink-faint px-1">
          שינויים נכנסים לתוקף בתזמון הריצה היומית של המערכת ובהתאם לפעילות האחרונה שלך.
          אין להתראות האלה השפעה על שיעורים, מסע או צ׳אט ישיר עם אלמוג.
        </p>
      </div>
    </div>
  );
}
