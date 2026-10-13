'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot, CheckCircle2, Loader2, MessageCircleQuestion, Send, Sparkles, TriangleAlert } from 'lucide-react';
import type { AgentEvent, AgentQuestion } from '@/lib/admin/journey-agent/agent';
import type { AiFilledStep } from '@/lib/admin/journey-agent/fill-core';

type Line = { id: number; kind: AgentEvent['type'] | 'me'; text: string; extra?: string[] };

/**
 * Journey-step agent panel (StepEditor). Live stream of what the agent is doing; it gives its opinion,
 * asks questions, writes the step, reviews it. "Apply" fills the form — nothing is saved until the
 * admin presses Save in the editor.
 */
export function JourneyAgentPanel({ stepId, onApply }: { stepId?: string | null; onApply: (step: AiFilledStep) => void }) {
  const [source, setSource] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [questions, setQuestions] = useState<AgentQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [comment, setComment] = useState('');
  const [draft, setDraft] = useState<AiFilledStep | null>(null);
  const [applied, setApplied] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  // resume a session (e.g. link from Gideon on Telegram: /ops/steps/new?agentSession=<id>)
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('agentSession');
    if (!id) return;
    fetch(`/api/v1/admin/journey-agent?id=${encodeURIComponent(id)}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((j: { session?: { id: string; source_text: string; pending_questions: AgentQuestion[]; draft: AiFilledStep | null; events: AgentEvent[] } }) => {
        const s = j.session;
        if (!s) return;
        setSessionId(s.id);
        setSource(s.source_text);
        for (const e of s.events) if (e.type !== 'draft' && e.type !== 'question') onEvent(e);
        if (s.pending_questions.length) onEvent({ type: 'question', questions: s.pending_questions });
        if (s.draft) onEvent({ type: 'draft', step: s.draft, summary: 'טיוטה מהסשן' });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), [lines.length]);

  const push = (kind: Line['kind'], text: string, extra?: string[]) => setLines((l) => [...l, { id: ++seq.current, kind, text, extra }]);

  const onEvent = (e: AgentEvent | { type: 'session'; sessionId: string }) => {
    switch (e.type) {
      case 'session':
        setSessionId(e.sessionId);
        break;
      case 'status':
        if (typeof e.progress === 'number') setProgress((p) => Math.max(p, e.progress!));
        setLines((l) => (l.length && l[l.length - 1].kind === 'status' ? [...l.slice(0, -1), { id: ++seq.current, kind: 'status', text: e.text }] : [...l, { id: ++seq.current, kind: 'status', text: e.text }]));
        break;
      case 'thought':
        push('thought', e.text);
        break;
      case 'opinion':
        push('opinion', e.text, e.concerns);
        break;
      case 'question':
        setQuestions(e.questions);
        push('question', 'יש לי כמה שאלות לפני שאני כותב:', e.questions.map((q) => q.label));
        break;
      case 'review':
        push('review', `ציון עצמי ${e.score}/10 — ${e.verdict}`, [...e.issues.map((i) => `⚠️ ${i}`), ...e.suggestions.map((s) => `💡 ${s}`)]);
        break;
      case 'draft':
        setDraft(e.step);
        push('draft', `הטיוטה מוכנה: ${e.summary}`);
        break;
      case 'done':
        setProgress(100);
        break;
      case 'error':
        push('error', e.text);
        break;
    }
  };

  const call = async (body: Record<string, unknown>) => {
    setBusy(true);
    setQuestions([]);
    setApplied(false);
    try {
      const res = await fetch('/api/v1/admin/journey-agent', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        push('error', j.error ?? `שגיאה ${res.status}`);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n');
        buf = parts.pop() ?? '';
        for (const p of parts) if (p.trim()) try { onEvent(JSON.parse(p)); } catch { /* partial */ }
      }
      if (buf.trim()) try { onEvent(JSON.parse(buf)); } catch { /* ignore */ }
    } catch (e) {
      push('error', e instanceof Error ? e.message : 'החיבור נקטע — הסוכן ממשיך ברקע, אפשר לרענן את הסשן');
    } finally {
      setBusy(false);
    }
  };

  const start = () => {
    setLines([]);
    setDraft(null);
    setProgress(2);
    void call({ action: 'start', sourceText: source.trim(), stepId: stepId ?? null });
  };
  const reply = () => {
    const filled = Object.fromEntries(Object.entries(answers).filter(([, v]) => v.trim()));
    const qs = questions.map((q) => `${q.label}: ${filled[q.id] ?? '(דלג — תחליט אתה)'}`);
    if (qs.length) push('me', qs.join('\n'));
    if (comment.trim()) push('me', comment.trim());
    const payloadAnswers = Object.fromEntries(questions.map((q) => [q.id, `${q.label} → ${filled[q.id] ?? 'המנהל השאיר לך להחליט'}`]));
    setAnswers({});
    setComment('');
    setProgress(5);
    void call({ action: 'answer', sessionId, answers: payloadAnswers, comment: comment.trim() || undefined });
  };

  const bubble: Record<Line['kind'], string> = {
    status: 'bg-transparent text-violet-700/80 text-[12px] italic',
    thought: 'bg-slate-100 text-slate-800',
    opinion: 'bg-violet-50 text-violet-950 ring-1 ring-violet-200',
    question: 'bg-amber-50 text-amber-950 ring-1 ring-amber-200',
    review: 'bg-sky-50 text-sky-950 ring-1 ring-sky-200',
    draft: 'bg-emerald-50 text-emerald-950 ring-1 ring-emerald-200',
    done: '',
    error: 'bg-red-50 text-red-800 ring-1 ring-red-200',
    me: 'bg-gradient-to-l from-violet-600 to-blue-600 text-white',
  };

  return (
    <div dir="rtl" className="space-y-3">
      {!sessionId || (!busy && lines.length === 0) ? (
        <>
          <textarea value={source} onChange={(e) => setSource(e.target.value)} disabled={busy} className="input-field min-h-[140px] leading-relaxed" placeholder="הדביקו כאן את התוכן הגולמי (תמלול / מחקרים / קישורים). הסוכן יקרא, יגיד מה הוא חושב, ישאל אם צריך, ויכתוב את כל הסעיפים חוץ מהווידאו." />
          <button type="button" onClick={start} disabled={busy || source.trim().length < 40} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-l from-violet-600 to-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} הפעל את הסוכן
          </button>
        </>
      ) : null}

      {lines.length > 0 && (
        <div className="space-y-2 rounded-2xl bg-white/70 p-3 ring-1 ring-violet-200">
          <div className="flex items-center justify-between text-xs font-black text-violet-900">
            <span className="flex items-center gap-1.5"><Bot className="h-4 w-4" /> סוכן המסעות {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-violet-100"><div className="h-full bg-gradient-to-l from-violet-600 to-blue-600 transition-all duration-500" style={{ width: `${progress}%` }} /></div>
          <div className="max-h-96 space-y-2 overflow-y-auto pl-1" aria-live="polite">
            {lines.map((l) => (
              <div key={l.id} className={`flex ${l.kind === 'me' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${bubble[l.kind]}`}>
                  {l.kind === 'question' ? <MessageCircleQuestion className="mb-1 inline h-4 w-4" /> : null}
                  {l.kind === 'error' ? <TriangleAlert className="mb-1 inline h-4 w-4" /> : null}
                  {l.kind === 'draft' ? <CheckCircle2 className="mb-1 inline h-4 w-4" /> : null} {l.text}
                  {l.extra?.length ? <ul className="mt-1 list-disc space-y-0.5 pr-4 text-[12px]">{l.extra.map((x, i) => <li key={i}>{x}</li>)}</ul> : null}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          {!busy && questions.length > 0 && (
            <div className="space-y-2 rounded-xl bg-amber-50/60 p-2">
              {questions.map((q) => (
                <label key={q.id} className="block text-sm">
                  <span className="font-semibold text-slate-900">{q.label}</span>
                  {q.why ? <span className="block text-[11px] text-slate-500">{q.why}</span> : null}
                  <textarea className="input-field mt-1 min-h-[56px]" value={answers[q.id] ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} placeholder="ריק = תחליט אתה" />
                </label>
              ))}
            </div>
          )}

          {!busy && sessionId && (
            <div className="flex gap-2">
              <input className="input-field flex-1" value={comment} onChange={(e) => setComment(e.target.value)} placeholder={draft ? 'בקש שינוי ("השאלות קלות מדי", "משימה פשוטה יותר")…' : 'הערה לסוכן (לא חובה)…'} onKeyDown={(e) => { if (e.key === 'Enter' && (comment.trim() || questions.length)) reply(); }} />
              <button type="button" onClick={reply} disabled={!comment.trim() && questions.length === 0} className="inline-flex items-center gap-1 rounded-xl bg-violet-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"><Send className="h-4 w-4 -scale-x-100" /> {questions.length ? 'ענה והמשך' : 'שלח'}</button>
            </div>
          )}

          {!busy && draft && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => { onApply(draft); setApplied(true); }} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"><CheckCircle2 className="h-4 w-4" /> מלא את הטופס בטיוטה</button>
              {applied ? <span className="text-xs font-semibold text-emerald-700">מולא. עברו על הסעיפים, הוסיפו וידאו ושמרו.</span> : null}
              <button type="button" onClick={() => { setSessionId(null); setLines([]); setDraft(null); setProgress(0); }} className="text-xs font-semibold text-slate-500 underline">סשן חדש</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
