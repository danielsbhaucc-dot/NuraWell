'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Loader2, Save, ImageIcon } from 'lucide-react';
import { resolveGuideBackgroundUrl } from '@/lib/guides/resolve-background';

interface LessonRow {
  id: string;
  title: string;
  description: string | null;
  lesson_type: string;
  text_content: string | null;
  sort_order: number;
  duration_minutes: number | null;
  is_published: boolean;
  tasks: unknown[];
  habits: unknown[];
}

interface GuideDetail {
  id: string;
  title: string;
  description: string | null;
  is_published: boolean;
  is_premium: boolean;
  visibility: string;
  unlock_at: string | null;
  background_image_key: string | null;
  lessons: LessonRow[];
}

export default function OpsGuideDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [guide, setGuide] = useState<GuideDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bgKey, setBgKey] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/v1/admin/guides/${id}`);
    const data = await res.json();
    setGuide(data.guide ?? null);
    setBgKey(data.guide?.background_image_key ?? '');
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveGuide = async () => {
    if (!guide) return;
    setSaving(true);
    await fetch(`/api/v1/admin/guides/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: guide.title,
        description: guide.description,
        is_published: guide.is_published,
        is_premium: guide.is_premium,
        visibility: guide.visibility,
        unlock_at: guide.unlock_at,
        background_image_key: bgKey || null,
      }),
    });
    setSaving(false);
    void load();
  };

  const addLesson = async () => {
    const title = prompt('שם הפרק:');
    if (!title?.trim()) return;
    await fetch(`/api/v1/admin/guides/${id}/lessons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        sort_order: guide?.lessons?.length ?? 0,
        lesson_type: 'text',
        is_published: true,
      }),
    });
    void load();
  };

  if (loading || !guide) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const bgUrl = resolveGuideBackgroundUrl(bgKey);

  return (
    <div className="space-y-6 max-w-3xl" dir="rtl">
      <Link href="/ops/guides" className="inline-flex items-center gap-1 text-sm text-slate-600">
        <ArrowRight className="w-4 h-4" />
        חזרה לרשימה
      </Link>

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-black text-slate-900">עריכת מדריך</h1>
        <button
          type="button"
          onClick={() => void saveGuide()}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          שמור
        </button>
      </div>

      <div className="space-y-4 p-5 rounded-2xl border border-slate-200 bg-white/90">
        <div>
          <label className="text-xs font-bold text-slate-600">כותרת</label>
          <input
            className="w-full mt-1 rounded-lg border px-3 py-2"
            value={guide.title}
            onChange={(e) => setGuide({ ...guide, title: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600">תיאור</label>
          <textarea
            className="w-full mt-1 rounded-lg border px-3 py-2 min-h-[80px]"
            value={guide.description ?? ''}
            onChange={(e) => setGuide({ ...guide, description: e.target.value })}
          />
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={guide.is_published}
              onChange={(e) => setGuide({ ...guide, is_published: e.target.checked })}
            />
            פורסם
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={guide.is_premium}
              onChange={(e) => setGuide({ ...guide, is_premium: e.target.checked })}
            />
            פרימיום
          </label>
          <select
            className="rounded-lg border px-2 py-1 text-sm"
            value={guide.visibility}
            onChange={(e) => setGuide({ ...guide, visibility: e.target.value })}
          >
            <option value="discoverable">גלוי</option>
            <option value="hidden">מוסתר</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
            <ImageIcon className="w-3.5 h-3.5" />
            מפתח רקע R2 (ממנהל המדיה)
          </label>
          <input
            className="w-full mt-1 rounded-lg border px-3 py-2 text-sm font-mono"
            value={bgKey}
            onChange={(e) => setBgKey(e.target.value)}
            placeholder="media/images/..."
          />
          {bgUrl && (
            <div
              className="mt-2 h-24 rounded-xl bg-cover bg-center border"
              style={{ backgroundImage: `url(${bgUrl})` }}
            />
          )}
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600">פתיחה מתוזמנת (unlock_at)</label>
          <input
            type="datetime-local"
            className="w-full mt-1 rounded-lg border px-3 py-2 text-sm"
            value={guide.unlock_at ? guide.unlock_at.slice(0, 16) : ''}
            onChange={(e) =>
              setGuide({
                ...guide,
                unlock_at: e.target.value ? new Date(e.target.value).toISOString() : null,
              })
            }
          />
        </div>
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-slate-900">פרקים ({guide.lessons?.length ?? 0})</h2>
          <button
            type="button"
            onClick={() => void addLesson()}
            className="text-sm font-bold text-emerald-700"
          >
            + פרק
          </button>
        </div>
        <div className="space-y-2">
          {[...(guide.lessons ?? [])]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((l, i) => (
              <div
                key={l.id}
                className="p-3 rounded-xl border border-slate-200 bg-white flex items-center gap-3"
              >
                <span className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 text-sm font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{l.title}</p>
                  <p className="text-xs text-slate-500">{l.lesson_type}</p>
                </div>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}
