'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Loader2,
  RefreshCw,
  Send,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  opsGlassBtnClass,
  opsGlassBtnPrimaryClass,
  opsGlassCardClass,
  opsInputClass,
} from './OpsPanel';
import { ConfirmDialog } from './ConfirmDialog';

type LabModel = {
  key: string;
  label: string;
  provider: string;
  model: string;
};

type RunResult = {
  ok: boolean;
  ms: number;
  body?: string;
  notification_id?: unknown;
  error?: string;
};

type ModelResult = {
  key: string;
  label: string;
  provider: string;
  model: string;
  configured: boolean;
  runs: RunResult[];
};

type LabResponse = {
  ok: boolean;
  mode?: 'dry_run' | 'sent';
  slot?: string;
  checkpoint_date?: string;
  used_fallback_habit?: boolean;
  pending_task_titles?: string[];
  models_count?: number;
  runs_total?: number;
  runs_ok?: number;
  results?: ModelResult[];
  hint_he?: string;
  error?: string;
};

type Slot = 'auto' | 'morning' | 'midday' | 'evening';

const SLOT_OPTIONS: { value: Slot; label: string }[] = [
  { value: 'auto', label: 'אוטומטי (לפי השעה)' },
  { value: 'morning', label: 'בוקר' },
  { value: 'midday', label: 'צהריים' },
  { value: 'evening', label: 'ערב' },
];

