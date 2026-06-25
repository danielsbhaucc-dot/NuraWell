'use client';

/**
 * 🎛️ ProgramOrchestratorGate — ה-"Dumb UI" של ה-Program Orchestrator.
 *
 * הרכיב לא מקבל שום החלטה מוצרית: הוא שולף את ההצעה היזומה מהשרת
 * (GET /api/v1/ai/program/proposal) ומצייר *בדיוק* את מה שה-AI הכתיב:
 *
 *   - level_up (requires_buyin)  → נועל את מסך הבית ב-overlay "Level Up"
 *                                  ומבקש buy-in (קבלה/דחייה).
 *   - daily_kickoff / pivot      → כרטיס עדין שאפשר לבטל (לא נועל).
 *
 * כל תגובה נשלחת חזרה ב-POST עם proposal_id + decision, והשרת מכריע.
 */

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Rocket, Heart, Sparkles, X } from 'lucide-react';
import { AnimatedDialog } from '../shared/AnimatedDialog';

type ProposalKind = 'level_up' | 'daily_kickoff' | 'pivot';

type ProgramProposal = {
  id: string;
  kind: ProposalKind;
  state: 'ready_to_advance' | 'maintaining' | 'struggling';
  headline: string;
  body: string;
  next_step: { title: string; detail?: string | null } | null;
  cta_accept_label: string;
  cta_decline_label: string;
  requires_buyin: boolean;
};

type ProposalResponse = {
  program_state: string | null;
  proposal: ProgramProposal | null;
};

const KIND_ICON: Record<ProposalKind, React.ElementType> = {
  level_up: Rocket,
  daily_kickoff: Sparkles,
  pivot: Heart,
};

const KIND_ACCENT: Record<ProposalKind, string> = {
  level_up: '#047857',
  daily_kickoff: '#0ea5e9',
  pivot: '#7c3aed',
};

export function ProgramOrchestratorGate() {
  const [proposal, setProposal] = useState<ProgramProposal | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/ai/program/proposal', { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as ProposalResponse;
        if (!cancelled && json.proposal) setProposal(json.proposal);
      } catch {
        /* שקט — זו שכבת עידוד, לא חוסמת */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // נעילת גלילה כשה-Level Up פתוח (חוסם את מסך הבית).
  const isLocked = !!proposal && proposal.requires_buyin && !dismissed;
  useEffect(() => {
    if (!isLocked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isLocked]);

  const respond = useCallback(
    async (decision: 'accept' | 'decline') => {
      if (!proposal || submitting) return;
      setSubmitting(true);
      try {
        await fetch('/api/v1/ai/program/proposal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proposal_id: proposal.id, decision }),
        });
      } catch {
        /* גם אם נכשל — סוגרים מקומית כדי לא לתקוע את המשתמש */
      } finally {
        setDismissed(true);
        setProposal(null);
        setSubmitting(false);
      }
    },
    [proposal, submitting]
  );

  if (!proposal || dismissed) return null;

  const Icon = KIND_ICON[proposal.kind];
  const accent = KIND_ACCENT[proposal.kind];

  // ── Level Up — overlay נועל ──────────────────────────────────────
  if (proposal.requires_buyin) {
    return (
      <AnimatedDialog
        open
        onClose={() => respond('decline')}
        dismissOnBackdrop={false}
        zIndex={300}
        aria-label={proposal.headline}
        backdropClassName="absolute inset-0 bg-[rgba(2,28,22,0.55)] backdrop-blur-[6px]"
        panelClassName="max-w-md overflow-hidden rounded-[28px] bg-white shadow-2xl"
      >
            <div
              className="flex flex-col items-center px-6 pb-5 pt-7 text-center"
              style={{
                background:
                  'linear-gradient(160deg, #047857 0%, #059669 55%, #10b981 100%)',
              }}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20">
                <Icon className="h-7 w-7 text-white" strokeWidth={2.2} />
              </div>
              <p
                className="mt-3 text-[11px] font-bold uppercase tracking-widest text-white/80"
              >
                Level Up
              </p>
              <h2
                className="mt-1 text-xl font-black text-white"
                style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
              >
                {proposal.headline}
              </h2>
            </div>

            <div className="px-6 py-5">
              <p className="text-[15px] leading-relaxed text-emerald-950">{proposal.body}</p>

              {proposal.next_step && (
                <div
                  className="mt-4 rounded-2xl border p-4"
                  style={{ borderColor: `${accent}33`, background: `${accent}0d` }}
                >
                  <p className="text-[13px] font-extrabold text-emerald-900">
                    הצעד הבא: {proposal.next_step.title}
                  </p>
                  {proposal.next_step.detail && (
                    <p className="mt-1 text-[12px] leading-relaxed text-emerald-800/80">
                      {proposal.next_step.detail}
                    </p>
                  )}
                </div>
              )}

              <div className="mt-6 flex flex-col gap-2.5">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => respond('accept')}
                  className="w-full rounded-2xl py-3.5 text-[15px] font-extrabold text-white transition active:scale-[0.98] disabled:opacity-60"
                  style={{ background: 'linear-gradient(145deg, #047857, #10b981)' }}
                >
                  {proposal.cta_accept_label}
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => respond('decline')}
                  className="w-full rounded-2xl py-3 text-[14px] font-bold text-emerald-800/70 transition active:scale-[0.98] disabled:opacity-60"
                >
                  {proposal.cta_decline_label}
                </button>
              </div>
            </div>
      </AnimatedDialog>
    );
  }

  // ── daily_kickoff / pivot — כרטיס עדין (לא נועל) ─────────────────
  return (
    <motion.div
      dir="rtl"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-surface relative overflow-hidden p-4"
      style={{ borderRadius: '22px', border: `1px solid ${accent}33` }}
    >
      <button
        type="button"
        aria-label="סגירה"
        onClick={() => respond('decline')}
        disabled={submitting}
        className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-emerald-900/40 transition hover:bg-black/5"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex flex-row-reverse items-start gap-3.5">
        <div
          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl"
          style={{ background: `linear-gradient(145deg, ${accent}, ${accent}cc)` }}
        >
          <Icon className="h-6 w-6 text-white" strokeWidth={2.2} />
        </div>
        <div className="flex-1 pl-6 text-right">
          <p
            className="text-[15px] font-extrabold text-emerald-950"
            style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
          >
            {proposal.headline}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-emerald-900/80">{proposal.body}</p>
          <button
            type="button"
            disabled={submitting}
            onClick={() => respond('accept')}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
            style={{ background: `linear-gradient(145deg, ${accent}, ${accent}cc)` }}
          >
            {proposal.cta_accept_label}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
