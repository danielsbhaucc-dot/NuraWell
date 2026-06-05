'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertCircle,
  Brain,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  MapPin,
  Save,
  Search,
  Target,
  Trash2,
  User,
  UserCircle,
  Users,
  X,
} from 'lucide-react';
import { AdminUserJourneyDetail } from '@/components/admin/AdminUserJourneyDetail';
import { AlmogMemoryPanel } from '@/components/admin/AlmogMemoryPanel';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { OpsPageHeader } from '@/components/admin/OpsPageHeader';
import { glassCardStyle, glassPanelStyle } from '@/components/media-manager/glass-styles';
import { cn } from '@/lib/cn';
import type { AdminUserJourneyReport } from '@/lib/admin/build-user-journey-report';

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
  stats: AdminUserJourneyReport['stats'];
  journeyReport: AdminUserJourneyReport;
};

type TabKey = 'details' | 'journey' | 'memory';

const GENDER_OPTIONS = [
  { value: '', label: '— ללא —' },
  { value: 'male', label: 'גבר' },
  { value: 'female', label: 'אישה' },
];

const GOAL_OPTIONS = [
  { value: '', label: '— ללא —' },
  { value: 'weight_loss', label: 'ירידה במשקל' },
  { value: 'healthy_lifestyle', label: 'אורח חיים בריא' },
  { value: 'both', label: 'גם וגם' },
];

const WEAKEST_OPTIONS = [
  { value: '', label: '— ללא —' },
  { value: 'morning', label: 'בוקר' },
  { value: 'noon', label: 'צהריים' },
  { value: 'afternoon', label: 'אחר הצהריים' },
  { value: 'evening_night', label: 'ערב/לילה' },
];

const OBSTACLE_OPTIONS = [
  { value: '', label: '— ללא —' },
  { value: 'no_time', label: 'חוסר זמן' },
  { value: 'emotional_eating', label: 'אכילה רגשית' },
  { value: 'lack_of_consistency', label: 'קושי להתמיד' },
  { value: 'no_support', label: 'חוסר תמיכה' },
  { value: 'other', label: 'אחר' },
];

const MEAL_OPTIONS = [
  { value: '0', label: 'ללא שעות (לוח כללי)' },
  { value: '1', label: 'ארוחה אחת' },
  { value: '2', label: 'שתי ארוחות' },
  { value: '3', label: 'שלוש ארוחות' },
];

function initialsOf(name: string | null | undefined, fallback = '?'): string {
  const t = (name ?? '').trim();
  if (!t) return fallback;
  const parts = t.split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0)).join('') || fallback;
}

/** ערכת צבע יציבה לפי מזהה — נותן מראה צבעוני ועקבי לאווטארים */
const AVATAR_GRADIENTS = [
  'from-emerald-400 to-teal-500',
  'from-violet-400 to-fuchsia-500',
  'from-sky-400 to-cyan-500',
  'from-amber-400 to-orange-500',
  'from-rose-400 to-pink-500',
  'from-indigo-400 to-blue-500',
];

function gradientFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

function Avatar({ id, name, size = 'md' }: { id: string; name: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'h-14 w-14 text-lg' : size === 'sm' ? 'h-9 w-9 text-xs' : 'h-11 w-11 text-sm';
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br font-display font-black text-white shadow-md ring-1 ring-white/50',
        gradientFor(id),
        dim,
      )}
      aria-hidden
    >
      {initialsOf(name)}
    </div>
  );
}

