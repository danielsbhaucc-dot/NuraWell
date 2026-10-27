'use client';

import { HABIT_ICONS } from '@/lib/module-api/journey/lib-journey-habit-icons';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Edit3,
  Footprints,
  ImageIcon,
  Layers,
  Loader2,
  Map,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import type { JourneyStep } from '@/lib/types/journey';
import type { StationCoverCredit } from '@/lib/module-api/journey/lib-journey-group-journey-by-station';
import { AdminStationCoverPanel } from '@/components/admin/AdminStationCoverPanel';
import { OpsPageHeader } from '@/components/admin/OpsPageHeader';
import {
  opsGlassBtnClass,
  opsGlassBtnDangerClass,
  opsGlassBtnPrimaryClass,
  opsInputClass,
} from '@/components/admin/OpsPanel';
import { glassPanelStyle } from '@/lib/module-api/site-content/components-media-manager-glass-styles';
import { cn } from '@/lib/cn';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';

type StationRow = {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  is_foundation?: boolean;
  habit_key?: string | null;
  track?: string | null;
  cover_image_key: string | null;
  cover_image_credit: StationCoverCredit | null;
  coverImageUrl: string | null;
};

type StepWithStation = JourneyStep;
type ViewTab = 'stations' | 'orphans';
type PopupTab = 'steps' | 'cover';

type AdminJourneyHubProps = {
  initialStations: StationRow[];
  initialSteps: StepWithStation[];
};

