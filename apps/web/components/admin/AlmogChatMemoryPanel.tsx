'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  MessageSquare,
  Calendar,
  Trash2,
  Lock,
  Unlock,
  Download,
  Copy,
  Send,
  Shield,
  Search,
  Printer,
  FileJson,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { glassCardStyle, glassPanelStyle } from '@/components/media-manager/glass-styles';
import { buildChatSessionListTitle } from '@/lib/ai/chat-sessions/session-list-title';
import { formatTranscriptForLlm } from '@/lib/ai/chat-sessions/fetch-transcript';

type TranscriptAccessStatus =
  | 'granted_global'
  | 'granted_session'
  | 'pending'
  | 'denied'
  | 'none';

type ChatSessionRow = {
  id: string;
  status: string;
  title: string | null;
  summary: string | null;
  preview_text: string | null;
  message_count?: number;
  live_conversation_file: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  transcript_access?: TranscriptAccessStatus;
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
  transcript_global_consent?: boolean;
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

const ACCESS_LABELS: Record<TranscriptAccessStatus, string> = {
  granted_global: 'אושר (גלובלי)',
  granted_session: 'אושר (שיחה)',
  pending: 'ממתין לאישור',
  denied: 'נדחה',
  none: 'לא מאושר',
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

function sessionListLabel(s: ChatSessionRow): string {
  return buildChatSessionListTitle({
    title: s.title,
    summary: s.summary,
    preview_text: s.preview_text,
    created_at: s.created_at,
  });
}

function sessionFullTitle(s: ChatSessionRow): string {
  if (s.title?.trim()) return s.title.trim();
  return sessionListLabel(s);
}

function accessBadgeClass(status: TranscriptAccessStatus | undefined): string {
  switch (status) {
    case 'granted_global':
    case 'granted_session':
      return 'bg-emerald-100 text-emerald-800';
    case 'pending':
      return 'bg-amber-100 text-amber-800';
    case 'denied':
      return 'bg-rose-100 text-rose-800';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function canViewTranscript(status: TranscriptAccessStatus | undefined): boolean {
  return status === 'granted_global' || status === 'granted_session';
}

export function AlmogChatMemoryPanel({
  userId,
  initialSessionId = null,
}: {
  userId: string;
  initialSessionId?: string | null;
}) {
  const [data, setData] = useState<ChatMemoryResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptTurn[] | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [accessReason, setAccessReason] = useState('');
  const [reasonModalSession, setReasonModalSession] = useState<string | null>(null);
  const [requestReason, setRequestReason] = useState('');
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}/chat-memory`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const body = (await res.json()) as ChatMemoryResp & { error?: string };
      if (!res.ok) throw new Error(body.error ?? 'שגיאת טעינה');
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const [initialApplied, setInitialApplied] = useState(false);
  useEffect(() => {
    if (!data || !initialSessionId || initialApplied) return;
    const session = data.sessions.find((s) => s.id === initialSessionId);
    if (!session) return;
    setExpandedSession(initialSessionId);
    if (canViewTranscript(session.transcript_access)) {
      setReasonModalSession(initialSessionId);
    }
    setInitialApplied(true);
  }, [data, initialSessionId, initialApplied]);

  const expandedRow = useMemo(
    () => data?.sessions.find((s) => s.id === expandedSession) ?? null,
    [data, expandedSession],
  );

  const filteredTranscript = useMemo(() => {
    if (!transcript) return null;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return transcript;
    return transcript.filter((t) => t.content.toLowerCase().includes(q));
  }, [transcript, searchQuery]);

  const loadTranscript = useCallback(
    async (sessionId: string, reason: string) => {
      setTranscriptLoading(true);
      setTranscript(null);
      setTranscriptError(null);
      try {
        const params = new URLSearchParams({
          sessionId,
          reason,
        });
        const res = await fetch(
          `/api/v1/admin/users/${userId}/chat-memory?${params.toString()}`,
          { credentials: 'include', cache: 'no-store' },
        );
        const body = (await res.json()) as {
          messages?: TranscriptTurn[];
          error?: string;
          message?: string;
          access_status?: TranscriptAccessStatus;
        };
        if (!res.ok) {
          throw new Error(body.message ?? body.error ?? 'שגיאת תמליל');
        }
        setTranscript(body.messages ?? []);
      } catch (e) {
        setTranscriptError(e instanceof Error ? e.message : 'שגיאה');
        setTranscript([]);
      } finally {
        setTranscriptLoading(false);
      }
    },
    [userId],
  );

  const toggleSession = (s: ChatSessionRow) => {
    if (expandedSession === s.id) {
      setExpandedSession(null);
      setTranscript(null);
      setTranscriptError(null);
      setSearchQuery('');
      return;
    }
    setExpandedSession(s.id);
    setTranscript(null);
    setTranscriptError(null);
    setSearchQuery('');
    setActionMsg(null);

    if (canViewTranscript(s.transcript_access)) {
      setReasonModalSession(s.id);
    }
  };

  const confirmViewTranscript = () => {
    const reason = accessReason.trim();
    if (reason.length < 8 || !reasonModalSession) return;
    setReasonModalSession(null);
    void loadTranscript(reasonModalSession, reason);
  };

  const requestAccess = async (sessionId: string) => {
    const reason = requestReason.trim();
    if (reason.length < 8) {
      setTranscriptError('יש להזין סיבה (לפחות 8 תווים) לבקשת הגישה');
      return;
    }
    setActingId(sessionId);
    setTranscriptError(null);
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}/chat-memory`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request_transcript_access',
          sessionId,
          reason,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? 'הבקשה נכשלה');
      setActionMsg('בקשת הגישה נשלחה למשתמש — ממתין לאישור');
      setRequestReason('');
      await load();
    } catch (e) {
      setTranscriptError(e instanceof Error ? e.message : 'שגיאה');
    } finally {
      setActingId(null);
    }
  };

  const exportTranscript = async (sessionId: string, format: 'txt' | 'json') => {
    const reason = accessReason.trim();
    if (reason.length < 8) {
      setReasonModalSession(sessionId);
      return;
    }
    const params = new URLSearchParams({ sessionId, reason, format });
    const res = await fetch(
      `/api/v1/admin/users/${userId}/chat-memory?${params.toString()}`,
      { credentials: 'include', cache: 'no-store' },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      setTranscriptError(body.message ?? body.error ?? 'ייצוא נכשל');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${sessionId.slice(0, 8)}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setActionMsg(`התמליל יוצא בפורמט ${format.toUpperCase()}`);
  };

  const copyTranscript = async () => {
    if (!transcript?.length || !expandedSession) return;
    const text = formatTranscriptForLlm(transcript);
    try {
      await navigator.clipboard.writeText(text);
      setActionMsg('התמליל הועתק ללוח');
    } catch {
      setTranscriptError('העתקה נכשלה');
    }
  };

  const sendToUser = async (sessionId: string) => {
    const reason = accessReason.trim();
    if (reason.length < 8) {
      setReasonModalSession(sessionId);
      return;
    }
    setActingId(sessionId);
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}/chat-memory`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_transcript_to_user',
          sessionId,
          reason,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? 'שליחה נכשלה');
      setActionMsg('נשלח קישור לשיחה למשתמש');
    } catch (e) {
      setTranscriptError(e instanceof Error ? e.message : 'שגיאה');
    } finally {
      setActingId(null);
    }
  };

  const printTranscript = () => {
    if (!transcript?.length || !expandedRow) return;
    const w = window.open('', '_blank');
    if (!w) return;
    const title = sessionFullTitle(expandedRow);
    const html = transcript
      .map((t) => {
        const who = t.role === 'user' ? 'משתמש' : 'אלמוג';
        return `<div style="margin-bottom:12px"><strong>${who}</strong> <small>${fmt(t.created_at)}</small><p style="white-space:pre-wrap;margin:4px 0">${t.content.replace(/</g, '&lt;')}</p></div>`;
      })
      .join('');
    w.document.write(
      `<html dir="rtl"><head><title>${title}</title></head><body style="font-family:sans-serif;padding:24px"><h1>${title}</h1><p style="color:#666;font-size:12px">NuraWell — מסמך פנימי מוגן</p>${html}</body></html>`,
    );
    w.document.close();
    w.print();
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
          action === 'delete' ? { sessionId } : { sessionId, action },
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
      <section className="rounded-2xl border border-indigo-200/80 bg-indigo-50/60 p-4">
        <div className="flex items-start gap-2">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-indigo-700" />
          <div className="text-xs leading-relaxed text-indigo-900">
            <p className="font-semibold">הגנה רב-שכבתית על תמלילים</p>
            <p className="mt-1 text-indigo-800/90">
              צפייה בתמליל דורשת אישור משתמש, סיבת גישה (נרשמת ב-audit log), והרשאת Ops.
              {data.transcript_global_consent
                ? ' למשתמש זה יש הסכמה גלובלית פעילה.'
                : ' למשתמש זה אין הסכמה גלובלית — יש לבקש אישור לכל שיחה.'}
            </p>
          </div>
        </div>
      </section>

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
            const fullTitle = sessionFullTitle(s);
            const access = s.transcript_access ?? 'none';
            const hasAccess = canViewTranscript(access);

            return (
              <li key={s.id} className="rounded-xl border border-slate-200/80 bg-white/60">
                <button
                  type="button"
                  className="flex w-full flex-col gap-1 px-3 py-2 text-right text-sm"
                  onClick={() => toggleSession(s)}
                >
                  <span
                    className="line-clamp-2 font-medium leading-snug text-slate-800"
                    title={fullTitle}
                  >
                    {fullTitle}
                  </span>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={
                        s.status === 'open'
                          ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800'
                          : 'rounded-full bg-slate-100 px-2 py-0.5 text-slate-600'
                      }
                    >
                      {s.status === 'open' ? 'פתוח' : 'סגור'}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 ${accessBadgeClass(access)}`}>
                      {ACCESS_LABELS[access]}
                    </span>
                    {typeof s.message_count === 'number' ? (
                      <span className="text-slate-500">{s.message_count} הודעות</span>
                    ) : null}
                    <span className="mr-auto text-slate-500">{fmt(s.updated_at)}</span>
                  </div>
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

                    {actionMsg ? (
                      <p className="flex items-center gap-1 text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {actionMsg}
                      </p>
                    ) : null}

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
                    ) : null}

                    {!hasAccess ? (
                      <div className="flex items-start gap-3 rounded-xl border border-[#E8D5B5] bg-[#FFF8ED] p-3">
                        <div className="min-w-0 flex-1">
                        <div className="mb-2 flex items-center gap-2 font-medium text-amber-900">
                          {access === 'pending' ? (
                            <Clock className="h-4 w-4 shrink-0" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                          )}
                          {access === 'pending'
                            ? 'ממתין לאישור המשתמש'
                            : access === 'denied'
                              ? 'המשתמש דחה את הבקשה'
                              : 'נדרש אישור משתמש לצפייה בתמליל'}
                        </div>
                        {access !== 'pending' ? (
                          <>
                            <label className="mb-1 block text-amber-900/90">סיבת הבקשה (נשלחת למשתמש)</label>
                            <textarea
                              value={requestReason}
                              onChange={(e) => setRequestReason(e.target.value)}
                              rows={2}
                              className="mb-2 w-full rounded-lg border border-[#E8D5B5] bg-[#FFFBF5] px-2 py-1 text-slate-800"
                              placeholder="למשל: בקשת תמיכה #1234 — בדיקת תקלה בשיחה"
                            />
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void requestAccess(s.id)}
                              className="inline-flex items-center gap-1 rounded-lg bg-amber-700 px-3 py-1.5 font-medium text-[#FFFBF5] disabled:opacity-50"
                            >
                              <Send className="h-3.5 w-3.5" />
                              שלח בקשת אישור למשתמש
                            </button>
                          </>
                        ) : (
                          <p className="text-amber-900/90">
                            נשלחה התראה למשתמש. לאחר אישור — יהיה ניתן לצפות בתמליל ל-24 שעות.
                          </p>
                        )}
                        </div>
                        <Shield className="mt-0.5 h-5 w-5 shrink-0 text-amber-800/70" aria-hidden />
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void exportTranscript(s.id, 'txt')}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 font-medium text-slate-700"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            ייצוא TXT
                          </button>
                          <button
                            type="button"
                            onClick={() => void exportTranscript(s.id, 'json')}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 font-medium text-slate-700"
                          >
                            <FileJson className="h-3.5 w-3.5" />
                            ייצוא JSON
                          </button>
                          <button
                            type="button"
                            disabled={!transcript?.length}
                            onClick={() => void copyTranscript()}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 font-medium text-slate-700 disabled:opacity-50"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            העתק
                          </button>
                          <button
                            type="button"
                            disabled={!transcript?.length}
                            onClick={printTranscript}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 font-medium text-slate-700 disabled:opacity-50"
                          >
                            <Printer className="h-3.5 w-3.5" />
                            הדפס
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void sendToUser(s.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 font-medium text-indigo-800 disabled:opacity-50"
                          >
                            <Download className="h-3.5 w-3.5" />
                            שלח קישור למשתמש
                          </button>
                        </div>

                        <div className="relative">
                          <Search className="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5 text-slate-400" />
                          <input
                            type="search"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="חיפוש בתמליל..."
                            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pr-8 pl-2 text-slate-800"
                          />
                        </div>

                        <div>
                          <div className="mb-1 font-medium text-slate-700">תמליל</div>
                          {transcriptLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                          ) : transcriptError ? (
                            <p className="text-rose-600">{transcriptError}</p>
                          ) : filteredTranscript && filteredTranscript.length > 0 ? (
                            <ul className="max-h-80 space-y-2 overflow-auto rounded-lg bg-slate-50 p-2">
                              {filteredTranscript.map((t, i) => (
                                <li key={`${t.created_at}-${i}`}>
                                  <span className="font-semibold text-slate-700">
                                    {t.role === 'user' ? 'משתמש' : 'אלמוג'}
                                  </span>
                                  <span className="text-slate-400"> · {fmt(t.created_at)}</span>
                                  <p className="whitespace-pre-wrap text-slate-600">{t.content}</p>
                                </li>
                              ))}
                            </ul>
                          ) : transcript && transcript.length > 0 ? (
                            <p className="text-slate-400">אין תוצאות לחיפוש</p>
                          ) : (
                            <p className="text-slate-400">
                              {transcript === null
                                ? 'יש לאשר סיבת גישה כדי לטעון את התמליל'
                                : 'אין הודעות בשיחה זו'}
                            </p>
                          )}
                        </div>
                      </>
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

      {reasonModalSession ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" dir="rtl">
            <h4 className="mb-2 flex items-center gap-2 font-bold text-slate-900">
              <Shield className="h-4 w-4 text-indigo-600" />
              אישור גישה לתמליל
            </h4>
            <p className="mb-3 text-sm text-slate-600">
              יש להזין סיבת גישה (לפחות 8 תווים). הפעולה נרשמת ב-audit log ואינה ניתנת לביטול.
            </p>
            <textarea
              value={accessReason}
              onChange={(e) => setAccessReason(e.target.value)}
              rows={3}
              className="mb-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="סיבת הגישה — למשל: טיפול בפנייה #456"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={accessReason.trim().length < 8}
                onClick={confirmViewTranscript}
                className="flex-1 rounded-xl bg-indigo-600 py-2 font-bold text-white disabled:opacity-50"
              >
                אשר וטען תמליל
              </button>
              <button
                type="button"
                onClick={() => setReasonModalSession(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 font-medium text-slate-700"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
