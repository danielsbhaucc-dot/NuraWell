'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { ResolvedChatUi, UiProposal } from '@/lib/ai/chat-ui/blocks';

/**
 * Cards + chips under Almog's latest message. Cream surface (no pure white), dark-green ink, RTL, ≥40px tap targets.
 * Nothing changes without a tap: proposals call the owner-only routes; picks/chips continue the conversation.
 */
const CREAM = '#FBF6EA';
const INK = '#0F3D2E';

type Props = {
  ui: ResolvedChatUi;
  disabled?: boolean;
  getSessionId?: () => string | null | undefined;
  onSend: (text: string) => void;
};

type Status = 'idle' | 'busy' | 'done' | 'dup' | 'error';

function proposalLabel(p: UiProposal): string {
  if (p.kind === 'level') return p.direction === 'easier' ? `להקל את "${p.title}" בצעד אחד` : `להעלות את "${p.title}" צעד אחד`;
  if (p.kind === 'habit') return p.replaces ? `הרגל חלופי: "${p.title}" (במקום "${p.replaces}")` : `משימה חדשה: "${p.title}"`;
  return `מטרה חדשה: "${p.text}"`;
}

async function applyProposal(p: UiProposal, sessionId?: string | null): Promise<Status> {
  try {
    const res =
      p.kind === 'level'
        ? await fetch('/api/v1/tasks/level', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assignmentId: p.assignmentId, direction: p.direction, source: 'chat', reason: 'סוכם בצ׳אט עם אלמוג' }),
          })
        : await fetch('/api/v1/ai/chat-agreements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              p.kind === 'habit'
                ? { kind: 'habit', title: p.title, replaces: p.replaces, ...(p.proposalId ? { proposalId: p.proposalId } : {}), ...(sessionId ? { sessionId } : {}) }
                : { kind: 'goal', text: p.text }
            ),
          });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; duplicate?: boolean };
    if (!res.ok || data.ok === false) return 'error';
    return data.duplicate ? 'dup' : 'done';
  } catch {
    return 'error';
  }
}

export function AlmogChatUiBlock({ ui, disabled, getSessionId, onSend }: Props) {
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [used, setUsed] = useState(false);
  const set = (k: string, s: Status) => setStatus((m) => ({ ...m, [k]: s }));
  const locked = disabled || used;

  const pick = ui.pick?.options.length ? ui.pick : null;

  return (
    <div dir="rtl" className="me-9 flex max-w-[86%] flex-col gap-2 self-end">
      {pick ? (
        <div className="rounded-2xl p-3" style={{ background: CREAM, color: INK, boxShadow: '0 6px 18px rgba(0,0,0,0.18)' }}>
          <p className="mb-2 text-[12.5px] font-bold">{pick.kind === 'struggle' ? 'עם איזו משימה קשה לך?' : 'איזו משימה מתאימה לך?'}</p>
          <div className="flex flex-col gap-1.5">
            {pick.options.map((o) => {
              const k = `pick:${o.id}`;
              const st = status[k] ?? 'idle';
              return (
                <button
                  key={o.id}
                  type="button"
                  disabled={locked || st === 'busy'}
                  onClick={async () => {
                    if (pick.kind === 'struggle') {
                      setUsed(true);
                      onSend(`המשימה שקשה לי איתה: "${o.title}"`);
                      return;
                    }
                    set(k, 'busy');
                    try {
                      const res = await fetch('/api/v1/tasks/offer', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ definitionId: o.id, accept: true }),
                      });
                      if (!res.ok) throw new Error('offer');
                      set(k, 'done');
                      setUsed(true);
                      onSend(`בחרתי את המשימה "${o.title}"`);
                    } catch {
                      set(k, 'error');
                    }
                  }}
                  className="flex min-h-[40px] items-center gap-2 rounded-xl border px-3 py-2 text-start text-[13px] font-semibold transition active:scale-[0.98] disabled:opacity-60"
                  style={{ borderColor: 'rgba(15,61,46,0.18)', background: '#F4ECD8' }}
                >
                  {o.emoji ? <span aria-hidden>{o.emoji}</span> : null}
                  <span className="flex-1 leading-snug">{o.title}</span>
                  {st === 'busy' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : st === 'done' ? <Check className="h-4 w-4" aria-hidden /> : null}
                </button>
              );
            })}
          </div>
          {Object.values(status).includes('error') ? <p className="mt-1.5 text-[11.5px] text-red-800">משהו השתבש, אפשר לנסות שוב.</p> : null}
        </div>
      ) : null}

      {ui.proposals?.length ? (
        <div className="rounded-2xl p-3" style={{ background: CREAM, color: INK, boxShadow: '0 6px 18px rgba(0,0,0,0.18)' }}>
          <p className="mb-2 text-[12.5px] font-bold">לעדכן בתוכנית שלך?</p>
          <div className="flex flex-col gap-2">
            {ui.proposals.map((p, i) => {
              const k = `p:${i}`;
              const st = status[k] ?? 'idle';
              return (
                <div key={k} className="flex items-center gap-2">
                  <p className="flex-1 text-[13px] leading-snug">{proposalLabel(p)}</p>
                  {st === 'done' || st === 'dup' ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-bold text-emerald-800">
                      <Check className="h-4 w-4" aria-hidden />
                      {st === 'dup' ? 'כבר בתוכנית' : 'עודכן'}
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={disabled || st === 'busy'}
                      onClick={async () => {
                        set(k, 'busy');
                        set(k, await applyProposal(p, getSessionId?.()));
                      }}
                      className="min-h-[40px] shrink-0 rounded-full px-4 text-[12.5px] font-bold transition active:scale-[0.97] disabled:opacity-60"
                      style={{ background: INK, color: CREAM }}
                    >
                      {st === 'busy' ? <Loader2 className="h-4 w-4 animate-spin" aria-label="מעדכן" /> : st === 'error' ? 'שוב' : 'אישור'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {ui.chips?.length && !used ? (
        <div className="flex flex-wrap justify-end gap-1.5">
          {ui.chips.map((c) => (
            <button
              key={c}
              type="button"
              disabled={locked}
              onClick={() => {
                setUsed(true);
                onSend(c);
              }}
              className="min-h-[36px] rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition active:scale-[0.97] disabled:opacity-50"
              style={{ background: CREAM, color: INK, borderColor: 'rgba(15,61,46,0.2)' }}
            >
              {c}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
