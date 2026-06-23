'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ChevronRight, Clock, Loader2, Moon, Sun, UtensilsCrossed } from 'lucide-react';
import type { DailyRhythm } from '../../lib/journey/daily-rhythm';

type RhythmResponse = {
  wake_up_time: string | null;
  sleep_time: string | null;
  meal_count: number;
  meal_times: string[];
  daily_rhythm: DailyRhythm;
  defaults: DailyRhythm;
};

type Props = {
  firstName: string;
};

function TimeField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-right">
      <span className="text-xs font-bold text-emerald-950">{label}</span>
      {hint ? <span className="block text-[10px] text-emerald-900/60 mt-0.5">{hint}</span> : null}
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm font-semibold text-emerald-950 text-right"
        style={{
          borderColor: 'rgba(167,243,208,0.55)',
          background: 'rgba(255,255,255,0.72)',
        }}
      />
    </label>
  );
}

export function ScheduleSettingsClient({ firstName }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [wakeUp, setWakeUp] = useState('07:00');
  const [sleep, setSleep] = useState('22:30');
  const [mealCount, setMealCount] = useState(3);
  const [mealTimes, setMealTimes] = useState(['08:00', '13:00', '19:30']);
  const [morning, setMorning] = useState('07:30');
  const [noon, setNoon] = useState('13:00');
  const [evening, setEvening] = useState('19:30');

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/v1/profile/daily-rhythm', { cache: 'no-store' });
        const json = (await res.json()) as RhythmResponse & { error?: string };
        if (!res.ok) throw new Error(json.error ?? 'load_failed');
        setWakeUp(json.wake_up_time ?? '07:00');
        setSleep(json.sleep_time ?? '22:30');
        setMealCount(json.meal_count || json.meal_times.length || 3);
        setMealTimes(
          json.meal_times.length
            ? json.meal_times
            : ['08:00', '13:00', '19:30'].slice(0, json.meal_count || 3)
        );
        setMorning(json.daily_rhythm.morning ?? json.defaults.morning ?? '07:30');
        setNoon(json.daily_rhythm.noon ?? json.defaults.noon ?? '13:00');
        setEvening(json.daily_rhythm.evening ?? json.defaults.evening ?? '19:30');
      } catch {
        setError('לא הצלחנו לטעון את לוח הזמנים.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const updateMealCount = (n: number) => {
    const next = Math.max(0, Math.min(4, n));
    setMealCount(next);
    setMealTimes((prev) => {
      const base = [...prev];
      while (base.length < next) base.push('12:00');
      return base.slice(0, next);
    });
  };

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/profile/daily-rhythm', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wake_up_time: wakeUp,
          sleep_time: sleep,
          meal_count: mealCount,
          meal_times: mealTimes.slice(0, mealCount),
          daily_rhythm: { morning, noon, evening },
        }),
      });
      if (!res.ok) throw new Error('save_failed');
      setSavedAt(Date.now());
      router.refresh();
    } catch {
      setError('לא הצלחנו לשמור — נסה שוב.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-emerald-800">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container-mobile py-6 pt-6 md:pt-16 pb-12 space-y-4">
      <div className="flex items-center gap-2 text-sm text-emerald-800/70">
        <Link href="/profile" className="inline-flex items-center gap-1 hover:text-emerald-900">
          <ChevronRight className="h-4 w-4" />
          חזרה לפרופיל
        </Link>
      </div>

      <motion.div
        dir="rtl"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[24px] p-5"
        style={{
          background:
            'linear-gradient(165deg, rgba(255,255,255,0.72) 0%, rgba(236,253,245,0.55) 100%)',
          border: '1px solid rgba(255,255,255,0.75)',
          boxShadow: '0 16px 48px rgba(6,78,59,0.1), inset 0 1px 0 rgba(255,255,255,0.95)',
        }}
      >
        <div className="flex items-start gap-3 mb-4">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
            style={{ background: 'linear-gradient(145deg, #047857, #10b981)' }}
          >
            <Clock className="h-5 w-5" />
          </div>
          <div className="text-right flex-1">
            <h1
              className="text-xl font-black text-emerald-950"
              style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
            >
              לוח הזמנים שלי
            </h1>
            <p className="text-xs text-emerald-900/75 mt-1 leading-relaxed">
              {firstName}, כאן מגדירים מתי בוקר, צהריים וערב אצלך — והמערכת תדע להציע את
              המשימה הנכונה בזמן הנכון.
            </p>
          </div>
        </div>

        <section className="space-y-3 mb-5">
          <div className="flex items-center gap-2 text-emerald-900">
            <Sun className="h-4 w-4" />
            <h2 className="text-sm font-black">יום ולילה</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TimeField label="השכמה" value={wakeUp} onChange={setWakeUp} />
            <TimeField label="שינה" value={sleep} onChange={setSleep} />
          </div>
        </section>

        <section className="space-y-3 mb-5">
          <div className="flex items-center gap-2 text-emerald-900">
            <UtensilsCrossed className="h-4 w-4" />
            <h2 className="text-sm font-black">ארוחות</h2>
          </div>
          <div className="flex gap-2 flex-wrap">
            {[0, 1, 2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => updateMealCount(n)}
                className="rounded-full px-3 py-1.5 text-xs font-bold transition"
                style={{
                  background: mealCount === n ? 'rgba(16,185,129,0.85)' : 'rgba(255,255,255,0.6)',
                  color: mealCount === n ? '#fff' : '#065f46',
                  border: '1px solid rgba(167,243,208,0.5)',
                }}
              >
                {n === 0 ? 'בלי' : n}
              </button>
            ))}
          </div>
          {mealCount > 0 ? (
            <div className="grid grid-cols-1 gap-2">
              {mealTimes.slice(0, mealCount).map((t, i) => (
                <TimeField
                  key={i}
                  label={`ארוחה ${i + 1}`}
                  value={t}
                  onChange={(v) => {
                    const next = [...mealTimes];
                    next[i] = v;
                    setMealTimes(next);
                  }}
                />
              ))}
            </div>
          ) : null}
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2 text-emerald-900">
            <Moon className="h-4 w-4" />
            <h2 className="text-sm font-black">סלוטי משימות ביום</h2>
          </div>
          <p className="text-[10px] text-emerald-900/65 leading-relaxed">
            משימות יומיות / מספר פעמים ביום / לפני-בזמן-אחרי ארוחה — יתאימו לזמנים האלה.
          </p>
          <div className="grid grid-cols-1 gap-2">
            <TimeField
              label="בוקר"
              hint="משימות בוקר, לפני ארוחת בוקר"
              value={morning}
              onChange={setMorning}
            />
            <TimeField
              label="צהריים"
              hint="משימות צהריים, ארוחת צהריים"
              value={noon}
              onChange={setNoon}
            />
            <TimeField
              label="ערב"
              hint="משימות ערב, ארוחת ערב"
              value={evening}
              onChange={setEvening}
            />
          </div>
        </section>
      </motion.div>

      {error ? <p className="text-sm text-red-700 text-center font-semibold">{error}</p> : null}
      {savedAt ? (
        <p className="text-xs text-emerald-700 text-center font-semibold">נשמר ✦</p>
      ) : null}

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-black text-white disabled:opacity-60"
        style={{
          background: 'linear-gradient(145deg, #047857, #10b981)',
          boxShadow: '0 10px 28px rgba(4,120,87,0.25)',
        }}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        שמור לוח זמנים
      </button>
    </div>
  );
}
