'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, MessageSquare, Calendar, Trash2, Lock, Unlock } from 'lucide-react';
import { glassCardStyle, glassPanelStyle } from '@/components/media-manager/glass-styles';
import { buildChatSessionListTitle } from '@/lib/ai/chat-sessions/session-list-title';

type ChatSessionRow = {
  id: string;
  status: string;
  title: string | null;
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

type TranscriptTurn = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
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

function sessionTitle(s: ChatSessionRow): string {
  return buildChatSessionListTitle({
    title: s.title,
    summary: s.summary,
    preview_text: null,
    created_at: s.created_at,
  });
}

export function AlmogChatMemoryPanel({ userId }: { userId: string }) {
  const [data, setData] = useState<ChatMemoryResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptTurn[] | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}/chat-memory`, {
        credentials: 'include',
        cache: 'no-store',
      });
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

  const loadTranscript = useCallback(
    async (sessionId: string) => {
      setTranscriptLoading(true);
      setTranscript(null);
      try {
        const res = await fetch(
          `/api/v1/admin/users/${userId}/chat-memory?sessionId=${encodeURIComponent(sessionId)}`,
          { credentials: 'include', cache: 'no-store' }
        );
        if (!res.ok) throw new Error('שגיאת תמליל');
        const body = (await res.json()) as { messages?: TranscriptTurn[] };
        setTranscript(body.messages ?? []);
      } catch {
        setTranscript([]);
      } finally {
        setTranscriptLoading(false);
      }
    },
    [userId]
  );

  const toggleSession = (id: string) => {
    if (expandedSession === id) {
      setExpandedSession(null);
      setTranscript(null);
      return;
    }
    setExpandedSession(id);
    void loadTranscript(id);
  };

  const runAction = async (sessionId: string, action: 'close' | 'reopen' | 'delete') => {
    if (action === 'delete' && !window.confirm('למחוק את השיחה והתמליל? לא ניתן לשחזר.')) {
      return;
    }
    setActingId(sessionId);
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}/chat-memory`, {
        method: action === 'delete' ? 'DELETE' : 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          action === 'delete' ? { sessionId } : { sessionId, action }
        ),
      });
      if (!res.ok) throw new Error('הפעולה נכשלה');
      if (action === 'delete' && expandedSession === sessionId) {
        setExpandedSession(null);
        setTranscript(null);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה');
    } finally {
      setActingId(null);
    }
  };

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
            סיכום cross-session
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
            const busy = actingId === s.id;
            return (
              <li key={s.id} className="rounded-xl border border-slate-200/80 bg-white/60">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-right text-sm"
                  onClick={() => toggleSession(s.id)}
                >
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
                    {sessionTitle(s)}
                  </span>
                  <span
                    className={
                      s.status === 'open'
                        ? 'shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800'
                        : 'shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600'
                    }
                  >
                    {s.status === 'open' ? 'פתוח' : 'סגור'}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">{fmt(s.updated_at)}</span>
                </button>
                {open ? (
                  <div className="space-y-3 border-t border-slate-100 px-3 py-3 text-xs">
                    <div className="flex flex-wrap gap-2">
                      {s.status === 'open' ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void runAction(s.id, 'close')}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 font-medium text-slate-700 disabled:opacity-50"
                        >
                          <Lock className="h-3.5 w-3.5" />
                          סגירה
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void runAction(s.id, 'reopen')}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 font-medium text-slate-700 disabled:opacity-50"
                        >
                          <Unlock className="h-3.5 w-3.5" />
                          פתיחה מחדש
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runAction(s.id, 'delete')}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 font-medium text-rose-700 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        מחיקה
                      </button>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
                    </div>

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
                      <p className="text-slate-400">אין קובץ חי — מוצג התמליל למטה</p>
                    )}

                    <div>
                      <div className="mb-1 font-medium text-slate-700">תמליל</div>
                      {transcriptLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                      ) : transcript && transcript.length > 0 ? (
                        <ul className="max-h-80 space-y-2 overflow-auto rounded-lg bg-slate-50 p-2">
                          {transcript.map((t, i) => (
                            <li key={`${t.created_at}-${i}`}>
                              <span className="font-semibold text-slate-700">
                                {t.role === 'user' ? 'משתמש' : 'אלמוג'}
                              </span>
                              <span className="text-slate-400"> · {fmt(t.created_at)}</span>
                              <p className="whitespace-pre-wrap text-slate-600">{t.content}</p>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-slate-400">אין הודעות בשיחה זו</p>
                      )}
                    </div>

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
