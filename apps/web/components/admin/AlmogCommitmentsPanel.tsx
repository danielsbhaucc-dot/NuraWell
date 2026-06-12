'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  Loader2,
  Repeat,
  Snowflake,
  Sparkles,
} from 'lucide-react';
import { glassCardStyle, glassPanelStyle } from '@/components/media-manager/glass-styles';

type Assignment = {
  id: string;
  title: string;
  reason: string | null;
  detail: string | null;
  status: 'active' | 'frozen' | 'completed' | 'dropped';
  schedule: 'one_time' | 'daily' | 'weekly';
  given_at: string;
  due_at: string | null;
  last_done_at: string | null;
  done_count: number;
  source_excerpt: string | null;
};

type Reminder = {
  id: string;
  kind: 'reminder' | 'followup' | 'check_progress';
  title: string;
  body: string;
  status: 'pending' | 'sent' | 'cancelled' | 'skipped';
  fire_at: string;
  sent_at: string | null;
};

type Focus = {
  id: string;
  status: 'proposed' | 'active' | 'ended' | 'declined';
  reason: string | null;
  paused_scope: 'reminders' | 'reminders_and_dim';
  started_at: string | null;
  ends_at: string | null;
  user_confirmed: boolean;
  created_at: string;
};

type Blocker = {
  id: string;
  description: string;
  strategy: string | null;
  status: 'open' | 'improving' | 'resolved';
  identified_at: string;
  last_checked_at: string | null;
  next_check_at: string | null;
};

type Payload = {
  tables_ready: boolean;
  cron_hint?: string;
  summary?: {
    active_assignments: number;
    pending_reminders: number;
    open_blockers: number;
    live_focus: number;
  };
  assignments: Assignment[];
  reminders: Reminder[];
  focus: Focus[];
  blockers: Blocker[];
};

const SCHEDULE_LABEL: Record<Assignment['schedule'], string> = {
  one_time: 'חד-פעמי',
  daily: 'יומי',
  weekly: 'שבועי',
};

const ASSIGNMENT_STATUS: Record<Assignment['status'], { label: string; cls: string }> = {
  active: { label: 'פעילה', cls: 'bg-emerald-100/90 text-emerald-900 border-emerald-200/80' },
  frozen: { label: 'מוקפאת', cls: 'bg-sky-100/90 text-sky-900 border-sky-200/80' },
  completed: { label: 'הושלמה', cls: 'bg-teal-100/90 text-teal-900 border-teal-200/80' },
  dropped: { label: 'בוטלה', cls: 'bg-slate-100/90 text-slate-700 border-slate-200/80' },
};

const REMINDER_KIND: Record<Reminder['kind'], string> = {
  reminder: 'תזכורת',
  followup: 'בדיקה',
  check_progress: 'מעקב חסם',
};

const REMINDER_STATUS: Record<Reminder['status'], { label: string; cls: string }> = {
  pending: { label: 'ממתינה', cls: 'bg-amber-100/90 text-amber-950 border-amber-200/80' },
  sent: { label: 'נשלחה', cls: 'bg-emerald-100/90 text-emerald-900 border-emerald-200/80' },
  cancelled: { label: 'בוטלה', cls: 'bg-slate-100/90 text-slate-700 border-slate-200/80' },
  skipped: { label: 'דולגה', cls: 'bg-slate-100/90 text-slate-700 border-slate-200/80' },
};

const FOCUS_STATUS: Record<Focus['status'], { label: string; cls: string }> = {
  proposed: { label: 'הוצעה', cls: 'bg-amber-100/90 text-amber-950 border-amber-200/80' },
  active: { label: 'פעיל', cls: 'bg-emerald-100/90 text-emerald-900 border-emerald-200/80' },
  ended: { label: 'הסתיים', cls: 'bg-slate-100/90 text-slate-700 border-slate-200/80' },
  declined: { label: 'נדחתה', cls: 'bg-slate-100/90 text-slate-700 border-slate-200/80' },
};

