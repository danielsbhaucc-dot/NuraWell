'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, Loader2, Moon, Pencil, Sun, UtensilsCrossed, X } from 'lucide-react';
import { classifyMealSlot, mealSlotLabel } from '../../lib/onboarding/meal-schedule';

export type ProfileRhythmInitial = {
  wake_up_time: string | null;
  sleep_time: string | null;
  meal_count: number;
  meal_times: string[];
};

export function ProfileRhythmCard({
  initial,
  onSaved,
}: {
  initial: ProfileRhythmInitial;
  onSaved?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [wakeUp, setWakeUp] = useState(initial.wake_up_time ?? '07:00');
  const [sleep, setSleep] = useState(initial.sleep_time ?? '22:30');
  const [mealCount, setMealCount] = useState(initial.meal_count);
  const [mealTimes, setMealTimes] = useState(
    initial.meal_times.length ? initial.meal_times : ['08:00', '13:00', '19:30']
  );

  const resetForm = () => {
    setWakeUp(initial.wake_up_time ?? '07:00');
    setSleep(initial.sleep_time ?? '22:30');
    setMealCount(initial.meal_count);
    setMealTimes(
      initial.meal_times.length ? initial.meal_times : ['08:00', '13:00', '19:30']
    );
  };

  const updateMealCount = (n: number) => {
    const next = Math.max(0, Math.min(4, n));
    setMealCount(next);
    setMealTimes((prev) => {
      const base = [...prev];
      while (base.length < next) base.push('12:00');
      return base.slice(0, next);
    });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/profile/rhythm', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wake_up_time: wakeUp,
          sleep_time: sleep,
          meal_count: mealCount,
          meal_times: mealTimes.slice(0, mealCount),
        }),
      });
      if (!res.ok) throw new Error('save_failed');
      setEditing(false);
      onSaved?.();
    } catch {
      setError('לא הצלחנו לשמור — נסה שוב.');
    } finally {
      setSaving(false);
    }
  };

  const mealsSummary =
    mealCount === 0
      ? 'ללא ארוחות עיקריות מוגדרות'
      : mealTimes
          .slice(0, mealCount)
          .map((t, i) => `ארוחה ${i + 1}: ${t}`)
          .join(' · ');

  return (
    <motion.div
      dir="rtl"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18 }}
      className="crystal-surface rounded-2xl overflow-hidden"
    >
      <div className="px-5 pt-4 pb-2 flex items-center justify-between gap-2">
        <h3 className="font-bold text-slate-900 flex items-center gap-2">
          <Clock className="w-4 h-4 text-emerald-600" />
          קצב היום שלי
        </h3>
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 px-2 py-1 rounded-lg hover:bg-emerald-50"
          >
            <Pencil className="w-3.5 h-3.5" />
            עריכה
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              resetForm();
              setEditing(false);
              setError(null);
            }}
            className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 px-2 py-1 rounded-lg hover:bg-slate-50"
          >
            <X className="w-3.5 h-3.5" />
            ביטול
          </button>
        )}
      </div>
      <div className="crystal-divider mx-5" />

      {!editing ? (
        <div className="px-5 py-3 space-y-2.5 text-sm">
          <p className="text-slate-600">
            <Sun className="w-3.5 h-3.5 inline ml-1 text-amber-500" />
            השכמה {wakeUp} · שינה {sleep}
          </p>
          <p className="text-slate-600 leading-relaxed">
            <UtensilsCrossed className="w-3.5 h-3.5 inline ml-1 text-emerald-600" />
            {mealsSummary}
          </p>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            ארוחות עיקריות וגדולות — משימות במסע מסתנכרנות לפי הזמנים האלה.
          </p>
        </div>
      ) : (
        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            הגדר/י את <strong>ארוחות העיקריות והגדולות</strong> שלך — לא נשנושים קטנים.
            המשימות במסע יתאימו את עצמן לזמנים האלה.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-right">
              <span className="text-xs font-bold text-slate-700">שעת השכמה</span>
              <input
                type="time"
                value={wakeUp}
                onChange={(e) => setWakeUp(e.target.value)}
                className="mt-1 w-full rounded-xl border border-emerald-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-right">
              <span className="text-xs font-bold text-slate-700">שעת שינה</span>
              <input
                type="time"
                value={sleep}
                onChange={(e) => setSleep(e.target.value)}
                className="mt-1 w-full rounded-xl border border-emerald-200 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div>
            <span className="text-xs font-bold text-slate-700">כמה ארוחות עיקריות ביום?</span>
            <div className="flex gap-2 mt-2 flex-wrap">
              {[0, 1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => updateMealCount(n)}
                  className="rounded-full px-3 py-1 text-xs font-bold"
                  style={{
                    background: mealCount === n ? '#10b981' : '#ecfdf5',
                    color: mealCount === n ? '#fff' : '#065f46',
                    border: '1px solid rgba(16,185,129,0.35)',
                  }}
                >
                  {n === 0 ? 'בלי' : n}
                </button>
              ))}
            </div>
          </div>

          {mealCount > 0 ? (
            <div className="space-y-2">
              {mealTimes.slice(0, mealCount).map((t, i) => {
                const slot = t ? classifyMealSlot(t) : null;
                return (
                  <label key={i} className="block text-right">
                    <span className="text-xs font-bold text-slate-700">
                      ארוחה עיקרית {i + 1}
                      {slot ? (
                        <span className="font-normal text-slate-500 mr-1">· {mealSlotLabel(slot)}</span>
                      ) : null}
                    </span>
                    <input
                      type="time"
                      value={t}
                      onChange={(e) => {
                        const next = [...mealTimes];
                        next[i] = e.target.value;
                        setMealTimes(next);
                      }}
                      className="mt-1 w-full rounded-xl border border-emerald-200 px-3 py-2 text-sm"
                    />
                  </label>
                );
              })}
            </div>
          ) : null}

          {error ? <p className="text-xs text-red-600 font-semibold">{error}</p> : null}

          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-black text-white disabled:opacity-60"
            style={{ background: 'linear-gradient(145deg, #047857, #10b981)' }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Moon className="w-4 h-4" />}
            שמור
          </button>
        </div>
      )}
    </motion.div>
  );
}
