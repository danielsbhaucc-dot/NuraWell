'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, Edit3, Layers, Map, Plus, Trash2 } from 'lucide-react';
import type { JourneyStep } from '@/lib/types/journey';
import type { StationCoverCredit } from '@/lib/journey/group-journey-by-station';
import { AdminStationCoverPanel } from '@/components/admin/AdminStationCoverPanel';
import { OpsPageHeader } from '@/components/admin/OpsPageHeader';
import {
  opsGlassBtnClass,
  opsGlassBtnDangerClass,
  opsGlassBtnPrimaryClass,
  opsGlassCardClass,
  opsInputClass,
} from '@/components/admin/OpsPanel';
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
  const [newTitle, setNewTitle] = useState('');
  const [newSort, setNewSort] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [orphansOpen, setOrphansOpen] = useState(false);

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
      setShowAddForm(false);
      setExpandedId(row.id);
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
      if (expandedId === id) setExpandedId(null);
      router.refresh();
    }
    setBusy(null);
  }

  const stepsByStation = (sid: string | null) =>
    steps.filter((s) => (sid ? s.station_id === sid : !s.station_id));

  const orphanSteps = stepsByStation(null);

  return (
    <div className="space-y-5">
      <OpsPageHeader
        icon={Map}
        eyebrow="ניהול מסע"
        title="מסע ותחנות"
        tone="amber"
        description="לחצו על תחנה לפתיחה. צעדים, תמונת רקע ועריכה — בתוך הכרטיס."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm((v) => !v)}
              className={opsGlassBtnClass}
            >
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

      {showAddForm ? (
        <div className={opsGlassCardClass}>
          <form onSubmit={addStation} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-xs font-bold text-slate-700">שם תחנה</label>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className={opsInputClass}
                placeholder="למשל: יסודות שינה"
              />
            </div>
            <div className="w-full sm:w-24">
              <label className="mb-1 block text-xs font-bold text-slate-700">סדר</label>
              <input
                type="number"
                value={newSort}
                onChange={(e) => setNewSort(Number(e.target.value))}
                className={opsInputClass}
                min={0}
              />
            </div>
            <button type="submit" disabled={busy === 'add'} className={opsGlassBtnPrimaryClass}>
              <Layers className="h-4 w-4" />
              הוסף
            </button>
          </form>
        </div>
      ) : null}

      <div className="space-y-3">
        {stations.map((st) => {
          const open = expandedId === st.id;
          const stepCount = stepsByStation(st.id).length;
          return (
            <section
              key={st.id}
              className="overflow-hidden rounded-2xl border border-white/50 bg-white/35 shadow-[0_8px_28px_rgba(15,23,42,0.08)] backdrop-blur-xl"
            >
              <div className="flex items-center gap-2 px-3 py-3 sm:px-4">
                <button
                  type="button"
                  onClick={() => setExpandedId(open ? null : st.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-right"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/80 to-orange-500/80 text-sm font-black text-white shadow-sm ring-1 ring-white/40">
                    {st.sort_order}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-base font-black text-slate-900">
                      {st.title}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {stepCount} צעדים
                      {st.coverImageUrl ? ' · יש תמונה' : ''}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn('h-5 w-5 shrink-0 text-slate-400 transition-transform', open && '-rotate-180')}
                    aria-hidden
                  />
                </button>
                <button
                  type="button"
                  onClick={() => void deleteStation(st.id)}
                  disabled={busy === st.id}
                  className={cn(opsGlassBtnDangerClass, 'min-h-9 shrink-0')}
                  aria-label="מחק תחנה"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {open ? (
                <div className="border-t border-white/40">
                  <AdminStationCoverPanel
                    stationId={st.id}
                    stationTitle={st.title}
                    initialCover={{
                      coverImageKey: st.cover_image_key,
                      coverImageCredit: st.cover_image_credit,
                      coverImageUrl: st.coverImageUrl,
                    }}
                    onUpdated={(next) => {
                      setStations((prev) =>
                        prev.map((row) =>
                          row.id === st.id
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
                  <ul className="divide-y divide-white/35">
                    {stepCount === 0 ? (
                      <li className="px-4 py-5 text-center text-sm text-slate-500">אין צעדים בתחנה זו</li>
                    ) : (
                      stepsByStation(st.id).map((s) => (
                        <li
                          key={s.id}
                          className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-300/40 bg-emerald-500/10 text-xs font-black text-emerald-800 backdrop-blur-sm">
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
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      {orphanSteps.length > 0 ? (
        <section className="overflow-hidden rounded-2xl border border-dashed border-white/55 bg-white/25 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => setOrphansOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-right"
          >
            <span>
              <span className="block text-sm font-black text-slate-800">צעדים ללא תחנה</span>
              <span className="text-[11px] text-slate-500">{orphanSteps.length} צעדים</span>
            </span>
            <ChevronDown
              className={cn('h-5 w-5 shrink-0 text-slate-400 transition-transform', orphansOpen && '-rotate-180')}
            />
          </button>
          {orphansOpen ? (
            <ul className="space-y-1.5 border-t border-white/35 px-3 pb-3 pt-2">
              {orphanSteps.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/45 bg-white/30 px-3 py-2 backdrop-blur-md"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-emerald-300/40 bg-emerald-500/10 text-xs font-black text-emerald-800">
                      {s.step_number}
                    </span>
                    <span className="truncate text-sm font-medium text-slate-800">{s.title}</span>
                  </span>
                  <Link href={`${opsBase}/steps/${s.id}`} className={opsGlassBtnClass}>
                    <Edit3 className="h-3.5 w-3.5" />
                    עריכה
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
