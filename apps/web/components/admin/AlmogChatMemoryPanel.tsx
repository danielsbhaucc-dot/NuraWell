'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, MessageSquare, Calendar } from 'lucide-react';
import { glassCardStyle, glassPanelStyle } from '@/components/media-manager/glass-styles';

type ChatSessionRow = {
  id: string;
  status: string;
  summary: string | null;
  live_conversation_file: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

type PeriodicRow = {
  type: string;
  period_key: string;
  session_count: number;
  ai_insight: string;
  updated_at: string;
};

type ChatMemoryResp = {
  rollup: string | null;
  sessions: ChatSessionRow[];
  periodic_summaries: PeriodicRow[];
};

const TYPE_LABELS: Record<string, string> = {
  daily: 'יומי',
  weekly: 'שבועי',
  monthly: 'חודשי',
  bi_monthly: 'דו-חודשי',
  quarterly: 'רבעוני',
  semi_annual: 'חצי שנתי',
  annual: 'שנתי',
};

function fmt(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('he-IL', {
      timeZone: 'Asia/Jerusalem',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function AlmogChatMemoryPanel({ userId }: { userId: string }) {
  const [data, setData] = useState<ChatMemoryResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}/chat-memory`);
      if (!res.ok) throw new Error('שגיאת טעינה');
      setData((await res.json()) as ChatMemoryResp);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-4 text-rose-800">
        {error ?? 'לא נטען'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {data.rollup ? (
        <section className="rounded-2xl p-4" style={glassCardStyle}>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <MessageSquare className="h-4 w-4" />
            סיכום cross-session (profiles.ai_context)
          </h3>
          <pre className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{data.rollup}</pre>
        </section>
      ) : null}

      <section className="rounded-2xl p-4" style={glassPanelStyle}>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Calendar className="h-4 w-4" />
          סיכומים תקופתיים ({data.periodic_summaries.length})
        </h3>
        {data.periodic_summaries.length === 0 ? (
          <p className="text-sm text-slate-500">אין עדיין</p>
        ) : (
          <ul className="space-y-3">
            {data.periodic_summaries.map((p) => (
              <li key={`${p.type}-${p.period_key}`} className="rounded-xl border border-slate-200/80 bg-white/60 p-3">
                <div className="mb-1 text-xs font-medium text-indigo-700">
                  {TYPE_LABELS[p.type] ?? p.type} · {p.period_key} · {p.session_count} שיחות · {fmt(p.updated_at)}
                </div>
                <p className="text-sm text-slate-700">{p.ai_insight}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl p-4" style={glassPanelStyle}>
        <h3 className="mb-3 text-sm font-semibold text-slate-800">
          שיחות ({data.sessions.length})
        </h3>
        <ul className="space-y-2">
          {data.sessions.map((s) => {
            const open = expandedSession === s.id;
            return (
              <li key={s.id} className="rounded-xl border border-slate-200/80 bg-white/60">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-right text-sm"
                  onClick={() => setExpandedSession(open ? null : s.id)}
                >
                  <span className="truncate text-slate-600">{s.id.slice(0, 8)}…</span>
                  <span
                    className={
                      s.status === 'open'
                        ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800'
                        : 'rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600'
                    }
                  >
                    {s.status === 'open' ? 'פתוח' : 'סגור'}
                  </span>
                  <span className="text-xs text-slate-500">{fmt(s.updated_at)}</span>
                </button>
                {open ? (
                  <div className="space-y-3 border-t border-slate-100 px-3 py-3 text-xs">
                    {s.summary ? (
                      <div>
                        <div className="mb-1 font-medium text-slate-700">סיכום סגירה</div>
                        <p className="whitespace-pre-wrap text-slate-600">{s.summary}</p>
                      </div>
                    ) : null}
                    {s.live_conversation_file ? (
                      <div>
                        <div className="mb-1 font-medium text-slate-700">קובץ שיחה חי</div>
                        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-slate-600">
                          {s.live_conversation_file}
                        </pre>
                      </div>
                    ) : (
                      <p className="text-slate-400">אין קובץ חי</p>
                    )}
                    <div className="text-slate-400">
                      נוצר {fmt(s.created_at)}
                      {s.closed_at ? ` · נסגר ${fmt(s.closed_at)}` : null}
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
