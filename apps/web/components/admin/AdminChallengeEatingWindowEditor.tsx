'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Loader2, Save } from 'lucide-react';
import type { ChallengeEatingWindowLesson } from '@/lib/challenge/content';

export function AdminChallengeEatingWindowEditor() {
  const [lesson, setLesson] = useState<ChallengeEatingWindowLesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/challenge/lesson', { credentials: 'include' });
      const data = await res.json();
      setLesson(data.lesson ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!lesson) return;
    setSaving(true);
    setSaved(false);
    try {
      await fetch('/api/v1/admin/challenge/lesson', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lesson),
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !lesson) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-slate-200/60 bg-white/70 p-5 shadow-sm backdrop-blur-md sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-emerald-600" />
        <h2 className="text-lg font-bold text-slate-900">שיעור חלון אכילה</h2>
      </div>
      <p className="mb-4 text-sm text-slate-600">
        מוצג לפני הגדרת חלון האכילה. ניתן HTML בסיסי ב-body_html.
      </p>

      <div className="space-y-3">
        <label className="block text-sm font-semibold text-slate-700">
          כותרת
          <input
            type="text"
            value={lesson.title}
            onChange={(e) => setLesson({ ...lesson, title: e.target.value })}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </label>

        <label className="block text-sm font-semibold text-slate-700">
          תוכן (HTML)
          <textarea
            value={lesson.body_html}
            onChange={(e) => setLesson({ ...lesson, body_html: e.target.value })}
            rows={6}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
          />
        </label>

        <label className="block text-sm font-semibold text-slate-700">
          קישור וידאו (אופציונלי)
          <input
            type="url"
            value={lesson.video_url ?? ''}
            onChange={(e) =>
              setLesson({ ...lesson, video_url: e.target.value.trim() || null })
            }
            placeholder="https://..."
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            dir="ltr"
          />
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          שמור שיעור
        </button>
        {saved ? <span className="text-sm text-emerald-700">נשמר ✓</span> : null}
      </div>
    </div>
  );
}