const BLOCKER_STATUS: Record<Blocker['status'], { label: string; cls: string }> = {
  open: { label: 'פתוח', cls: 'bg-rose-100/90 text-rose-900 border-rose-200/80' },
  improving: { label: 'משתפר', cls: 'bg-amber-100/90 text-amber-950 border-amber-200/80' },
  resolved: { label: 'נפתר', cls: 'bg-emerald-100/90 text-emerald-900 border-emerald-200/80' },
};

function fmt(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function Pill({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${cls}`}>{label}</span>
  );
}

export function AlmogCommitmentsPanel({ userId }: { userId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}/almog`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const json = (await res.json()) as Payload & { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'שגיאה');
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאת טעינה');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const total =
    (data?.assignments.length ?? 0) +
    (data?.reminders.length ?? 0) +
    (data?.focus.length ?? 0) +
    (data?.blockers.length ?? 0);

  return (
    <section className="rounded-2xl overflow-hidden" style={glassPanelStyle}>
      <header className="flex items-start justify-between gap-3 px-4 py-3 border-b border-white/40">
        <div className="flex items-center gap-2">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-emerald-700"
            style={glassCardStyle}
          >
            <Sparkles className="w-5 h-5" aria-hidden />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-900">התחייבויות אלמוג</h3>
            <p className="text-xs text-slate-600/90 leading-relaxed">
              משימות אישיות, תזכורות, מצב פוקוס וחסמים שאלמוג סיכם עם המשתמש
            </p>
          </div>
        </div>
        {!loading && total > 0 ? (
          <span className="shrink-0 rounded-lg bg-white/40 px-2 py-1 text-[10px] font-bold text-emerald-900 border border-white/50">
            {total} פריטים
          </span>
        ) : null}
      </header>

      <div className="p-4">
        {loading ? (
          <p className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
          </p>
        ) : error ? (
          <p className="text-sm text-red-700 text-center py-6">{error}</p>
        ) : !data?.tables_ready ? (
          <div className="text-sm text-slate-600 text-center py-6 space-y-2">
            <p>טבלאות ההתחייבויות עדיין לא קיימות ב-DB (הרץ את מיגרציה 000048).</p>
            {data?.cron_hint ? <p className="text-xs text-slate-500">{data.cron_hint}</p> : null}
          </div>
        ) : total === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">
            אלמוג עדיין לא סיכם עם המשתמש משימות, תזכורות או חסמים.
          </p>
        ) : (
          <div className="space-y-5">
            {data.summary ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryPill label="משימות פעילות" value={data.summary.active_assignments} />
                <SummaryPill label="תזכורות ממתינות" value={data.summary.pending_reminders} />
                <SummaryPill label="חסמים פתוחים" value={data.summary.open_blockers} />
                <SummaryPill label="פוקוס חי" value={data.summary.live_focus} />
              </div>
            ) : null}

            {/* מצב פוקוס */}
            {data.focus.length > 0 ? (
              <Group icon={Snowflake} title="מצבי פוקוס" tint="text-sky-700">
                {data.focus.map((f) => (
                  <li key={f.id} className="rounded-xl px-3 py-2.5" style={glassCardStyle}>
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <Pill {...FOCUS_STATUS[f.status]} />
                      <span className="text-[10px] text-slate-500">
                        {f.paused_scope === 'reminders_and_dim' ? 'עצירה + עמעום' : 'עצירת תזכורות'}
                      </span>
                      {f.user_confirmed ? (
                        <span className="text-[10px] font-bold text-emerald-700">אושר ע״י המשתמש</span>
                      ) : null}
                    </div>
                    {f.reason ? <p className="text-sm text-slate-900">{f.reason}</p> : null}
                    <p className="text-[10px] text-slate-400 mt-1">
                      נוצר {fmt(f.created_at)} · עד {fmt(f.ends_at)}
                    </p>
                  </li>
                ))}
              </Group>
            ) : null}

            {/* משימות אישיות */}
            {data.assignments.length > 0 ? (
              <Group icon={Sparkles} title="משימות אישיות" tint="text-emerald-700">
                {data.assignments.map((a) => (
                  <li key={a.id} className="rounded-xl px-3 py-2.5" style={glassCardStyle}>
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <Pill {...ASSIGNMENT_STATUS[a.status]} />
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-slate-600">
                        {a.schedule === 'one_time' ? (
                          <Sparkles className="w-3 h-3" />
                        ) : (
                          <Repeat className="w-3 h-3" />
                        )}
                        {SCHEDULE_LABEL[a.schedule]}
                      </span>
                      {a.done_count > 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700">
                          <CheckCircle2 className="w-3 h-3" />
                          בוצע {a.done_count}×
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm font-bold text-slate-900 leading-relaxed">{a.title}</p>
                    {a.reason ? (
                      <p className="text-xs text-slate-600 mt-0.5">למה: {a.reason}</p>
                    ) : null}
                    {a.detail ? <p className="text-xs text-slate-500 mt-0.5">{a.detail}</p> : null}
                    <p className="text-[10px] text-slate-400 mt-1">
                      ניתנה {fmt(a.given_at)}
                      {a.last_done_at ? ` · בוצע לאחרונה ${fmt(a.last_done_at)}` : ''}
                    </p>
                  </li>
                ))}
              </Group>
            ) : null}

            {/* חסמים */}
            {data.blockers.length > 0 ? (
              <Group icon={AlertTriangle} title="חסמים במעקב" tint="text-rose-700">
                {data.blockers.map((b) => (
                  <li key={b.id} className="rounded-xl px-3 py-2.5" style={glassCardStyle}>
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <Pill {...BLOCKER_STATUS[b.status]} />
                    </div>
                    <p className="text-sm font-bold text-slate-900 leading-relaxed">{b.description}</p>
                    {b.strategy ? (
                      <p className="text-xs text-slate-600 mt-0.5">דרך להתגבר: {b.strategy}</p>
                    ) : null}
                    <p className="text-[10px] text-slate-400 mt-1">
                      זוהה {fmt(b.identified_at)}
                      {b.last_checked_at ? ` · נבדק ${fmt(b.last_checked_at)}` : ''}
                      {b.next_check_at ? ` · בדיקה הבאה ${fmt(b.next_check_at)}` : ''}
                    </p>
                  </li>
                ))}
              </Group>
            ) : null}

            {/* תזכורות מתוזמנות */}
            {data.reminders.length > 0 ? (
              <Group icon={Bell} title="תזכורות מתוזמנות" tint="text-amber-700">
                {data.reminders.map((r) => (
                  <li key={r.id} className="rounded-xl px-3 py-2.5" style={glassCardStyle}>
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <Pill {...REMINDER_STATUS[r.status]} />
                      <span className="text-[10px] font-bold text-slate-600">
                        {REMINDER_KIND[r.kind]}
                      </span>
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-500">
                        <Clock className="w-3 h-3" />
                        {fmt(r.fire_at)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-900 leading-relaxed">{r.body}</p>
                    {r.sent_at ? (
                      <p className="text-[10px] text-slate-400 mt-1">נשלחה {fmt(r.sent_at)}</p>
                    ) : null}
                  </li>
                ))}
              </Group>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

function SummaryPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl px-2.5 py-2 text-center" style={glassCardStyle}>
      <p className="text-lg font-black text-slate-900">{value}</p>
      <p className="text-[10px] font-bold text-slate-500">{label}</p>
    </div>
  );
}

function Group({
  icon: Icon,
  title,
  tint,
  children,
}: {
  icon: typeof Sparkles;
  title: string;
  tint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-slate-500">
        <Icon className={`w-3.5 h-3.5 ${tint}`} aria-hidden />
        {title}
      </p>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}