export function AdminUsersClient() {
  const [q, setQ] = useState('');
  const [list, setList] = useState<UserRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [tab, setTab] = useState<TabKey>('details');

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
      setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'שגיאת רשימה' });
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
      setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'שגיאת טעינה' });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void loadList(q), 280);
    return () => clearTimeout(t);
  }, [q, loadList]);

  const openUser = useCallback((userId: string) => {
    setSelectedId(userId);
    setTab('details');
    void loadDetail(userId);
  }, [loadDetail]);

  const closeUser = useCallback(() => {
    setSelectedId(null);
    setDetail(null);
    setMessage(null);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving && !deleting && !deleteDialogOpen) closeUser();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [selectedId, saving, deleting, deleteDialogOpen, closeUser]);

  const deleteUser = async () => {
    if (!selectedId || !detail) return;
    setDeleting(true);
    setDeleteDialogOpen(false);
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/admin/users/${selectedId}`, { method: 'DELETE' });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'מחיקה נכשלה');
      closeUser();
      setMessage({ kind: 'ok', text: 'המשתמש נמחק לצמיתות' });
      void loadList(q);
    } catch (e) {
      setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'שגיאת מחיקה' });
    } finally {
      setDeleting(false);
    }
  };

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
      setMessage({ kind: 'ok', text: 'נשמר — אלמוג עודכן עם המידע החדש' });
      void loadDetail(selectedId);
      void loadList(q);
    } catch (e) {
      setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'שגיאה' });
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const deleteLabel = form.full_name || detail?.auth.email || selectedId || 'משתמש זה';

  const stats = detail?.stats;
  const statChips = useMemo(
    () =>
      stats
        ? [
            { label: 'תחנות במעקב', value: stats.journey_steps_tracked, tone: 'slate' as const },
            { label: 'הושלמו', value: stats.journey_steps_completed, tone: 'emerald' as const },
            { label: 'משימות', value: stats.tasks_accepted, tone: 'sky' as const },
            { label: 'הרגלים', value: stats.habits_tracked, tone: 'violet' as const },
          ]
        : [],
    [stats],
  );

  return (
    <div className="space-y-5">
      <ConfirmDialog
        open={deleteDialogOpen}
        title="מחיקת משתמש לצמיתות"
        message={`למחוק לצמיתות את ${deleteLabel}? תתבצע מחיקה מלאה של החשבון, הפרופיל, המסע, ההתראות וכל הנתונים. לא ניתן לשחזר.`}
        confirmLabel="מחק לצמיתות"
        cancelLabel="ביטול"
        danger
        busy={deleting}
        onConfirm={() => void deleteUser()}
        onCancel={() => !deleting && setDeleteDialogOpen(false)}
      />

      {/* כותרת */}
      <OpsPageHeader
        icon={Users}
        eyebrow="ניהול קהילה"
        title="משתמשים"
        tone="emerald"
        description="חיפוש, צפייה בפרופיל ההרשמה ועריכה — כל שינוי מסנכרן אוטומטית את הזיכרון של אלמוג."
      />

      {/* חיפוש + תוצאות */}
      <div className="relative">
        <Search className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-emerald-600/70" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש לפי שם, אימייל או מזהה..."
          dir="rtl"
          className="w-full rounded-2xl border border-white/60 bg-white/55 py-3.5 pr-12 pl-4 text-sm font-medium text-slate-900 shadow-[0_8px_28px_rgba(16,185,129,0.08)] outline-none backdrop-blur-xl transition placeholder:text-slate-400 focus:border-emerald-300/70 focus:ring-2 focus:ring-emerald-400/40"
        />
      </div>

      {message ? (
        <p
          className={cn(
            'rounded-2xl border px-4 py-2.5 text-sm font-semibold backdrop-blur-md',
            message.kind === 'ok'
              ? 'border-emerald-300/60 bg-emerald-50/80 text-emerald-800'
              : 'border-rose-300/60 bg-rose-50/80 text-rose-800',
          )}
        >
          {message.text}
        </p>
      ) : null}

      {/* רשת כרטיסי משתמשים */}
      {listLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
        </div>
      ) : list.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-3xl py-16 text-center"
          style={glassCardStyle}
        >
          <UserCircle className="h-10 w-10 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">לא נמצאו משתמשים</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => openUser(u.id)}
                className="group flex w-full items-center gap-3 rounded-2xl border border-white/60 bg-white/45 p-3.5 text-right shadow-[0_8px_24px_rgba(99,102,241,0.07)] backdrop-blur-xl transition-all hover:border-emerald-300/70 hover:bg-white/70 hover:shadow-[0_12px_32px_rgba(16,185,129,0.16)] active:scale-[0.99]"
              >
                <Avatar id={u.id} name={u.full_name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-black text-slate-900">
                    {u.full_name || 'ללא שם'}
                  </p>
                  <p className="truncate text-xs text-slate-500">{u.email ?? u.id}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
                        u.onboarding_completed
                          ? 'bg-emerald-100/90 text-emerald-800'
                          : 'bg-amber-100/90 text-amber-800',
                      )}
                    >
                      {u.onboarding_completed ? 'השלים הרשמה' : 'הרשמה חלקית'}
                    </span>
                    {u.email_confirmed ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-100/90 px-2 py-0.5 text-[10px] font-bold text-sky-800">
                        <CheckCircle2 className="h-3 w-3" /> מאומת
                      </span>
                    ) : null}
                    {u.role && u.role !== 'user' ? (
                      <span className="inline-flex items-center rounded-full bg-violet-100/90 px-2 py-0.5 text-[10px] font-bold text-violet-800">
                        {u.role}
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* פופאפ פרטי משתמש */}
      {selectedId ? (
        <div
          dir="rtl"
          role="dialog"
          aria-modal="true"
          aria-label="פרטי משתמש"
          className="fixed inset-0 z-[55] flex items-end justify-center p-0 sm:items-center sm:p-4"
        >
          <button
            type="button"
            aria-label="סגור"
            onClick={() => !saving && !deleting && closeUser()}
            className="absolute inset-0 cursor-default bg-emerald-950/35 backdrop-blur-[5px]"
          />

          <div
            className="relative flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl shadow-[0_24px_70px_-12px_rgba(6,78,59,0.5)] sm:rounded-3xl"
            style={glassPanelStyle}
          >
            <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />

            {detailLoading || !detail ? (
              <div className="flex min-h-[40vh] items-center justify-center p-10">
                {detailLoading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
                ) : (
                  <p className="text-sm text-slate-500">לא ניתן לטעון את פרטי המשתמש</p>
                )}
                <button
                  type="button"
                  onClick={closeUser}
                  className="absolute left-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/55 bg-white/45 text-slate-600 backdrop-blur-md hover:bg-white/70"
                  aria-label="סגור"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                {/* כותרת הפופאפ */}
                <header className="relative shrink-0 border-b border-white/40 bg-gradient-to-l from-emerald-100/50 via-white/30 to-cyan-100/40 px-4 pb-3 pt-4 sm:px-6">
                  <button
                    type="button"
                    onClick={closeUser}
                    disabled={saving || deleting}
                    className="absolute left-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/55 bg-white/45 text-slate-600 backdrop-blur-md transition hover:bg-white/70 disabled:opacity-50 sm:left-4 sm:top-4"
                    aria-label="סגור"
                  >
                    <X className="h-4 w-4" />
                  </button>

                  <div className="flex items-center gap-3 pl-10">
                    <Avatar id={selectedId} name={form.full_name} size="lg" />
                    <div className="min-w-0">
                      <h2 className="truncate bg-gradient-to-l from-emerald-700 via-teal-600 to-cyan-700 bg-clip-text font-display text-xl font-black text-transparent">
                        {form.full_name || 'משתמש'}
                      </h2>
                      <p className="flex items-center gap-1.5 truncate text-xs text-slate-600">
                        <Mail className="h-3.5 w-3.5 shrink-0 opacity-70" />
                        {detail.auth.email ?? '—'}
                      </p>
                    </div>
                  </div>

                  {/* טאבים */}
                  <div className="mt-4 flex gap-1.5 rounded-2xl border border-white/50 bg-white/35 p-1 backdrop-blur-md">
                    {(
                      [
                        { key: 'details', label: 'פרטים', icon: User },
                        { key: 'journey', label: 'מסע', icon: MapPin },
                        { key: 'memory', label: 'זיכרון אלמוג', icon: Brain },
                      ] as const
                    ).map(({ key, label, icon: Icon }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setTab(key)}
                        className={cn(
                          'flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-bold transition-all sm:text-sm',
                          tab === key
                            ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-600/25'
                            : 'text-slate-600 hover:bg-white/55 hover:text-slate-900',
                        )}
                        aria-pressed={tab === key}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{label}</span>
                      </button>
                    ))}
                  </div>
                </header>

                {/* תוכן */}
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
                  {tab === 'details' ? (
                    <div className="space-y-4">
                      <Section icon={User} title="זהות אישית" tone="emerald">
                        <Field label="שם מלא" className="sm:col-span-2">
                          <input
                            className={inputClass}
                            value={form.full_name}
                            onChange={(e) => set('full_name', e.target.value)}
                          />
                        </Field>
                        <Field label="מין">
                          <SelectInput value={form.gender} onChange={(v) => set('gender', v)} options={GENDER_OPTIONS} />
                        </Field>
                      </Section>

                      <Section icon={Target} title="מטרה ומדדי גוף" tone="sky">
                        <Field label="מטרה ראשית" className="sm:col-span-2">
                          <SelectInput value={form.main_goal} onChange={(v) => set('main_goal', v)} options={GOAL_OPTIONS} />
                        </Field>
                        <Field label="משקל נוכחי (ק״ג)">
                          <input
                            type="number"
                            inputMode="decimal"
                            className={inputClass}
                            value={form.current_weight_kg}
                            onChange={(e) => set('current_weight_kg', e.target.value)}
                          />
                        </Field>
                        <Field label="משקל יעד (ק״ג)">
                          <input
                            type="number"
                            inputMode="decimal"
                            className={inputClass}
                            value={form.goal_weight_kg}
                            onChange={(e) => set('goal_weight_kg', e.target.value)}
                          />
                        </Field>
                        <Field label="גובה (ס״מ)">
                          <input
                            type="number"
                            inputMode="numeric"
                            className={inputClass}
                            value={form.height_cm}
                            onChange={(e) => set('height_cm', e.target.value)}
                          />
                        </Field>
                      </Section>

                      <Section icon={Clock} title="שגרה יומית" tone="violet">
                        <Field label="שעת השכמה">
                          <input
                            type="time"
                            className={inputClass}
                            value={form.wake_up_time}
                            onChange={(e) => set('wake_up_time', e.target.value)}
                          />
                        </Field>
                        <Field label="שעת שינה">
                          <input
                            type="time"
                            className={inputClass}
                            value={form.sleep_time}
                            onChange={(e) => set('sleep_time', e.target.value)}
                          />
                        </Field>
                        <Field label="מספר ארוחות" className="sm:col-span-2">
                          <SelectInput value={form.meal_count} onChange={(v) => set('meal_count', v)} options={MEAL_OPTIONS} />
                        </Field>
                      </Section>

                      <Section icon={AlertCircle} title="אתגרים והעדפות" tone="amber">
                        <Field label="חלון היום הקשה">
                          <SelectInput
                            value={form.weakest_time_of_day}
                            onChange={(v) => set('weakest_time_of_day', v)}
                            options={WEAKEST_OPTIONS}
                          />
                        </Field>
                        <Field label="מכשול עיקרי">
                          <SelectInput
                            value={form.main_obstacle}
                            onChange={(v) => set('main_obstacle', v)}
                            options={OBSTACLE_OPTIONS}
                          />
                        </Field>
                        {form.main_obstacle === 'other' ? (
                          <Field label="פירוט המכשול" className="sm:col-span-2">
                            <input
                              className={inputClass}
                              value={form.main_obstacle_detail}
                              onChange={(e) => set('main_obstacle_detail', e.target.value)}
                            />
                          </Field>
                        ) : null}
                      </Section>
                    </div>
                  ) : null}

                  {tab === 'journey' ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {statChips.map((c) => (
                          <StatChip key={c.label} label={c.label} value={c.value} tone={c.tone} />
                        ))}
                      </div>
                      <div className="rounded-2xl border border-white/45 bg-white/35 p-3 backdrop-blur-md">
                        <AdminUserJourneyDetail steps={detail.journeyReport.steps} />
                      </div>
                    </div>
                  ) : null}

                  {tab === 'memory' ? <AlmogMemoryPanel userId={selectedId} /> : null}
                </div>

                {/* פעולות */}
                <footer className="shrink-0 border-t border-white/40 bg-white/25 px-4 py-3 backdrop-blur-md sm:px-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void save()}
                      disabled={saving || deleting}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-emerald-600 to-teal-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-emerald-500/25 transition active:scale-[0.99] disabled:opacity-60"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      שמירה ועדכון אלמוג
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteDialogOpen(true)}
                      disabled={saving || deleting}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-300/70 bg-rose-50/70 px-4 py-3 text-sm font-bold text-rose-700 backdrop-blur-md transition hover:bg-rose-100/80 disabled:opacity-60"
                      aria-label="מחיקה מלאה"
                    >
                      {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      <span className="hidden sm:inline">מחיקה</span>
                    </button>
                  </div>
                  {message ? (
                    <p
                      className={cn(
                        'mt-2 flex items-center gap-1.5 text-xs font-semibold',
                        message.kind === 'ok' ? 'text-emerald-700' : 'text-rose-700',
                      )}
                    >
                      <Activity className="h-3.5 w-3.5" />
                      {message.text}
                    </p>
                  ) : null}
                </footer>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-white/60 bg-white/60 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none backdrop-blur-sm transition focus:border-emerald-300/70 focus:ring-2 focus:ring-emerald-400/40';

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      className={cn(inputClass, 'appearance-none bg-[length:1rem] bg-[left_0.75rem_center] bg-no-repeat pl-9')}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='4 6 8 10 12 6'/%3E%3C/svg%3E\")",
      }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const SECTION_TONES = {
  emerald: 'from-emerald-500 to-teal-600 text-emerald-700',
  sky: 'from-sky-500 to-cyan-600 text-sky-700',
  violet: 'from-violet-500 to-fuchsia-600 text-violet-700',
  amber: 'from-amber-500 to-orange-600 text-amber-700',
} as const;

function Section({
  icon: Icon,
  title,
  tone,
  children,
}: {
  icon: typeof User;
  title: string;
  tone: keyof typeof SECTION_TONES;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/45 bg-white/30 p-3.5 backdrop-blur-md sm:p-4">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm',
            SECTION_TONES[tone].split(' ').slice(0, 2).join(' '),
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <h3 className="font-display text-sm font-black text-slate-800">{title}</h3>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1 block text-xs font-bold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

const CHIP_TONES = {
  slate: 'border-slate-200/70 bg-slate-50/70 text-slate-700',
  emerald: 'border-emerald-200/70 bg-emerald-50/80 text-emerald-800',
  sky: 'border-sky-200/70 bg-sky-50/80 text-sky-800',
  violet: 'border-violet-200/70 bg-violet-50/80 text-violet-800',
} as const;

function StatChip({ label, value, tone }: { label: string; value: number; tone: keyof typeof CHIP_TONES }) {
  return (
    <div className={cn('rounded-2xl border px-3 py-2.5 text-center backdrop-blur-md', CHIP_TONES[tone])}>
      <p className="font-display text-xl font-black tabular-nums">{value}</p>
      <p className="mt-0.5 text-[11px] font-semibold opacity-80">{label}</p>
    </div>
  );
}
