'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Edit3, GripVertical, Layers, Map, Plus, Trash2 } from 'lucide-react';
import type { JourneyStep } from '@/lib/types/journey';
import type { StationCoverCredit } from '@/lib/journey/group-journey-by-station';
import { AdminStationCoverPanel } from '@/components/admin/AdminStationCoverPanel';
import { OpsPageHeader } from '@/components/admin/OpsPageHeader';

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
          (a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, 'he')
        )
      );
      setNewTitle('');
      setNewSort(0);
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
      router.refresh();
    }
    setBusy(null);
  }

  const stepsByStation = (sid: string | null) =>
    steps.filter((s) => (sid ? s.station_id === sid : !s.station_id));

  return (
    <div className="space-y-6">
      <OpsPageHeader
        icon={Map}
        eyebrow="ניהול מסע"
        title="מסע ותחנות"
        tone="amber"
        description="תחנה = קיבוץ לוגי של צעדים. אין הגבלה על מספר תחנות או צעדים לתחנה."
        actions={
          <Link
            href={`${opsBase}/steps/new`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-emerald-600 to-teal-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/25 transition hover:brightness-110"
          >
            <Plus className="h-4 w-4" />
            צעד חדש
          </Link>
        }
      />

      <div className="rounded-3xl border border-white/50 bg-white/40 p-4 shadow-[0_12px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-6">
        <form onSubmit={addStation} className="flex flex-col gap-3 rounded-2xl border border-emerald-200/60 bg-emerald-50/30 p-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs font-bold text-emerald-900">שם תחנה חדשה</label>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full rounded-xl border border-white/80 bg-white/90 px-4 py-2.5 text-slate-900 shadow-inner outline-none focus:ring-2 focus:ring-emerald-400/50"
              placeholder="למשל: יסודות שינה"
            />
          </div>
          <div className="w-full sm:w-28">
            <label className="mb-1 block text-xs font-bold text-emerald-900">סדר</label>
            <input
              type="number"
              value={newSort}
              onChange={(e) => setNewSort(Number(e.target.value))}
              className="w-full rounded-xl border border-white/80 bg-white/90 px-4 py-2.5 text-slate-900 outline-none focus:ring-2 focus:ring-emerald-400/50"
              min={0}
            />
          </div>
          <button
            type="submit"
            disabled={busy === 'add'}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-emerald-700 disabled:opacity-50"
          >
            <Layers className="h-4 w-4" />
            הוסף תחנה
          </button>
        </form>
      </div>

      <div className="space-y-7">
        {stations.map((st, idx) => (
          <motion.section
            key={st.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.04 }}
            className="overflow-hidden rounded-3xl border border-white/45 bg-white/45 shadow-[0_10px_36px_rgba(99,102,241,0.1)] backdrop-blur-xl"
          >
            <div className="flex flex-col gap-3 border-b border-white/50 bg-gradient-to-l from-violet-500/10 to-emerald-500/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/70 text-sm font-black text-violet-800 shadow-sm">
                  {st.sort_order}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-black text-slate-900">{st.title}</h2>
                  {st.description ? (
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{st.description}</p>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => deleteStation(st.id)}
                  disabled={busy === st.id}
                  className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-red-200/80 bg-red-50/80 px-3 py-2 text-xs font-bold text-red-800 transition hover:bg-red-100 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  מחק
                </button>
              </div>
            </div>
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
                      : row
                  )
                );
              }}
            />
            <ul className="mt-1 divide-y divide-white/40 border-t border-white/35">
              {stepsByStation(st.id).length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-slate-500 sm:px-5">אין צעדים בתחנה זו</li>
              ) : (
                stepsByStation(st.id).map((s) => (
                  <li key={s.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <GripVertical className="hidden h-4 w-4 shrink-0 text-slate-300 sm:block" aria-hidden />
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-sm font-black text-emerald-800">
                        {s.step_number}
                      </span>
                      <span className="min-w-0 truncate font-semibold text-slate-800">{s.title}</span>
                    </div>
                    <Link
                      href={`${opsBase}/steps/${s.id}`}
                      className="inline-flex min-h-10 items-center justify-center gap-1 self-end rounded-xl border border-slate-200/80 bg-white/70 px-4 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-white sm:self-center"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      עריכה
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </motion.section>
        ))}

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-dashed border-slate-300/80 bg-slate-50/50 p-5 backdrop-blur-md"
        >
          <h2 className="text-base font-black text-slate-700">צעדים ללא תחנה</h2>
          <ul className="mt-3 space-y-2">
            {stepsByStation(null).length === 0 ? (
              <li className="text-sm text-slate-500">הכל משויך לתחנות</li>
            ) : (
              stepsByStation(null).map((s) => (
                <li
                  key={s.id}
                  className="flex flex-col gap-2 rounded-2xl border border-white/50 bg-white/60 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="font-medium text-slate-800">
                    <span className="font-black text-emerald-700">{s.step_number}.</span> {s.title}
                  </span>
                  <Link
                    href={`${opsBase}/steps/${s.id}`}
                    className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-slate-800/90 px-3 py-1.5 text-xs font-bold text-white"
                  >
                    עריכה
                  </Link>
                </li>
              ))
            )}
          </ul>
        </motion.section>
      </div>
    </div>
  );
}
