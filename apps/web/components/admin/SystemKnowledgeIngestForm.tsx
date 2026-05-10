'use client';

import { useEffect, useMemo, useState } from 'react';

/** ניתן להרחיב מ־API קורסים; כרגע מזהה חופשי + דוגמאות. */
const PRESET_COURSE_IDS = ['course-intro', 'course-nutrition', 'course-movement'];

type JourneyStepRow = {
  id: string;
  step_number: number;
  title: string;
};

type DataType = 'step' | 'course';
type AccessLevel = 'public' | 'premium';

export function SystemKnowledgeIngestForm() {
  const [transcript, setTranscript] = useState('');
  const [dataType, setDataType] = useState<DataType>('step');
  const [journeySteps, setJourneySteps] = useState<JourneyStepRow[]>([]);
  const [stepsLoading, setStepsLoading] = useState(true);
  const [stepsError, setStepsError] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState('');

  const [courseMode, setCourseMode] = useState<'preset' | 'custom'>('preset');
  const [presetCourseId, setPresetCourseId] = useState(PRESET_COURSE_IDS[0] ?? '');
  const [customCourseId, setCustomCourseId] = useState('');
  const [accessLevel, setAccessLevel] = useState<AccessLevel>('public');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStepsLoading(true);
      setStepsError(null);
      try {
        const res = await fetch('/api/v1/admin/journey-steps', { credentials: 'include' });
        const data = (await res.json().catch(() => null)) as JourneyStepRow[] | { error?: string } | null;
        if (!res.ok) {
          const err =
            data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
              ? data.error
              : `שגיאה ${res.status}`;
          if (!cancelled) setStepsError(err);
          return;
        }
        if (!Array.isArray(data)) {
          if (!cancelled) setStepsError('תגובת שרת לא צפויה');
          return;
        }
        const sorted = [...data].sort((a, b) => (a.step_number ?? 0) - (b.step_number ?? 0));
        if (!cancelled) {
          setJourneySteps(sorted);
          if (sorted.length && !selectedStepId) {
            setSelectedStepId(sorted[0]!.id);
          }
        }
      } catch {
        if (!cancelled) setStepsError('שגיאת רשת בטעינת צעדים');
      } finally {
        if (!cancelled) setStepsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- רק בטעינה ראשונה
  }, []);

  useEffect(() => {
    if (dataType !== 'step' || journeySteps.length === 0) return;
    if (!selectedStepId || !journeySteps.some((s) => s.id === selectedStepId)) {
      setSelectedStepId(journeySteps[0]!.id);
    }
  }, [dataType, journeySteps, selectedStepId]);

  const effectiveCourseId = useMemo(() => {
    if (dataType !== 'course') return '';
    return (courseMode === 'preset' ? presetCourseId : customCourseId).trim();
  }, [courseMode, customCourseId, dataType, presetCourseId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setMessage('');

    if (dataType === 'course' && !effectiveCourseId) {
      setStatus('err');
      setMessage('בחרו או הזינו מזהה קורס.');
      return;
    }

    if (dataType === 'step') {
      if (stepsError || !journeySteps.length) {
        setStatus('err');
        setMessage('אין צעדים זמינים — טענו מחדש או הוסיפו צעד במסע.');
        return;
      }
      if (!selectedStepId) {
        setStatus('err');
        setMessage('בחרו צעד מהרשימה.');
        return;
      }
    }

    try {
      const res = await fetch('/api/admin/ingest', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          dataType,
          accessLevel,
          ...(dataType === 'course' ? { courseId: effectiveCourseId } : {}),
          ...(dataType === 'step' ? { stepId: selectedStepId } : {}),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        chunks?: number;
        batchId?: string;
      };

      if (!res.ok) {
        setStatus('err');
        setMessage(data.error ?? `שגיאה ${res.status}`);
        return;
      }

      setStatus('ok');
      setMessage(`הועלו בהצלחה ${data.chunks ?? '?'} צ'אנקים (batch: ${data.batchId ?? '—'}).`);
      setTranscript('');
    } catch {
      setStatus('err');
      setMessage('שגיאת רשת או שרת.');
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-5 rounded-3xl border border-white/60 bg-white/55 p-5 shadow-lg backdrop-blur-md sm:p-7"
    >
      <div>
        <label htmlFor="sk-transcript" className="mb-2 block text-sm font-semibold text-slate-800">
          תמליל / חומר גלם
        </label>
        <textarea
          id="sk-transcript"
          value={transcript}
          onChange={(ev) => setTranscript(ev.target.value)}
          required
          rows={12}
          className="w-full resize-y rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 text-[15px] text-slate-900 shadow-inner outline-none ring-emerald-500/30 placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2"
          placeholder="הדביקו כאן טקסט ארוך — יפוצל אוטומטית לצ'אנקים."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sk-data-type" className="mb-2 block text-sm font-semibold text-slate-800">
            סוג ידע (dataType)
          </label>
          <select
            id="sk-data-type"
            value={dataType}
            onChange={(ev) => setDataType(ev.target.value as DataType)}
            className="w-full rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 text-[15px] font-medium text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30"
          >
            <option value="step">שלב במסע (step)</option>
            <option value="course">קורס (course)</option>
          </select>
        </div>

        <div>
          <label htmlFor="sk-access" className="mb-2 block text-sm font-semibold text-slate-800">
            רמת גישה (accessLevel)
          </label>
          <select
            id="sk-access"
            value={accessLevel}
            onChange={(ev) => setAccessLevel(ev.target.value as AccessLevel)}
            className="w-full rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 text-[15px] font-medium text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30"
          >
            <option value="public">ציבורי (public)</option>
            <option value="premium">פרימיום (premium)</option>
          </select>
        </div>
      </div>

      {dataType === 'step' && (
        <div className="space-y-2 rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-4">
          <label htmlFor="sk-step" className="block text-sm font-semibold text-emerald-950">
            צעד במסע (נטען דינמית ממסד)
          </label>
          {stepsLoading ? (
            <p className="text-sm text-emerald-900/80">טוען צעדים…</p>
          ) : stepsError ? (
            <p className="text-sm font-medium text-red-700" role="alert">
              {stepsError}
            </p>
          ) : (
            <>
              <select
                id="sk-step"
                value={selectedStepId}
                onChange={(ev) => setSelectedStepId(ev.target.value)}
                className="w-full rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 text-[15px] text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30"
              >
                {journeySteps.map((s) => (
                  <option key={s.id} value={s.id}>
                    שלב {s.step_number}: {s.title}
                  </option>
                ))}
              </select>
              <p className="text-xs text-emerald-900/75">
                נשמרים בוקטור: <code className="rounded bg-white/80 px-1">stepId</code>,{' '}
                <code className="rounded bg-white/80 px-1">stepNumber</code>
                ; אם לצעד יש <code className="rounded bg-white/80 px-1">course_id</code> במסד — גם{' '}
                <code className="rounded bg-white/80 px-1">courseId</code> לסינון פרימיום.
              </p>
            </>
          )}
        </div>
      )}

      {dataType === 'course' && (
        <div className="space-y-3 rounded-2xl border border-amber-200/70 bg-amber-50/50 p-4">
          <span className="block text-sm font-semibold text-amber-950">מזהה קורס (courseId)</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCourseMode('preset')}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                courseMode === 'preset'
                  ? 'bg-amber-500 text-white shadow'
                  : 'bg-white/80 text-amber-900 hover:bg-white'
              }`}
            >
              בחירה מהרשימה
            </button>
            <button
              type="button"
              onClick={() => setCourseMode('custom')}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                courseMode === 'custom'
                  ? 'bg-amber-500 text-white shadow'
                  : 'bg-white/80 text-amber-900 hover:bg-white'
              }`}
            >
              מזהה מותאם
            </button>
          </div>
          {courseMode === 'preset' ? (
            <select
              value={presetCourseId}
              onChange={(ev) => setPresetCourseId(ev.target.value)}
              className="w-full rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 text-[15px] text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/35"
            >
              {PRESET_COURSE_IDS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={customCourseId}
              onChange={(ev) => setCustomCourseId(ev.target.value)}
              placeholder="מזהה קורס (מומלץ UUID כמו ב-enrollments)"
              className="w-full rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 text-[15px] text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/35"
            />
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={status === 'loading' || (dataType === 'step' && (stepsLoading || !!stepsError || !journeySteps.length))}
        className="w-full rounded-2xl bg-gradient-to-l from-emerald-600 to-teal-600 px-5 py-3.5 text-base font-bold text-white shadow-lg shadow-emerald-600/30 transition hover:brightness-105 active:scale-[0.99] disabled:opacity-60"
      >
        {status === 'loading' ? 'מעלה ומטמיע…' : 'שליחה והטמעה ל־Upstash'}
      </button>

      {message ? (
        <p
          role="status"
          className={`text-center text-sm font-medium ${status === 'err' ? 'text-red-700' : 'text-emerald-800'}`}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
