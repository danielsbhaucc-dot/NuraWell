'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Loader2, Save, ImagePlus, Trash2, CheckCircle2 } from 'lucide-react';
import { resolveGuideBackgroundUrl } from '@/lib/guides/resolve-background';
import { useMediaManager } from '@/components/media-manager/MediaManagerProvider';
import type { MediaAsset } from '@/components/media-manager/types';

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
  const pathname = usePathname();
  const { open: openMediaManager } = useMediaManager();
  const id = params.id as string;
  const guidesListHref = pathname.startsWith('/ops') ? '/ops/guides' : '/guides';
  const [guide, setGuide] = useState<GuideDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bgKey, setBgKey] = useState('');
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const saveBackground = async (key: string) => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/v1/admin/guides/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ background_image_key: key || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'שגיאת שמירה');
      }
      const data = await res.json();
      setGuide(data.guide ?? guide);
      setBgKey(data.guide?.background_image_key ?? key);
      setSaveMsg({ type: 'ok', text: 'תמונת הרקע נשמרה' });
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (err) {
      setSaveMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'שגיאה בשמירת התמונה',
      });
    } finally {
      setSaving(false);
    }
  };

  const pickBackground = () => {
    openMediaManager({
      kind: 'image',
      mode: 'pick',
      title: 'תמונת רקע למדריך',
      onSelect: (asset: MediaAsset) => {
        const key = asset.object_key?.trim();
        if (!key) {
          setSaveMsg({ type: 'err', text: 'לתמונה שנבחרה אין מפתח אחסון — העלה מחדש' });
          return;
        }
        setBgKey(key);
        void saveBackground(key);
      },
    });
  };

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
      <Link href={guidesListHref} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-emerald-700">
        <ArrowRight className="w-4 h-4" />
        חזרה לרשימה
      </Link>

      <div className="crystal-header rounded-2xl px-5 py-3 flex items-center justify-between gap-3">
        <h1 className="text-xl font-black text-white">עריכת מדריך</h1>
        <button
          type="button"
          onClick={() => void saveGuide()}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/90 text-emerald-800 text-sm font-bold hover:bg-white"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          שמור
        </button>
      </div>

      <div className="crystal-surface space-y-4 p-5 rounded-2xl">
        <div>
          <label htmlFor="guide-edit-title" className="text-xs font-bold text-slate-600">
            כותרת
          </label>
          <input
            id="guide-edit-title"
            className="w-full mt-1 rounded-lg border px-3 py-2"
            value={guide.title}
            onChange={(e) => setGuide({ ...guide, title: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="guide-edit-description" className="text-xs font-bold text-slate-600">
            תיאור
          </label>
          <textarea
            id="guide-edit-description"
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
          <p className="text-xs font-bold text-slate-600 flex items-center gap-1.5 mb-2">
            <ImagePlus className="w-3.5 h-3.5" aria-hidden />
            תמונת רקע למדריך
          </p>
          {bgUrl ? (
            <div className="relative overflow-hidden rounded-2xl border border-slate-200">
              <div
                className="h-32 bg-cover bg-center"
                style={{ backgroundImage: `url(${bgUrl})` }}
              />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-slate-900/70 to-transparent p-2.5">
                <button
                  type="button"
                  onClick={pickBackground}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-800 shadow hover:bg-white"
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  החלפת תמונה
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBgKey('');
                    void saveBackground('');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/90 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-rose-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  הסר
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={pickBackground}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/60 py-7 text-slate-500 transition hover:border-emerald-400 hover:bg-emerald-50/50 hover:text-emerald-700"
            >
              <ImagePlus className="w-6 h-6" />
              <span className="text-sm font-bold">בחר תמונה ממנהל הקבצים</span>
              <span className="text-xs text-slate-400">תמונת הרקע תוצג מאחורי המדריך</span>
            </button>
          )}
          {saveMsg && (
            <p
              className={`mt-2 flex items-center gap-1.5 text-xs font-bold ${
                saveMsg.type === 'ok' ? 'text-emerald-700' : 'text-red-600'
              }`}
            >
              {saveMsg.type === 'ok' && <CheckCircle2 className="w-3.5 h-3.5" />}
              {saveMsg.text}
            </p>
          )}
          {saving && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-slate-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              שומר תמונה…
            </p>
          )}
        </div>
        <div>
          <label htmlFor="guide-edit-unlock-at" className="text-xs font-bold text-slate-600">
            פתיחה מתוזמנת (unlock_at)
          </label>
          <input
            id="guide-edit-unlock-at"
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

      <section className="crystal-surface rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3 pb-3 border-b border-emerald-100">
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
                className="crystal-pill p-3 rounded-xl flex items-center gap-3"
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
