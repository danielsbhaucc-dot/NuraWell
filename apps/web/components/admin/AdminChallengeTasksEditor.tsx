'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Save, Trash2 } from 'lucide-react';

type TaskRow = {
  id: string;
  task_key: string;
  day_index: number;
  sort_order: number;
  title_he: string;
  description_he: string | null;
  schedule_type: string;
  icon: string | null;
  is_active: boolean;
};

export function AdminChallengeTasksEditor() {
  const [dayIndex, setDayIndex] = useState(1);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/challenge/tasks?day_index=${dayIndex}`, {
        credentials: 'include',
      });
      const data = await res.json();
      setTasks(data.tasks ?? []);
      setCampaignId(data.campaign_id ?? null);
    } finally {
      setLoading(false);
    }
  }, [dayIndex]);

  useEffect(() => {
    load();
  }, [load]);

  const saveTask = async (task: TaskRow) => {
    setSaving(task.id);
    try {
      await fetch(`/api/v1/admin/challenge/tasks/${task.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title_he: task.title_he,
          description_he: task.description_he,
          schedule_type: task.schedule_type,
          icon: task.icon,
          sort_order: task.sort_order,
        }),
      });
    } finally {
      setSaving(null);
    }
  };

  const deleteTask = async (id: string) => {
    await fetch(`/api/v1/admin/challenge/tasks/${id}`, { method: 'DELETE', credentials: 'include' });
    await load();
  };

  const addTask = async () => {
    if (!campaignId) return;
    await fetch('/api/v1/admin/challenge/tasks', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaign_id: campaignId,
        task_key: `custom_${Date.now()}`,
        day_index: dayIndex,
        sort_order: tasks.length + 1,
        title_he: 'משימה חדשה',
        description_he: '',
        schedule_type: 'daily',
        icon: 'circle',
      }),
    });
    await load();
  };

  const updateLocal = (id: string, patch: Partial<TaskRow>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  return (
    <div className="rounded-3xl border border-slate-200/60 bg-white/70 p-5 shadow-sm backdrop-blur-md sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold text-slate-900">משימות לפי יום</h2>
        <label className="mr-auto flex items-center gap-2 text-sm">
          <span className="text-slate-500">יום</span>
          <select
            value={dayIndex}
            onChange={(e) => setDayIndex(Number(e.target.value))}
            className="rounded-xl border border-slate-200 px-3 py-1.5"
          >
            {Array.from({ length: 14 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={addTask}
          className="inline-flex items-center gap-1 rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          הוסף
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <div key={task.id} className="rounded-2xl border border-slate-200/80 bg-white p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={task.title_he}
                  onChange={(e) => updateLocal(task.id, { title_he: e.target.value })}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
                  placeholder="כותרת"
                />
                <select
                  value={task.schedule_type}
                  onChange={(e) => updateLocal(task.id, { schedule_type: e.target.value })}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="daily">יומי</option>
                  <option value="per_meal">לכל ארוחה</option>
                  <option value="morning">בוקר</option>
                  <option value="evening">ערב</option>
                  <option value="once">פעם אחת</option>
                </select>
              </div>
              <textarea
                value={task.description_he ?? ''}
                onChange={(e) => updateLocal(task.id, { description_he: e.target.value })}
                rows={2}
                className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                placeholder="תיאור"
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={saving === task.id}
                  onClick={() => saveTask(task)}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  {saving === task.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  שמור
                </button>
                <button
                  type="button"
                  onClick={() => deleteTask(task.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  מחק
                </button>
              </div>
            </div>
          ))}
          {!tasks.length ? (
            <p className="py-6 text-center text-sm text-slate-500">אין משימות ליום {dayIndex}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
