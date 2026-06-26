'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Loader2, Plus, Sparkles, Wand2, Database } from 'lucide-react';
import { cn } from '@/lib/cn';
import { resolveGuideBackgroundUrl } from '@/lib/guides/resolve-background';

interface GuideRow {
  id: string;
  title: string;
  description: string | null;
  is_published: boolean;
  is_premium: boolean;
  visibility: string;
  unlock_at: string | null;
  background_image_key: string | null;
  lessons: { id: string; title: string; sort_order: number }[];
  rag?: { id: string; chunk_count: number } | null;
}

type AiPhase =
  | { phase: 'idle' }
  | { phase: 'working'; message: string }
  | { phase: 'questions'; questions: string[] }
  | { phase: 'done'; guide_id: string | null }
  | { phase: 'error'; message: string };

export function GuidesManager() {
  const pathname = usePathname();
  const opsHref = (path: string) => (pathname.startsWith('/ops') ? `/ops${path}` : path);

  const [guides, setGuides] = useState<GuideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceText, setSourceText] = useState('');
  const [aiPhase, setAiPhase] = useState<AiPhase>({ phase: 'idle' });
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, string>>({});
  const [newTitle, setNewTitle] = useState('');
  const [syncingRag, setSyncingRag] = useState(false);
  const [syncRagMessage, setSyncRagMessage] = useState<string | null>(null);

  const loadGuides = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/guides');
      const data = await res.json();
      setGuides(data.guides ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGuides();
  }, [loadGuides]);

  const syncAllRag = async () => {
    setSyncingRag(true);
    setSyncRagMessage(null);
    try {
      const res = await fetch('/api/v1/admin/guides/sync-rag', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'שגיאה');
      setSyncRagMessage(`סונכרנו ${data.synced} מדריכים (${data.total_chunks} קטעי ידע)`);
      await loadGuides();
    } catch (e) {
      setSyncRagMessage(e instanceof Error ? e.message : 'שגיאת סנכרון');
    } finally {
      setSyncingRag(false);
    }
  };

  const runAiGenerate = async (withAnswers = false) => {
    setAiPhase({ phase: 'working', message: 'מתחיל…' });
    try {
      const res = await fetch('/api/v1/admin/guides/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceText,
          clarificationAnswers: withAnswers ? clarificationAnswers : undefined,
          save: true,
        }),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error('אין סטרים');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line) as Record<string, unknown>;
          if (evt.phase === 'questions') {
            setAiPhase({
              phase: 'questions',
              questions: (evt.questions as string[]) ?? [],
            });
            return;
          }
          if (evt.phase === 'error') {
            setAiPhase({ phase: 'error', message: String(evt.message) });
            return;
          }
          if (evt.phase === 'done') {
            setAiPhase({ phase: 'done', guide_id: (evt.guide_id as string) ?? null });
            setSourceText('');
            setClarificationAnswers({});
            void loadGuides();
            return;
          }
          if (typeof evt.message === 'string') {
            setAiPhase({ phase: 'working', message: evt.message });
          }
        }
      }
    } catch (err) {
      setAiPhase({
        phase: 'error',
        message: err instanceof Error ? err.message : 'שגיאה',
      });
    }
  };

  const createEmpty = async () => {
    if (!newTitle.trim()) return;
    await fetch('/api/v1/admin/guides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    setNewTitle('');
    void loadGuides();
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="crystal-header rounded-2xl px-5 py-4">
        <h1 className="text-2xl font-black text-white flex items-center gap-2">
          <BookOpen className="w-7 h-7" />
          מדריכים
        </h1>
        <p className="text-sm text-white/80 mt-1">יצירה, עריכה ומחולל AI למדריכים</p>
      </div>

      {/* AI Generator */}
      <section className="crystal-surface rounded-2xl p-5 border border-violet-200/40">
        <h2 className="font-bold text-slate-900 flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5 text-violet-600" />
          מחולל מדריך AI
        </h2>
        <textarea
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
          placeholder="הדבק כאן טקסט גולמי — מאמר, תסריט, הערות… ה-AI יחלק לפרקים, משימות והרגלים"
          className="w-full min-h-[140px] rounded-xl border border-slate-200 p-3 text-sm"
          dir="rtl"
        />

        {aiPhase.phase === 'questions' && (
          <div className="mt-4 space-y-3 p-4 rounded-xl bg-white/80 border border-violet-100">
            <p className="text-sm font-bold text-violet-900">שאלות חידוד:</p>
            {aiPhase.questions.map((q) => (
              <div key={q}>
                <label className="text-xs font-semibold text-slate-600">{q}</label>
                <input
                  className="w-full mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={clarificationAnswers[q] ?? ''}
                  onChange={(e) =>
                    setClarificationAnswers((prev) => ({ ...prev, [q]: e.target.value }))
                  }
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => void runAiGenerate(true)}
              className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-bold"
            >
              המשך יצירה
            </button>
          </div>
        )}

        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <button
            type="button"
            disabled={sourceText.length < 40 || aiPhase.phase === 'working'}
            onClick={() => void runAiGenerate(false)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-bold disabled:opacity-50"
          >
            {aiPhase.phase === 'working' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Wand2 className="w-4 h-4" />
            )}
            {aiPhase.phase === 'working' ? aiPhase.message : 'צור מדריך מטקסט'}
          </button>
          {aiPhase.phase === 'error' && (
            <span className="text-sm text-red-600">{aiPhase.message}</span>
          )}
          {aiPhase.phase === 'done' && aiPhase.guide_id && (
            <Link
              href={opsHref(`/guides/${aiPhase.guide_id}`)}
              className="text-sm font-bold text-emerald-700"
            >
              המדריך נוצר — לעריכה ←
            </Link>
          )}
        </div>
      </section>

      {/* Quick create */}
      <div className="flex gap-2 flex-wrap items-center">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="שם מדריך חדש"
          className="flex-1 min-w-[200px] rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void createEmpty()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold"
        >
          <Plus className="w-4 h-4" />
          מדריך ריק
        </button>
        <button
          type="button"
          disabled={syncingRag}
          onClick={() => void syncAllRag()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-700 text-white text-sm font-bold disabled:opacity-50"
        >
          {syncingRag ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
          סנכרן הכל ל-RAG
        </button>
        {syncRagMessage ? (
          <span className="text-xs font-semibold text-teal-800 w-full">{syncRagMessage}</span>
        ) : null}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        </div>
      ) : guides.length === 0 ? (
        <p className="text-center text-slate-500 py-8">אין מדריכים עדיין</p>
      ) : (
        <div className="grid gap-3">
          {guides.map((g) => {
            const bg = resolveGuideBackgroundUrl(g.background_image_key);
            return (
              <Link
                key={g.id}
                href={opsHref(`/guides/${g.id}`)}
                className="crystal-surface flex items-center gap-4 p-4 rounded-2xl hover:shadow-lg transition"
              >
                <div
                  className="w-14 h-14 rounded-xl flex-shrink-0 bg-emerald-100 overflow-hidden"
                  style={
                    bg
                      ? { backgroundImage: `url(${bg})`, backgroundSize: 'cover' }
                      : undefined
                  }
                >
                  {!bg && <BookOpen className="w-6 h-6 text-emerald-600 m-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 truncate">{g.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {(g.lessons?.length ?? 0)} פרקים
                    {g.is_published ? ' · פורסם' : ' · טיוטה'}
                    {g.visibility === 'hidden' ? ' · מוסתר' : ''}
                    {g.is_published && (
                      g.rag && g.rag.chunk_count > 0
                        ? ` · אלמוג: ${g.rag.chunk_count} קטעי ידע`
                        : ' · אלמוג: לא מסונכרן'
                    )}
                  </p>
                </div>
                <span
                  className={cn(
                    'text-xs font-bold px-2.5 py-1 rounded-full',
                    g.is_published
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-600'
                  )}
                >
                  {g.is_published ? 'פעיל' : 'טיוטה'}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
