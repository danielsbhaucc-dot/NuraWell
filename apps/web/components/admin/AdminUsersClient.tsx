'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Search, UserCircle, Save } from 'lucide-react';

type UserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  email_confirmed: boolean;
  onboarding_completed: boolean | null;
  role: string | null;
  created_at: string | null;
};

type UserDetail = {
  profile: Record<string, unknown>;
  auth: { email: string | null; email_confirmed_at: string | null };
  stats: {
    journey_steps_tracked: number;
    journey_steps_completed: number;
    tasks_accepted: number;
    habits_tracked: number;
  };
};

export function AdminUsersClient() {
  const [q, setQ] = useState('');
  const [list, setList] = useState<UserRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [form, setForm] = useState({
    full_name: '',
    gender: '',
    main_goal: '',
    current_weight_kg: '',
    goal_weight_kg: '',
    height_cm: '',
    weakest_time_of_day: '',
    main_obstacle: '',
    main_obstacle_detail: '',
    wake_up_time: '',
    sleep_time: '',
    meal_count: '',
  });

  const loadList = useCallback(async (search: string) => {
    setListLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      const res = await fetch(`/api/v1/admin/users?${params}`, { cache: 'no-store' });
      const data = (await res.json()) as { users?: UserRow[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'שגיאה');
      setList(data.users ?? []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'שגיאת רשימה');
      setList([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (userId: string) => {
    setDetailLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}`, { cache: 'no-store' });
      const data = (await res.json()) as UserDetail & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'שגיאה');
      setDetail(data);
      const p = data.profile;
      setForm({
        full_name: String(p.full_name ?? ''),
        gender: String(p.gender ?? ''),
        main_goal: String(p.main_goal ?? ''),
        current_weight_kg: String(p.current_weight_kg ?? ''),
        goal_weight_kg: String(p.goal_weight_kg ?? ''),
        height_cm: String(p.height_cm ?? ''),
        weakest_time_of_day: String(p.weakest_time_of_day ?? ''),
        main_obstacle: String(p.main_obstacle ?? ''),
        main_obstacle_detail: String(p.main_obstacle_detail ?? ''),
        wake_up_time: String(p.wake_up_time ?? '').slice(0, 5),
        sleep_time: String(p.sleep_time ?? '').slice(0, 5),
        meal_count: String(p.meal_count ?? '0'),
      });
    } catch (e) {
      setDetail(null);
      setMessage(e instanceof Error ? e.message : 'שגיאת טעינה');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void loadList(q), 280);
    return () => clearTimeout(t);
  }, [q, loadList]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const save = async () => {
    if (!selectedId) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/admin/users/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: form.full_name,
          gender: form.gender || undefined,
          main_goal: form.main_goal || undefined,
          current_weight_kg: form.current_weight_kg,
          goal_weight_kg: form.goal_weight_kg,
          height_cm: form.height_cm ? Number(form.height_cm) : null,
          weakest_time_of_day: form.weakest_time_of_day || undefined,
          main_obstacle: form.main_obstacle || undefined,
          main_obstacle_detail: form.main_obstacle_detail || null,
          wake_up_time: form.wake_up_time,
          sleep_time: form.sleep_time,
          meal_count: Number(form.meal_count) || 0,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'שמירה נכשלה');
      setMessage('נשמר — אלמוג עודכן עם המידע החדש');
      void loadDetail(selectedId);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'שגיאה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-black text-slate-900">משתמשים</h1>
        <p className="text-sm text-slate-600 mt-1">חיפוש, צפייה בפרופיל הרשמה ועריכה — מעדכן את אלמוג אוטומטית.</p>
      </header>

      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש לפי שם או מזהה..."
          className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-slate-200 bg-white/80 text-sm"
          dir="rtl"
        />
      </div>

      {message ? (
        <p className="text-sm font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
          {message}
        </p>
      ) : null}

      <div className="grid lg:grid-cols-[minmax(0,320px)_1fr] gap-4 items-start">
        <section className="rounded-2xl border border-white/80 bg-white/60 backdrop-blur-xl overflow-hidden max-h-[70vh] flex flex-col">
          <p className="text-xs font-bold text-slate-500 px-4 py-2 border-b border-slate-100">רשימה</p>
          {listLoading ? (
            <p className="p-6 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
            </p>
          ) : (
            <ul className="overflow-y-auto flex-1 divide-y divide-slate-100">
              {list.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(u.id)}
                    className={[
                      'w-full text-right px-4 py-3 hover:bg-emerald-50/80 transition-colors',
                      selectedId === u.id ? 'bg-emerald-50' : '',
                    ].join(' ')}
                  >
                    <p className="font-bold text-slate-900 text-sm">{u.full_name || 'ללא שם'}</p>
                    <p className="text-xs text-slate-500 truncate">{u.email ?? u.id}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {u.onboarding_completed ? 'השלים הרשמה' : 'הרשמה לא הושלמה'}
                      {u.email_confirmed ? ' · אימייל מאומת' : ''}
                    </p>
                  </button>
                </li>
              ))}
              {list.length === 0 ? (
                <li className="p-6 text-center text-sm text-slate-500">לא נמצאו משתמשים</li>
              ) : null}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-white/80 bg-white/60 backdrop-blur-xl p-4 sm:p-5 min-h-[320px]">
          {!selectedId ? (
            <p className="text-slate-500 text-sm flex items-center gap-2 justify-center py-16">
              <UserCircle className="w-5 h-5" />
              בחר/י משתמש מהרשימה
            </p>
          ) : detailLoading ? (
            <p className="flex justify-center py-16">
              <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
            </p>
          ) : detail ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-black text-slate-900">{form.full_name || 'משתמש'}</h2>
                <p className="text-sm text-slate-600">{detail.auth.email}</p>
                <div className="flex flex-wrap gap-2 mt-2 text-xs">
                  <span className="rounded-lg bg-slate-100 px-2 py-1">
                    תחנות במעקב: {detail.stats.journey_steps_tracked}
                  </span>
                  <span className="rounded-lg bg-emerald-100 px-2 py-1 text-emerald-900">
                    הושלמו: {detail.stats.journey_steps_completed}
                  </span>
                  <span className="rounded-lg bg-sky-100 px-2 py-1 text-sky-900">
                    משימות שקיבל: {detail.stats.tasks_accepted}
                  </span>
                  <span className="rounded-lg bg-violet-100 px-2 py-1 text-violet-900">
                    הרגלים במעקב: {detail.stats.habits_tracked}
                  </span>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                {(
                  [
                    ['full_name', 'שם'],
                    ['gender', 'מין (male/female)'],
                    ['main_goal', 'מטרה'],
                    ['current_weight_kg', 'משקל נוכחי'],
                    ['goal_weight_kg', 'משקל יעד'],
                    ['height_cm', 'גובה'],
                    ['weakest_time_of_day', 'חלון קשה'],
                    ['main_obstacle', 'מכשול'],
                    ['wake_up_time', 'השכמה'],
                    ['sleep_time', 'שינה'],
                    ['meal_count', 'מספר ארוחות'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="block">
                    <span className="text-xs font-bold text-slate-600">{label}</span>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white"
                      value={form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    />
                  </label>
                ))}
              </div>

              <label className="block">
                <span className="text-xs font-bold text-slate-600">פירוט מכשול (אם other)</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white"
                  value={form.main_obstacle_detail}
                  onChange={(e) => setForm((f) => ({ ...f, main_obstacle_detail: e.target.value }))}
                />
              </label>

              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 text-white font-bold px-4 py-2.5 hover:bg-emerald-700 disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                שמירה ועדכון אלמוג
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
