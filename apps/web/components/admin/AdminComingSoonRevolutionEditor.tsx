'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Loader2,
  Plus,
  Quote,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import { DEFAULT_REVOLUTION_LINES } from '@/lib/coming-soon/revolution-lines';
import { OpsPanelHeader, opsGlassCardClass, opsInputClass } from '@/components/admin/OpsPanel';
import { cn } from '@/lib/cn';

function renderEmphasisPreview(text: string) {
  const parts = text.split(/(\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <span key={i} className="bg-gradient-to-l from-emerald-500 to-cyan-500 bg-clip-text font-black text-transparent">
          {part.slice(1, -1)}
        </span>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function AdminComingSoonRevolutionEditor() {
  const [lines, setLines] = useState<string[]>(DEFAULT_REVOLUTION_LINES);
  const [isCustom, setIsCustom] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [previewIdx, setPreviewIdx] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/v1/admin/coming-soon-revolution-lines', { credentials: 'include' });
      const data = (await res.json()) as { lines?: string[]; is_custom?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error || 'טעינה נכשלה');
        return;
      }
      setLines(Array.isArray(data.lines) && data.lines.length > 0 ? data.lines : DEFAULT_REVOLUTION_LINES);
      setIsCustom(Boolean(data.is_custom));
    } catch {
      setError('שגיאת רשת');
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateLine = (idx: number, value: string) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? value : l)));
    setSuccess(null);
  };

  const moveLine = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= lines.length) return;
    setLines((prev) => {
      const copy = [...prev];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy;
    });
    setSuccess(null);
  };

  const removeLine = (idx: number) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
    setSuccess(null);
  };

  const addLine = () => {
    if (lines.length >= 24) return;
    setLines((prev) => [...prev, 'משפט חדש — עטוף מילים חשובות ב*כוכביות*.']);
    setSuccess(null);
  };

  const save = async () => {
    const trimmed = lines.map((l) => l.trim()).filter(Boolean);
    if (trimmed.length === 0) {
      setError('נדרש לפחות משפט אחד');
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/v1/admin/coming-soon-revolution-lines', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: trimmed }),
      });
      const data = (await res.json()) as { ok?: boolean; lines?: string[]; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error || 'שמירה נכשלה');
        return;
      }
      setLines(data.lines ?? trimmed);
      setIsCustom(true);
      setSuccess(`נשמרו ${trimmed.length} משפטים.`);
    } catch {
      setError('שגיאת רשת');
    } finally {
      setBusy(false);
    }
  };

  const resetDefaults = async () => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/v1/admin/coming-soon-revolution-lines', {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = (await res.json()) as { ok?: boolean; lines?: string[]; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error || 'איפוס נכשל');
        return;
      }
      setLines(data.lines ?? DEFAULT_REVOLUTION_LINES);
      setIsCustom(false);
      setSuccess('אופס לברירת המחדל (12 משפטים).');
    } catch {
      setError('שגיאת רשת');
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) {
    return (
      <div className={cn(opsGlassCardClass, 'flex items-center justify-center py-16')}>
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <section className={opsGlassCardClass} dir="rtl">
      <OpsPanelHeader
        icon={Quote}
        title="משפטי בלופ"
        description={
          <>
            המשפטים שמוצגים בלופ אחרי השיר בעמוד &quot;בקרוב&quot;. עטוף מילים חשובות ב<span className="font-mono">*כוכביות*</span>{' '}
            להדגשה ויזואלית. כרגע {lines.length} משפטים
            {isCustom ? ' (מותאם אישית)' : ' (ברירת מחדל)'}.
          </>
        }
        tone="violet"
      />

      <div className="mt-5 rounded-2xl border border-violet-200/50 bg-violet-50/40 px-4 py-3">
        <p className="text-xs font-bold text-violet-900/70">תצוגה מקדימה</p>
        <p className="mt-1 min-h-[2.5rem] text-base font-semibold leading-relaxed text-slate-800">
          {renderEmphasisPreview(lines[previewIdx] ?? '')}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {lines.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPreviewIdx(i)}
              className={cn(
                'h-7 min-w-7 rounded-lg px-2 text-xs font-bold transition',
                previewIdx === i
                  ? 'bg-violet-600 text-white'
                  : 'bg-white/70 text-slate-600 hover:bg-white',
              )}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-5 space-y-3">
        {lines.map((line, idx) => (
          <li
            key={idx}
            className="rounded-2xl border border-white/60 bg-white/50 p-3 backdrop-blur-sm"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-black text-slate-500">משפט {idx + 1}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => moveLine(idx, -1)}
                  className="rounded-lg border border-slate-200/80 bg-white/70 p-1.5 text-slate-600 transition hover:bg-white disabled:opacity-30"
                  aria-label="הזז למעלה"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={idx === lines.length - 1}
                  onClick={() => moveLine(idx, 1)}
                  className="rounded-lg border border-slate-200/80 bg-white/70 p-1.5 text-slate-600 transition hover:bg-white disabled:opacity-30"
                  aria-label="הזז למטה"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={lines.length <= 1}
                  onClick={() => removeLine(idx)}
                  className="rounded-lg border border-red-200/80 bg-red-50/80 p-1.5 text-red-700 transition hover:bg-red-100 disabled:opacity-30"
                  aria-label="מחק משפט"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <textarea
              value={line}
              onChange={(e) => updateLine(idx, e.target.value)}
              rows={2}
              dir="rtl"
              className={cn(opsInputClass, 'min-h-[4rem] resize-y leading-relaxed')}
              placeholder="כתוב משפט… *מילה מודגשת*"
            />
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={lines.length >= 24 || busy}
          onClick={addLine}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-violet-300/60 bg-white/50 px-3 py-2 text-sm font-bold text-violet-900 transition hover:bg-white/80 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          הוסף משפט
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-gradient-to-l from-violet-600 to-fuchsia-600 px-4 py-2 text-sm font-bold text-white shadow-md shadow-violet-600/25 transition hover:from-violet-700 hover:to-fuchsia-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          שמור משפטים
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void resetDefaults()}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300/70 bg-white/40 px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-white/70 disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" />
          איפוס לברירת מחדל
        </button>
      </div>

      {error ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </p>
      ) : null}
      {success ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {success}
        </p>
      ) : null}
    </section>
  );
}