export function AdminJourneyHub({ initialStations, initialSteps }: AdminJourneyHubProps) {
  const router = useRouter();
  const pathname = usePathname();
  const opsBase = pathname.startsWith('/ops') ? '/ops' : '';

  const [stations, setStations] = useState(initialStations);
  const [steps] = useState(initialSteps);
  const [searchQ, setSearchQ] = useState('');
  const [viewTab, setViewTab] = useState<ViewTab>('stations');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [popupTab, setPopupTab] = useState<PopupTab>('steps');
  const [showAddPopup, setShowAddPopup] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSort, setNewSort] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // מצב סוכן — יצירת מסע שלם ב-AI
  const [showAiPopup, setShowAiPopup] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiStations, setAiStations] = useState<number | ''>('');
  const [aiStepsPer, setAiStepsPer] = useState<number | ''>('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<{ stations: number; steps: number } | null>(null);

  async function generateJourneyWithAi(e: React.FormEvent) {
    e.preventDefault();
    if (aiPrompt.trim().length < 10 || aiBusy) return;
    setAiBusy(true);
    setAiError(null);
    setAiResult(null);
    try {
      const res = await fetch('/api/v1/admin/journey/ai-generate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt.trim(),
          stations: aiStations === '' ? undefined : aiStations,
          stepsPerStation: aiStepsPer === '' ? undefined : aiStepsPer,
          persist: true,
        }),
      });
      const json = (await res.json()) as {
        created?: { stations: number; steps: number };
        error?: string;
      };
      if (!res.ok || !json.created) {
        setAiError(json.error ?? 'יצירת המסע נכשלה. נסו לנסח אחרת.');
        return;
      }
      setAiResult(json.created);
      router.refresh();
    } catch {
      setAiError('שגיאת רשת. נסו שוב.');
    } finally {
      setAiBusy(false);
    }
  }

  const stepsByStation = useCallback(
    (sid: string | null) => steps.filter((s) => (sid ? s.station_id === sid : !s.station_id)),
    [steps],
  );

  const orphanSteps = useMemo(() => stepsByStation(null), [stepsByStation]);
  const selected = useMemo(
    () => stations.find((s) => s.id === selectedId) ?? null,
    [stations, selectedId],
  );

  const q = searchQ.trim().toLowerCase();

  const filteredStations = useMemo(() => {
    if (!q) return stations;
    return stations.filter((st) => {
      if (st.title.toLowerCase().includes(q)) return true;
      return stepsByStation(st.id).some((s) => s.title.toLowerCase().includes(q));
    });
  }, [stations, q, stepsByStation]);

  const filteredOrphans = useMemo(() => {
    if (!q) return orphanSteps;
    return orphanSteps.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        String(s.step_number).includes(q),
    );
  }, [orphanSteps, q]);

  const closeStation = useCallback(() => {
    setSelectedId(null);
    setPopupTab('steps');
  }, []);

  const openStation = useCallback((id: string) => {
    setSelectedId(id);
    setPopupTab('steps');
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) closeStation();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [selectedId, busy, closeStation]);

  async function addStation(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setBusy('add');
    const res = await fetch('/api/v1/admin/journey-stations', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle.trim(), sort_order: newSort }),
    });
    if (res.ok) {
      const row = (await res.json()) as StationRow;
      setStations((prev) =>
        [...prev, { ...row, coverImageUrl: null }].sort(
          (a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, 'he'),
        ),
      );
      setNewTitle('');
      setNewSort(0);
      setShowAddPopup(false);
      openStation(row.id);
      router.refresh();
    }
    setBusy(null);
  }

  async function deleteStation(id: string) {
    setPendingDeleteId(id);
  }

  async function executeDeleteStation() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setBusy(id);
    const res = await fetch('/api/v1/admin/journey-stations', {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setStations((prev) => prev.filter((s) => s.id !== id));
      if (selectedId === id) closeStation();
      router.refresh();
    }
    setBusy(null);
    setPendingDeleteId(null);
  }

  async function patchStationMeta(id: string, patch: { habit_key?: string | null; track?: string }) {
    setBusy(`meta-${id}`);
    const res = await fetch('/api/v1/admin/journey-stations', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    });
    if (res.ok) {
      const row = (await res.json()) as StationRow;
      setStations((prev) => prev.map((s) => (s.id === row.id ? { ...s, habit_key: row.habit_key, track: row.track } : s)));
      router.refresh();
    }
    setBusy(null);
  }

  async function toggleFoundation(id: string, next: boolean) {
    setBusy(`foundation-${id}`);
    const res = await fetch('/api/v1/admin/journey-stations', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_foundation: next }),
    });
    if (res.ok) {
      const row = (await res.json()) as StationRow;
      setStations((prev) =>
        prev
          .map((s) => ({
            ...s,
            is_foundation: s.id === row.id ? row.is_foundation === true : next ? false : s.is_foundation,
          }))
          .sort(
            (a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, 'he'),
          ),
      );
      router.refresh();
    }
    setBusy(null);
  }

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={Boolean(pendingDeleteId)}
        title="למחוק תחנה?"
        message="צעדים משויכים יישארו ללא תחנה."
        confirmLabel="מחק"
        cancelLabel="ביטול"
        danger
        busy={busy === pendingDeleteId}
        onConfirm={() => void executeDeleteStation()}
        onCancel={() => {
          if (busy) return;
          setPendingDeleteId(null);
        }}
      />
      <OpsPageHeader
        icon={Map}
        eyebrow="ניהול מסע"
        title="מסע ותחנות"
        tone="amber"
        description="חיפוש, לחיצה על תחנה לפופאפ עם טאבים — צעדים ותמונת רקע."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setShowAiPopup(true);
                setAiError(null);
                setAiResult(null);
              }}
              className={opsGlassBtnPrimaryClass}
            >
              <Wand2 className="h-4 w-4" />
              צור מסע ב-AI
            </button>
            <button type="button" onClick={() => setShowAddPopup(true)} className={opsGlassBtnClass}>
              <Layers className="h-4 w-4" />
              תחנה חדשה
            </button>
            <Link href={`${opsBase}/steps/new`} className={opsGlassBtnClass}>
              <Plus className="h-4 w-4" />
              צעד חדש
            </Link>
          </div>
        }
      />

      {/* חיפוש + טאבי תצוגה */}
      <section className="overflow-hidden rounded-2xl border border-gc/50 bg-background-card/30 shadow-[0_8px_28px_rgba(15,23,42,0.06)] backdrop-blur-xl">
        <div className="border-b border-gc/40 p-3">
          <div className="relative">
            <Search className="absolute inset-s-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
            <input
              type="search"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="חיפוש תחנה או צעד..."
              className={cn(opsInputClass, 'pr-10')}
              dir="rtl"
            />
          </div>
        </div>
        <div className="flex gap-1.5 p-2">
          {(
            [
              { key: 'stations' as const, label: 'תחנות', count: filteredStations.length, icon: Layers },
              { key: 'orphans' as const, label: 'ללא תחנה', count: filteredOrphans.length, icon: Footprints },
            ] as const
          ).map(({ key, label, count, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setViewTab(key)}
              className={cn(
                'flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-bold transition-all sm:text-sm',
                viewTab === key
                  ? 'border border-accent-300/50 bg-accent-500/15 text-accent-900 shadow-xs backdrop-blur-md'
                  : 'border border-transparent text-ink-soft hover:border-gc/50 hover:bg-background-card/35',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
              <span className="rounded-full bg-background-card/40 px-1.5 py-0.5 text-[10px] tabular-nums">{count}</span>
            </button>
          ))}
        </div>
      </section>

      {/* רשימה */}
      {viewTab === 'stations' ? (
        filteredStations.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-faint">
            {q ? 'לא נמצאו תחנות תואמות' : 'אין תחנות עדיין — צרו תחנה חדשה'}
          </p>
        ) : (
          <ul className="space-y-2">
            {filteredStations.map((st) => {
              const stepCount = stepsByStation(st.id).length;
              return (
                <li key={st.id}>
                  <button
                    type="button"
                    onClick={() => openStation(st.id)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-gc/50 bg-background-card/28 px-3 py-3 text-start shadow-xs backdrop-blur-xl transition hover:border-accent-300/45 hover:bg-background-card/40 active:scale-[0.995] sm:px-4"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent-300/40 bg-linear-to-br from-accent-500/70 to-energy-500/70 text-sm font-black text-gc shadow-xs backdrop-blur-sm">
                      {st.sort_order}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-[15px] font-black text-ink">
                        {st.title}
                        {st.is_foundation ? (
                          <span className="ms-2 rounded-full bg-primary-500/15 px-2 py-0.5 text-[10px] font-bold text-primary-800">
                            תחנת חובה
                          </span>
                        ) : null}
                      </span>
                      <span className="text-[11px] text-ink-faint">
                        {stepCount} צעדים
                        {st.coverImageUrl ? ' · תמונה' : ''}
                      </span>
                    </span>
                    <span className={cn(opsGlassBtnClass, 'pointer-events-none shrink-0 px-2.5 py-1.5 text-[11px]')}>
                      פתח
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : filteredOrphans.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-faint">
          {q ? 'לא נמצאו צעדים תואמים' : 'כל הצעדים משויכים לתחנות'}
        </p>
      ) : (
        <ul className="space-y-2">
          {filteredOrphans.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-gc/50 bg-background-card/28 px-3 py-2.5 backdrop-blur-xl sm:px-4"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary-300/35 bg-primary-500/10 text-xs font-black text-primary-800 backdrop-blur-sm">
                  {s.step_number}
                </span>
                <span className="truncate text-sm font-semibold text-ink">{s.title}</span>
              </span>
              <Link href={`${opsBase}/steps/${s.id}`} className={opsGlassBtnClass}>
                <Edit3 className="h-3.5 w-3.5" />
                עריכה
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* פופאפ תחנה */}
      {selected ? (
        <div
          dir="rtl"
          role="dialog"
          aria-modal="true"
          aria-label={`תחנה: ${selected.title}`}
          className="fixed inset-0 z-55 flex items-end justify-center p-0 sm:items-center sm:p-4"
        >
          <button
            type="button"
            aria-label="סגור"
            onClick={() => !busy && closeStation()}
            className="absolute inset-0 bg-accent-950/30 backdrop-blur-[5px]"
          />
          <div
            className="relative flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[1.75rem] shadow-[0_28px_80px_-16px_rgba(180,83,9,0.4)] ring-1 ring-gc/50 sm:rounded-[1.75rem]"
            style={glassPanelStyle}
          >
            <div className="pointer-events-none absolute -inset-e-12 -top-16 h-44 w-44 rounded-full bg-accent-400/25 blur-3xl" aria-hidden />
            <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent via-background-card/90 to-transparent" />

            <header className="relative shrink-0 border-b border-gc/40 bg-linear-to-bl from-accent-100/55 via-background-card/25 to-energy-100/40 px-4 pb-3 pt-4 sm:px-6">
              <button
                type="button"
                onClick={() => !busy && closeStation()}
                disabled={!!busy}
                className="absolute inset-e-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gc/55 bg-background-card/30 text-ink-soft backdrop-blur-md transition hover:bg-background-card/50 disabled:opacity-50 sm:inset-e-4 sm:top-4"
                aria-label="סגור"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-3 pe-10">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-accent-300/40 bg-linear-to-br from-accent-500 to-energy-600 text-lg font-black text-gc shadow-md ring-1 ring-gc/50">
                  {selected.sort_order}
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-accent-800/85">תחנה</p>
                  <h2 className="truncate bg-linear-to-l from-accent-800 via-energy-700 to-accent-700 bg-clip-text font-display text-xl font-black text-transparent">
                    {selected.title}
                  </h2>
                  <p className="text-xs text-ink-soft">
                    {stepsByStation(selected.id).length} צעדים
                    {selected.is_foundation ? ' · תחנת חובה' : ''}
                    {selected.coverImageUrl ? ' · יש תמונת רקע' : ''}
                  </p>
                </div>
              </div>

              <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-xl border border-primary-200/50 bg-primary-50/40 px-3 py-2 text-sm text-primary-900">
                <input
                  type="checkbox"
                  checked={selected.is_foundation === true}
                  disabled={busy === `foundation-${selected.id}`}
                  onChange={(e) => void toggleFoundation(selected.id, e.target.checked)}
                  className="h-4 w-4 rounded border-primary-400 text-primary-600"
                />
                <span>
                  <strong>תחנת חובה (Foundation)</strong> — כל המשתמשים עוברים כאן לפני שיעורים
                  מותאמים
                </span>
              </label>

              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <label className="flex flex-col gap-1 text-primary-900">
                  <span className="font-semibold">אייקון במפה (הרגל)</span>
                  <select
                    value={selected.habit_key ?? ''}
                    disabled={busy === `meta-${selected.id}`}
                    onChange={(e) => void patchStationMeta(selected.id, { habit_key: e.target.value || null })}
                    className="rounded-xl border border-primary-200 bg-gc px-2 py-1.5"
                  >
                    <option value="">אוטומטי (לפי שם התחנה)</option>
                    {Object.keys(HABIT_ICONS).map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-primary-900">
                  <span className="font-semibold">מסלול</span>
                  <input
                    defaultValue={selected.track ?? 'main'}
                    key={`track-${selected.id}`}
                    disabled={busy === `meta-${selected.id}`}
                    onBlur={(e) => {
                      const v = e.target.value.trim() || 'main';
                      if (v !== (selected.track ?? 'main')) void patchStationMeta(selected.id, { track: v });
                    }}
                    className="rounded-xl border border-primary-200 bg-gc px-2 py-1.5"
                    dir="ltr"
                  />
                </label>
              </div>

              <div className="mt-4 flex gap-1.5 rounded-2xl border border-gc/50 bg-background-card/30 p-1 backdrop-blur-md">
                {(
                  [
                    { key: 'steps' as const, label: 'צעדים', icon: Footprints },
                    { key: 'cover' as const, label: 'תמונת רקע', icon: ImageIcon },
                  ] as const
                ).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPopupTab(key)}
                    className={cn(
                      'flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-bold transition-all sm:text-sm',
                      popupTab === key
                        ? 'border border-accent-300/50 bg-accent-500/20 text-accent-900 shadow-xs backdrop-blur-md'
                        : 'border border-transparent text-ink-soft hover:bg-background-card/40',
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    {label}
                  </button>
                ))}
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
              {popupTab === 'steps' ? (
                <ul className="space-y-2">
                  {stepsByStation(selected.id).length === 0 ? (
                    <li className="rounded-2xl border border-dashed border-gc/55 bg-background-card/20 py-10 text-center text-sm text-ink-faint backdrop-blur-md">
                      אין צעדים בתחנה זו
                    </li>
                  ) : (
                    stepsByStation(selected.id).map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-gc/45 bg-background-card/25 px-3 py-2.5 backdrop-blur-md"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary-300/35 bg-primary-500/10 text-xs font-black text-primary-800">
                            {s.step_number}
                          </span>
                          <span className="truncate text-sm font-semibold text-ink">{s.title}</span>
                        </span>
                        <Link href={`${opsBase}/steps/${s.id}`} className={opsGlassBtnClass}>
                          <Edit3 className="h-3.5 w-3.5" />
                          עריכה
                        </Link>
                      </li>
                    ))
                  )}
                </ul>
              ) : (
                <AdminStationCoverPanel
                  embedded
                  stationId={selected.id}
                  stationTitle={selected.title}
                  initialCover={{
                    coverImageKey: selected.cover_image_key,
                    coverImageCredit: selected.cover_image_credit,
                    coverImageUrl: selected.coverImageUrl,
                  }}
                  onUpdated={(next) => {
                    setStations((prev) =>
                      prev.map((row) =>
                        row.id === selected.id
                          ? {
                              ...row,
                              cover_image_key: next.coverImageKey,
                              cover_image_credit: next.coverImageCredit,
                              coverImageUrl: next.coverImageUrl,
                            }
                          : row,
                      ),
                    );
                  }}
                />
              )}
            </div>

            <footer className="shrink-0 border-t border-gc/40 bg-background-card/20 px-4 py-3 backdrop-blur-md sm:px-6">
              <button
                type="button"
                onClick={() => void deleteStation(selected.id)}
                disabled={busy === selected.id}
                className={cn(opsGlassBtnDangerClass, 'w-full min-h-11 sm:w-auto')}
              >
                <Trash2 className="h-4 w-4" />
                מחק תחנה
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {/* פופאפ הוספת תחנה */}
      {showAddPopup ? (
        <div
          dir="rtl"
          role="dialog"
          aria-modal="true"
          aria-label="תחנה חדשה"
          className="fixed inset-0 z-56 flex items-end justify-center p-0 sm:items-center sm:p-4"
        >
          <button
            type="button"
            aria-label="סגור"
            onClick={() => !busy && setShowAddPopup(false)}
            className="absolute inset-0 bg-ink-900/35 backdrop-blur-[4px]"
          />
          <div
            className="relative w-full max-w-md overflow-hidden rounded-t-3xl p-5 shadow-[0_24px_60px_-12px_rgba(15,23,42,0.35)] ring-1 ring-gc/50 sm:rounded-3xl"
            style={glassPanelStyle}
          >
            <button
              type="button"
              onClick={() => !busy && setShowAddPopup(false)}
              className="absolute inset-e-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gc/55 bg-background-card/30 text-ink-soft backdrop-blur-md hover:bg-background-card/50"
              aria-label="סגור"
            >
              <X className="h-4 w-4" />
            </button>
            <h3 className="mb-4 ps-8 font-display text-lg font-black text-ink">תחנה חדשה</h3>
            <form onSubmit={addStation} className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-ink-soft">שם תחנה</span>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className={opsInputClass}
                  placeholder="למשל: יסודות שינה"
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-ink-soft">סדר</span>
                <input
                  type="number"
                  value={newSort}
                  onChange={(e) => setNewSort(Number(e.target.value))}
                  className={opsInputClass}
                  min={0}
                />
              </label>
              <button type="submit" disabled={busy === 'add' || !newTitle.trim()} className={cn(opsGlassBtnPrimaryClass, 'w-full min-h-11')}>
                <Layers className="h-4 w-4" />
                הוסף תחנה
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {/* פופאפ מצב סוכן — יצירת מסע שלם ב-AI */}
      {showAiPopup ? (
        <div
          dir="rtl"
          role="dialog"
          aria-modal="true"
          aria-label="צור מסע ב-AI"
          className="fixed inset-0 z-57 flex items-end justify-center p-0 sm:items-center sm:p-4"
        >
          <button
            type="button"
            aria-label="סגור"
            onClick={() => !aiBusy && setShowAiPopup(false)}
            className="absolute inset-0 bg-iris-950/35 backdrop-blur-[5px]"
          />
          <div
            className="relative w-full max-w-lg overflow-hidden rounded-t-3xl p-5 shadow-[0_24px_60px_-12px_rgba(79,70,229,0.4)] ring-1 ring-gc/50 sm:rounded-3xl"
            style={glassPanelStyle}
          >
            <button
              type="button"
              onClick={() => !aiBusy && setShowAiPopup(false)}
              className="absolute inset-e-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gc/55 bg-background-card/30 text-ink-soft backdrop-blur-md hover:bg-background-card/50"
              aria-label="סגור"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mb-1 flex items-center gap-2 ps-8">
              <Sparkles className="h-5 w-5 text-iris-500" />
              <h3 className="font-display text-lg font-black text-ink">מצב סוכן — צור מסע ב-AI</h3>
            </div>
            <p className="mb-4 ps-8 text-xs text-ink-soft">
              תארו את המסע הרצוי ואלמוג יבנה תחנות וצעדים כטיוטה (לא מפורסם). אחר כך אפשר ללטש כל צעד עם המילוי החכם.
            </p>

            {aiResult ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-primary-300/50 bg-primary-500/10 px-4 py-3 text-sm font-semibold text-primary-900">
                  ✦ נוצרו {aiResult.stations} תחנות ו-{aiResult.steps} צעדים כטיוטה. הם מופיעים ברשימה — לחצו על צעד כדי ללטש עם AI-fill.
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowAiPopup(false);
                    setAiPrompt('');
                    setAiResult(null);
                  }}
                  className={cn(opsGlassBtnPrimaryClass, 'w-full min-h-11')}
                >
                  סיום
                </button>
              </div>
            ) : (
              <form onSubmit={generateJourneyWithAi} className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-ink-soft">תיאור המסע</span>
                  <textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    className={cn(opsInputClass, 'min-h-28 resize-y')}
                    placeholder="למשל: מסע 30 יום לשיפור איכות השינה — מהבנת מחזורי שינה ועד בניית שגרת ערב יציבה, לקהל מתחילים."
                    autoFocus
                  />
                </label>
                <div className="flex gap-3">
                  <label className="flex-1">
                    <span className="mb-1 block text-xs font-bold text-ink-soft">מס׳ תחנות (אופציונלי)</span>
                    <input
                      type="number"
                      value={aiStations}
                      onChange={(e) => setAiStations(e.target.value === '' ? '' : Number(e.target.value))}
                      className={opsInputClass}
                      min={1}
                      max={12}
                      placeholder="אוטו"
                    />
                  </label>
                  <label className="flex-1">
                    <span className="mb-1 block text-xs font-bold text-ink-soft">צעדים לתחנה (אופציונלי)</span>
                    <input
                      type="number"
                      value={aiStepsPer}
                      onChange={(e) => setAiStepsPer(e.target.value === '' ? '' : Number(e.target.value))}
                      className={opsInputClass}
                      min={1}
                      max={12}
                      placeholder="אוטו"
                    />
                  </label>
                </div>
                {aiError ? (
                  <p className="rounded-xl border border-coral-300/50 bg-coral-500/10 px-3 py-2 text-xs font-semibold text-coral-800">
                    {aiError}
                  </p>
                ) : null}
                <button
                  type="submit"
                  disabled={aiBusy || aiPrompt.trim().length < 10}
                  className={cn(opsGlassBtnPrimaryClass, 'w-full min-h-11')}
                >
                  {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  {aiBusy ? 'אלמוג בונה את המסע…' : 'צור מסע'}
                </button>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
