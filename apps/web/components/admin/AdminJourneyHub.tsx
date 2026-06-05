'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Edit3,
  Footprints,
  ImageIcon,
  Layers,
  Map,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { JourneyStep } from '@/lib/types/journey';
import type { StationCoverCredit } from '@/lib/journey/group-journey-by-station';
import { AdminStationCoverPanel } from '@/components/admin/AdminStationCoverPanel';
import { OpsPageHeader } from '@/components/admin/OpsPageHeader';
import {
  opsGlassBtnClass,
  opsGlassBtnDangerClass,
  opsGlassBtnPrimaryClass,
  opsInputClass,
} from '@/components/admin/OpsPanel';
import { glassPanelStyle } from '@/components/media-manager/glass-styles';
import { cn } from '@/lib/cn';

type StationRow = {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
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
    if (!confirm('למחוק תחנה? צעדים משויכים יישארו ללא תחנה.')) return;
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
  }

  return (
    <div className="space-y-4">
      <OpsPageHeader
        icon={Map}
        eyebrow="ניהול מסע"
        title="מסע ותחנות"
        tone="amber"
        description="חיפוש, לחיצה על תחנה לפופאפ עם טאבים — צעדים ותמונת רקע."
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setShowAddPopup(true)} className={opsGlassBtnClass}>
              <Layers className="h-4 w-4" />
              תחנה חדשה
            </button>
            <Link href={`${opsBase}/steps/new`} className={opsGlassBtnPrimaryClass}>
              <Plus className="h-4 w-4" />
              צעד חדש
            </Link>
          </div>
        }
      />

      {/* חיפוש + טאבי תצוגה */}
      <section className="overflow-hidden rounded-2xl border border-white/50 bg-white/30 shadow-[0_8px_28px_rgba(15,23,42,0.06)] backdrop-blur-xl">
        <div className="border-b border-white/40 p-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
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
                  ? 'border border-amber-300/50 bg-amber-500/15 text-amber-900 shadow-sm backdrop-blur-md'
                  : 'border border-transparent text-slate-600 hover:border-white/50 hover:bg-white/35',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
              <span className="rounded-full bg-white/40 px-1.5 py-0.5 text-[10px] tabular-nums">{count}</span>
            </button>
          ))}
        </div>
      </section>

      {/* רשימה */}
      {viewTab === 'stations' ? (
        filteredStations.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">
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
                    className="flex w-full items-center gap-3 rounded-2xl border border-white/50 bg-white/28 px-3 py-3 text-right shadow-sm backdrop-blur-xl transition hover:border-amber-300/45 hover:bg-white/40 active:scale-[0.995] sm:px-4"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/40 bg-gradient-to-br from-amber-500/70 to-orange-500/70 text-sm font-black text-white shadow-sm backdrop-blur-sm">
                      {st.sort_order}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-[15px] font-black text-slate-900">
                        {st.title}
                      </span>
                      <span className="text-[11px] text-slate-500">
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
        <p className="py-10 text-center text-sm text-slate-500">
          {q ? 'לא נמצאו צעדים תואמים' : 'כל הצעדים משויכים לתחנות'}
        </p>
      ) : (
        <ul className="space-y-2">
          {filteredOrphans.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-white/50 bg-white/28 px-3 py-2.5 backdrop-blur-xl sm:px-4"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-300/35 bg-emerald-500/10 text-xs font-black text-emerald-800 backdrop-blur-sm">
                  {s.step_number}
                </span>
                <span className="truncate text-sm font-semibold text-slate-800">{s.title}</span>
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
          className="fixed inset-0 z-[55] flex items-end justify-center p-0 sm:items-center sm:p-4"
        >
          <button
            type="button"
            aria-label="סגור"
            onClick={() => !busy && closeStation()}
            className="absolute inset-0 bg-amber-950/30 backdrop-blur-[5px]"
          />
          <div
            className="relative flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[1.75rem] shadow-[0_28px_80px_-16px_rgba(180,83,9,0.4)] ring-1 ring-white/50 sm:rounded-[1.75rem]"
            style={glassPanelStyle}
          >
            <div className="pointer-events-none absolute -left-12 -top-16 h-44 w-44 rounded-full bg-amber-400/25 blur-3xl" aria-hidden />
            <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent" />

            <header className="relative shrink-0 border-b border-white/40 bg-gradient-to-bl from-amber-100/55 via-white/25 to-orange-100/40 px-4 pb-3 pt-4 sm:px-6">
              <button
                type="button"
                onClick={() => !busy && closeStation()}
                disabled={!!busy}
                className="absolute left-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/55 bg-white/30 text-slate-600 backdrop-blur-md transition hover:bg-white/50 disabled:opacity-50 sm:left-4 sm:top-4"
                aria-label="סגור"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-3 pl-10">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-300/40 bg-gradient-to-br from-amber-500 to-orange-600 text-lg font-black text-white shadow-md ring-1 ring-white/50">
                  {selected.sort_order}
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800/85">תחנה</p>
                  <h2 className="truncate bg-gradient-to-l from-amber-800 via-orange-700 to-amber-700 bg-clip-text font-display text-xl font-black text-transparent">
                    {selected.title}
                  </h2>
                  <p className="text-xs text-slate-600">
                    {stepsByStation(selected.id).length} צעדים
                    {selected.coverImageUrl ? ' · יש תמונת רקע' : ''}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex gap-1.5 rounded-2xl border border-white/50 bg-white/30 p-1 backdrop-blur-md">
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
                        ? 'border border-amber-300/50 bg-amber-500/20 text-amber-900 shadow-sm backdrop-blur-md'
                        : 'border border-transparent text-slate-600 hover:bg-white/40',
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
                    <li className="rounded-2xl border border-dashed border-white/55 bg-white/20 py-10 text-center text-sm text-slate-500 backdrop-blur-md">
                      אין צעדים בתחנה זו
                    </li>
                  ) : (
                    stepsByStation(selected.id).map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-white/45 bg-white/25 px-3 py-2.5 backdrop-blur-md"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-300/35 bg-emerald-500/10 text-xs font-black text-emerald-800">
                            {s.step_number}
                          </span>
                          <span className="truncate text-sm font-semibold text-slate-800">{s.title}</span>
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

            <footer className="shrink-0 border-t border-white/40 bg-white/20 px-4 py-3 backdrop-blur-md sm:px-6">
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
          className="fixed inset-0 z-[56] flex items-end justify-center p-0 sm:items-center sm:p-4"
        >
          <button
            type="button"
            aria-label="סגור"
            onClick={() => !busy && setShowAddPopup(false)}
            className="absolute inset-0 bg-slate-900/35 backdrop-blur-[4px]"
          />
          <div
            className="relative w-full max-w-md overflow-hidden rounded-t-3xl p-5 shadow-[0_24px_60px_-12px_rgba(15,23,42,0.35)] ring-1 ring-white/50 sm:rounded-3xl"
            style={glassPanelStyle}
          >
            <button
              type="button"
              onClick={() => !busy && setShowAddPopup(false)}
              className="absolute left-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/55 bg-white/30 text-slate-600 backdrop-blur-md hover:bg-white/50"
              aria-label="סגור"
            >
              <X className="h-4 w-4" />
            </button>
            <h3 className="mb-4 pr-8 font-display text-lg font-black text-slate-900">תחנה חדשה</h3>
            <form onSubmit={addStation} className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-700">שם תחנה</span>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className={opsInputClass}
                  placeholder="למשל: יסודות שינה"
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-700">סדר</span>
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
    </div>
  );
}
