'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, FlaskConical, Loader2, Play, Route, Trash2 } from 'lucide-react';
import { OpsPageHeader } from '@/components/admin/OpsPageHeader';
import { AdminChallengeTasksEditor } from '@/components/admin/AdminChallengeTasksEditor';
import { AdminChallengeIntroEditor } from '@/components/admin/AdminChallengeIntroEditor';
import { AdminChallengeEatingWindowEditor } from '@/components/admin/AdminChallengeEatingWindowEditor';
import { AdminChallengeStatsPanel } from '@/components/admin/AdminChallengeStatsPanel';
import { AdminChallengeAuditPanel } from '@/components/admin/AdminChallengeAuditPanel';

type DemoScenario = 'waiting' | 'intro' | 'active' | 'wrap_up' | 'full';

const FULL_EXPERIENCE: { key: DemoScenario; label: string; desc: string } = {
  key: 'full',
  label: 'חוויה מלאה מההתחלה',
  desc: 'המתנה → פתיחה → חלון אכילה → ריאיון → דשבורד (כפתור "התחל עכשיו" במסך ההמתנה)',
};

const SCENARIOS: { key: DemoScenario; label: string; desc: string; day?: number }[] = [
  { key: 'waiting', label: 'המתנה לפני האתגר', desc: 'שעון חול + אלמוג נרגש' },
  { key: 'intro', label: 'פתיחה — שיר ואלמוג', desc: 'חוויית ה-WOW הראשונה' },
  { key: 'active', label: 'יום 1 פעיל', desc: 'דשבורד משימות', day: 1 },
  { key: 'active', label: 'יום 7 (אמצע)', desc: 'אמצע האתגר', day: 7 },
  { key: 'active', label: 'יום 14 (אחרון)', desc: 'יום סיום — כל המשימות', day: 14 },
  { key: 'wrap_up', label: 'מסך סיום', desc: 'סיכום + תעודה אחרי 14 יום' },
];

export function AdminChallengePanel() {
  const [loading, setLoading] = useState<string | null>(null);
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [challengeEnabled, setChallengeEnabled] = useState<boolean | null>(null);

  const loadCampaign = async () => {
    const res = await fetch('/api/v1/admin/challenge/campaign', { credentials: 'include' });
    const data = await res.json();
    setChallengeEnabled(data.challenge_enabled ?? false);
  };

  useEffect(() => {
    loadCampaign();
  }, []);

  const toggleChallenge = async () => {
    await fetch('/api/v1/admin/challenge/campaign', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challenge_enabled: !challengeEnabled }),
    });
    setChallengeEnabled((v) => !v);
  };

  const startDemo = async (scenario: DemoScenario, day?: number) => {
    const key = `${scenario}-${day ?? 0}`;
    setLoading(key);
    setError(null);
    try {
      const res = await fetch('/api/v1/admin/challenge/demo', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario, simulated_day: day }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'שגיאה');
        return;
      }
      setLastUrl(data.demo_url);
      window.open(data.demo_url, '_blank', 'noopener,noreferrer');
    } catch {
      setError('שגיאת רשת');
    } finally {
      setLoading(null);
    }
  };

  const exitDemo = async () => {
    setLoading('exit');
    await fetch('/api/v1/admin/challenge/demo', { method: 'DELETE', credentials: 'include' });
    setLastUrl(null);
    setLoading(null);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200/60 bg-white/70 p-5 shadow-sm backdrop-blur-md sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">קמפיין פעיל</h2>
            <p className="text-sm text-slate-500">14-day-reset — הרשמות חדשות נכנסות לאתגר</p>
          </div>
          {challengeEnabled !== null ? (
            <button
              type="button"
              onClick={toggleChallenge}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                challengeEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {challengeEnabled ? 'אתגר פעיל ✓' : 'אתגר כבוי'}
            </button>
          ) : null}
        </div>
      </div>

      <AdminChallengeStatsPanel />

      <AdminChallengeAuditPanel />

      <AdminChallengeIntroEditor />
      <AdminChallengeEatingWindowEditor />
      <AdminChallengeTasksEditor />

      <div className="rounded-3xl border border-violet-200/60 bg-white/70 p-5 shadow-sm backdrop-blur-md sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-violet-600" />
          <h2 className="text-lg font-bold text-slate-900">דמו אתגר — מנהל בלבד</h2>
        </div>
        <p className="mb-5 text-sm leading-relaxed text-slate-600">
          כפתורים אלה יוצרים הרשמה דמו על חשבונך ופותחים את חוויית האתגר בטאב חדש.
          הקישור חתום ותקף 15 דקות — <strong>לא יעבוד למשתמשים רגילים</strong>, רק
          למנהל מחובר. ודא/י שאת/ה מחובר/ת גם באפליקציה הראשית (לא רק ב-OPS).
        </p>

        <button
          type="button"
          disabled={loading !== null}
          onClick={() => startDemo(FULL_EXPERIENCE.key)}
          className="mb-4 flex w-full flex-col items-start rounded-2xl border-2 border-violet-400 bg-gradient-to-br from-violet-100 to-white p-5 text-right transition hover:border-violet-500 hover:shadow-md disabled:opacity-60"
        >
          <span className="flex items-center gap-2 text-base font-black text-violet-950">
            {loading === 'full-0' ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Route className="h-5 w-5" />
            )}
            {FULL_EXPERIENCE.label}
          </span>
          <span className="mt-2 text-sm text-slate-600">{FULL_EXPERIENCE.desc}</span>
        </button>

        <p className="mb-3 text-xs font-semibold text-slate-500">קפיצה ישירה למסך:</p>

        <div className="grid gap-3 sm:grid-cols-2">
          {SCENARIOS.map((s) => {
            const key = `${s.key}-${s.day ?? 0}`;
            return (
              <button
                key={key}
                type="button"
                disabled={loading !== null}
                onClick={() => startDemo(s.key, s.day)}
                className="flex min-h-[5.5rem] flex-col items-start rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50 to-white p-4 text-right transition hover:border-violet-400 hover:shadow-md disabled:opacity-60"
              >
                <span className="flex items-center gap-2 font-bold text-violet-900">
                  {loading === key ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {s.label}
                </span>
                <span className="mt-1 text-xs text-slate-500">{s.desc}</span>
              </button>
            );
          })}
        </div>

        {error ? (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : null}

        {lastUrl ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3">
            <a
              href={lastUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-800 underline"
            >
              פתח שוב את קישור הדמו
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button
              type="button"
              onClick={exitDemo}
              className="mr-auto inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm"
            >
              <Trash2 className="h-3.5 w-3.5" />
              נקה דמו
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AdminChallengePageHeader() {
  return (
    <OpsPageHeader
      icon={FlaskConical}
      eyebrow="אתגר"
      title="ניהול אתגר 14 יום"
      tone="violet"
      description="משימות, פתיחה, ElevenLabs, ודemo מלא — למנהל בלבד."
    />
  );
}