export function NotifyModelLab() {
  const [models, setModels] = useState<LabModel[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [slot, setSlot] = useState<Slot>('auto');
  const [count, setCount] = useState(1);
  const [loadingModels, setLoadingModels] = useState(true);
  const [openrouterConfigured, setOpenrouterConfigured] = useState<boolean | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<LabResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);

  const loadModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      const res = await fetch('/api/v1/admin/notify-model-lab', {
        method: 'GET',
        credentials: 'include',
      });
      const json = (await res.json().catch(() => ({}))) as {
        models?: LabModel[];
        openrouter_configured?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? 'טעינת רשימת המודלים נכשלה.');
        return;
      }
      const list = Array.isArray(json.models) ? json.models : [];
      setModels(list);
      setSelected(new Set(list.map((m) => m.key)));
      setOpenrouterConfigured(json.openrouter_configured ?? null);
      setError(null);
    } catch {
      setError('טעינת רשימת המודלים נכשלה (רשת).');
    } finally {
      setLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  function toggleModel(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const allSelected = models.length > 0 && selected.size === models.length;

  async function run(dryRun: boolean) {
    if (running) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const selectedKeys = models.filter((m) => selected.has(m.key)).map((m) => m.key);
      const body: Record<string, unknown> = { dryRun, count };
      if (slot !== 'auto') body.slot = slot;
      if (selectedKeys.length === models.length || selectedKeys.length === 0) {
        body.all = true;
      } else {
        body.models = selectedKeys;
      }

      const res = await fetch('/api/v1/admin/notify-model-lab', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as LabResponse;
      if (!res.ok || json.ok === false) {
        setError(json.error ? `שגיאה: ${json.error}` : 'הבקשה נכשלה.');
        setResult(json);
        return;
      }
      setResult(json);
    } catch {
      setError('הבקשה נכשלה (רשת).');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* בקרת ספק */}
      {openrouterConfigured === false && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-300/60 bg-amber-50/70 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>OPENROUTER_API_KEY</strong> לא מוגדר בסביבה. כל הקריאות עוברות דרך OpenRouter, אז
            הבדיקה לא תעבוד בלעדיו.
          </span>
        </div>
      )}

      {/* פאנל בקרה */}
      <div className={opsGlassCardClass}>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-700">חלון יום (Slot)</span>
              <select
                value={slot}
                onChange={(e) => setSlot(e.target.value as Slot)}
                className={opsInputClass}
                disabled={running}
              >
                {SLOT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-700">
                כמה התראות לכל מודל
              </span>
              <input
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                className={opsInputClass}
                disabled={running}
              />
            </label>
          </div>

          {/* רשימת מודלים */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">
                מודלים לבדיקה ({selected.size}/{models.length})
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelected(new Set(models.map((m) => m.key)))}
                  className="text-xs font-bold text-emerald-700 hover:underline disabled:opacity-50"
                  disabled={running || allSelected}
                >
                  בחר הכל
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="text-xs font-bold text-slate-500 hover:underline disabled:opacity-50"
                  disabled={running || selected.size === 0}
                >
                  נקה
                </button>
              </div>
            </div>

            {loadingModels ? (
              <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> טוען מודלים…
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {models.map((m) => {
                  const on = selected.has(m.key);
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => toggleModel(m.key)}
                      disabled={running}
                      className={cn(
                        'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-right transition active:scale-[0.99] disabled:opacity-60',
                        on
                          ? 'border-emerald-300/70 bg-emerald-500/10'
                          : 'border-white/55 bg-white/30 hover:bg-white/50',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                          on
                            ? 'border-emerald-500 bg-emerald-500 text-white'
                            : 'border-slate-300 bg-white',
                        )}
                      >
                        {on && <CheckCircle2 className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-slate-800">
                          {m.label}
                        </span>
                        <span className="block truncate text-[11px] text-slate-500" dir="ltr">
                          {m.model}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* כפתורי פעולה */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => void run(true)}
              disabled={running || loadingModels}
              className={opsGlassBtnClass}
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              תצוגה מקדימה (לא שולח)
            </button>
            <button
              type="button"
              onClick={() => setConfirmSendOpen(true)}
              disabled={running || loadingModels}
              className={opsGlassBtnPrimaryClass}
            >
              <Send className="h-4 w-4" />
              שלח התראות אמת
            </button>
            <button
              type="button"
              onClick={() => void loadModels()}
              disabled={running || loadingModels}
              className={cn(opsGlassBtnClass, 'mr-auto')}
              title="רענן רשימת מודלים"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-500">
            הכול דרך OpenRouter (ניתוב מועדף ל-DeepInfra). &quot;תצוגה מקדימה&quot; מנסחת בלי לכתוב
            ל-DB ובלי push. &quot;שלח&quot; שולח התראת אמת שתופיע בפעמון — בלתי מוגבל, בלי לגעת
            בסלוט החי.
          </p>
        </div>
      </div>

      {/* שגיאה */}
      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-300/60 bg-rose-50/70 p-3 text-sm text-rose-800">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* תוצאות */}
      {result?.results && result.results.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold',
                result.mode === 'sent'
                  ? 'bg-emerald-500/15 text-emerald-800'
                  : 'bg-sky-500/15 text-sky-800',
              )}
            >
              {result.mode === 'sent' ? 'נשלחו התראות אמת' : 'תצוגה מקדימה (לא נשלח)'}
            </span>
            <span className="text-xs text-slate-500">
              חלון: {result.slot ?? '—'} · הצליחו {result.runs_ok ?? 0}/{result.runs_total ?? 0}
            </span>
            {result.used_fallback_habit && (
              <span className="text-xs text-amber-700">השתמש במשימת ברירת מחדל (אין משימות פתוחות)</span>
            )}
          </div>

          {result.results.map((r) => (
            <div key={r.key} className={cn(opsGlassCardClass, 'p-4 sm:p-4')}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-black text-slate-900">{r.label}</h3>
                  <p className="truncate text-[11px] text-slate-500" dir="ltr">
                    {r.model}
                  </p>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold',
                    r.runs.every((x) => x.ok)
                      ? 'bg-emerald-500/15 text-emerald-800'
                      : r.runs.some((x) => x.ok)
                        ? 'bg-amber-500/15 text-amber-800'
                        : 'bg-rose-500/15 text-rose-800',
                  )}
                >
                  {r.runs.filter((x) => x.ok).length}/{r.runs.length}
                </span>
              </div>

              <div className="space-y-2">
                {r.runs.map((run_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'rounded-xl border p-2.5 text-sm',
                      run_.ok
                        ? 'border-emerald-200/60 bg-white/50'
                        : 'border-rose-200/60 bg-rose-50/40',
                    )}
                  >
                    {run_.ok ? (
                      <div className="space-y-1">
                        <p className="leading-relaxed text-slate-800">{run_.body}</p>
                        <p className="text-[11px] text-slate-400">{run_.ms} ms</p>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2 text-rose-700">
                        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span className="text-xs" dir="ltr">
                          {run_.error}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmSendOpen}
        title="שליחת התראות אמת"
        message={`ישלחו התראות אמת ל${count > 1 ? `-${count} פעמים לכל ` : ''}${
          selected.size === 0 || allSelected ? 'כל המודלים' : `${selected.size} מודלים`
        }. הן יופיעו בפעמון/Push שלך. להמשיך?`}
        confirmLabel="שלח"
        cancelLabel="ביטול"
        busy={running}
        onConfirm={() => {
          setConfirmSendOpen(false);
          void run(false);
        }}
        onCancel={() => setConfirmSendOpen(false)}
      />
    </div>
  );
}
