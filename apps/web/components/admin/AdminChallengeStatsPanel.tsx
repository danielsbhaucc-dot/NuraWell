'use client';

import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Loader2, Users } from 'lucide-react';

type Stats = {
  enrollments: number;
  waiting: number;
  active: number;
  completed: number;
  dropped: number;
  success_events: number;
  task_completions: number;
  completion_rate_pct: number;
};

export function AdminChallengeStatsPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/challenge/stats', { credentials: 'include' });
      const data = await res.json();
      setStats(data.totals ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  if (!stats) return null;

  const cards = [
    { label: 'הרשמות', value: stats.enrollments, icon: Users, color: 'text-violet-600' },
    { label: 'פעילים', value: stats.active, icon: BarChart3, color: 'text-emerald-600' },
    { label: 'המתנה', value: stats.waiting, icon: Users, color: 'text-amber-600' },
    { label: 'סיימו', value: stats.completed, icon: BarChart3, color: 'text-sky-600' },
  ];

  return (
    <div className="rounded-3xl border border-slate-200/60 bg-white/70 p-5 shadow-sm backdrop-blur-md sm:p-6">
      <h2 className="mb-4 text-lg font-bold text-slate-900">אנליטיקס אתגר</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
            <Icon className={`mb-2 h-5 w-5 ${color}`} />
            <div className="font-display text-2xl font-black text-slate-900">{value}</div>
            <div className="text-xs text-slate-500">{label}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-xl bg-emerald-50 px-4 py-3">
          <span className="text-slate-500">אחוז סיום</span>
          <div className="font-bold text-emerald-800">{stats.completion_rate_pct}%</div>
        </div>
        <div className="rounded-xl bg-violet-50 px-4 py-3">
          <span className="text-slate-500">הצלחות</span>
          <div className="font-bold text-violet-800">{stats.success_events}</div>
        </div>
        <div className="rounded-xl bg-sky-50 px-4 py-3">
          <span className="text-slate-500">סימוני משימות</span>
          <div className="font-bold text-sky-800">{stats.task_completions}</div>
        </div>
      </div>
    </div>
  );
}
