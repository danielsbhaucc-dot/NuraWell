'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, HeartPulse, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { AnimatedDialog } from '@/components/shared/AnimatedDialog';
import { consentText, isAcceptedConsentWord, type ConsentAction, type ConsentGender } from '@/lib/legal/consent-text';

/** Device-side facts (browser-claimed; signed into the record but labelled as such in the report). */
export type ConsentClientMeta = {
  captured_at: string;
  screen_w: number;
  screen_h: number;
  viewport_w: number;
  viewport_h: number;
  dpr: number;
  typing_ms: number | null;
  tz: string | null;
};
export type ConsentCollected = { text_version: string; typed_word: string; checkbox: true; screenshot: string | null; screenshots?: string[]; client?: ConsentClientMeta };

type Props = {
  open: boolean;
  action: ConsentAction;
  gender: ConsentGender;
  onClose: () => void;
  /** submit: POSTs to the consent API. collect: returns the evidence fields to the caller (onboarding). */
  mode?: 'submit' | 'collect';
  source?: 'settings_privacy' | 'chat' | 'prompt';
  onDone: (r: { active?: boolean; reference?: string; collected?: ConsentCollected }) => void;
  /** optional secondary "not now" label (legacy prompt) */
  dismissLabel?: string;
};

export const MAX_SHEET_SEGMENTS = 4;
const SEG_H = 1600; // px per segment at 1080 wide

function encode(c: HTMLCanvasElement): string {
  for (const q of [0.8, 0.65, 0.5]) {
    const url = c.toDataURL('image/webp', q);
    if (!url.startsWith('data:image/webp')) return c.toDataURL('image/jpeg', 0.7);
    if (url.length * 0.75 < 140_000 || q === 0.5) return url;
  }
  return c.toDataURL('image/webp', 0.5);
}

/**
 * Captures the WHOLE sheet top to bottom (including the checkbox + typed word in their final state),
 * not just the visible scroll area. Tall sheets are split into ordered segments (≤4, ≤1600px each at
 * 1080px wide); each segment is hashed and signed server-side in order. Best-effort.
 */
async function captureSheet(node: HTMLElement): Promise<string[]> {
  try {
    const { toCanvas } = await import('html-to-image');
    const fullH = Math.max(node.scrollHeight, node.offsetHeight);
    const ratio = Math.min(2, 1080 / Math.max(1, node.offsetWidth));
    const canvas = await toCanvas(node, {
      pixelRatio: ratio,
      cacheBust: true,
      backgroundColor: '#fbfaf4',
      height: fullH,
      style: { maxHeight: 'none', height: `${fullH}px`, overflow: 'visible' },
    });
    const scale = canvas.width > 1080 ? 1080 / canvas.width : 1;
    const w = Math.round(canvas.width * scale);
    const totalH = Math.round(canvas.height * scale);
    const n = Math.min(MAX_SHEET_SEGMENTS, Math.max(1, Math.ceil(totalH / SEG_H)));
    const segH = Math.ceil(totalH / n);
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const seg = document.createElement('canvas');
      seg.width = w;
      seg.height = Math.min(segH, totalH - i * segH);
      seg.getContext('2d')?.drawImage(canvas, 0, (i * segH) / scale, canvas.width, seg.height / scale, 0, 0, w, seg.height);
      out.push(encode(seg));
    }
    return out;
  } catch {
    return [];
  }
}

export function ConsentEvidenceSheet({ open, action, gender, onClose, mode = 'submit', source = 'settings_privacy', onDone, dismissLabel }: Props) {
  const t = useMemo(() => consentText(action, gender), [action, gender]);
  const [checked, setChecked] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const typingStart = useRef<number | null>(null);
  const typingEnd = useRef<number | null>(null);
  const withdraw = action === 'withdraw';

  useEffect(() => {
    if (!open) {
      setChecked(false);
      setTyped('');
      typingStart.current = null;
      typingEnd.current = null;
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const wordOk = isAcceptedConsentWord(action, typed);
  const ready = checked && wordOk && !busy;

  const submit = async () => {
    if (!ready || !panel.current) return;
    setBusy(true);
    setError(null);
    const capturedAt = new Date().toISOString();
    const screenshots = await captureSheet(panel.current);
    const screenshot = screenshots[0] ?? null;
    const client: ConsentClientMeta = {
      captured_at: capturedAt,
      screen_w: Math.round(window.screen?.width ?? 0),
      screen_h: Math.round(window.screen?.height ?? 0),
      viewport_w: Math.round(window.innerWidth),
      viewport_h: Math.round(window.innerHeight),
      dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100,
      typing_ms: typingStart.current != null && typingEnd.current != null ? Math.max(0, Math.round(typingEnd.current - typingStart.current)) : null,
      tz: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null; } catch { return null; } })(),
    };
    const collected: ConsentCollected = { text_version: t.version, typed_word: typed.trim(), checkbox: true, screenshot, screenshots, client };
    if (mode === 'collect') {
      setBusy(false);
      onDone({ collected });
      return;
    }
    try {
      const res = await fetch('/api/v1/account/health-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...collected, source }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; active?: boolean; reference?: string };
      if (!res.ok) throw new Error(data.error ?? 'לא הצלחנו לשמור, אפשר לנסות שוב');
      onDone({ active: data.active, reference: data.reference });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'לא הצלחנו לשמור, אפשר לנסות שוב');
    } finally {
      setBusy(false);
    }
  };

  const accent = withdraw ? 'from-rose-500/90 to-amber-500/90' : 'from-emerald-500 to-teal-500';

  return (
    <AnimatedDialog
      open={open}
      onClose={() => !busy && onClose()}
      variant="sheet"
      zIndex={520}
      aria-labelledby="consent-ev-title"
      dismissOnBackdrop={!busy}
      panelClassName="w-full max-w-xl mx-auto rounded-t-[28px] sm:rounded-[28px] sm:mb-6 overflow-hidden shadow-2xl"
    >
      <div
        ref={panel}
        dir="rtl"
        data-testid="consent-evidence-sheet"
        className="relative max-h-[86dvh] overflow-y-auto bg-[linear-gradient(160deg,rgba(255,253,246,0.97),rgba(240,250,245,0.96)_55%,rgba(255,246,228,0.97))] px-5 pb-6 pt-5 text-right text-slate-800 backdrop-blur-xl sm:px-7"
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-300/70 sm:hidden" aria-hidden />
        <div className="flex items-start gap-3">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${accent} text-white shadow-lg shadow-emerald-900/10`}>
            {withdraw ? <Trash2 className="h-5 w-5" aria-hidden /> : <HeartPulse className="h-5 w-5" aria-hidden />}
          </span>
          <div className="min-w-0">
            <h2 id="consent-ev-title" className="font-[family-name:var(--font-rubik,inherit)] text-xl font-bold leading-tight text-slate-900">
              {t.title}
            </h2>
            <p className="mt-1 text-[15px] leading-relaxed text-slate-600">{t.intro}</p>
          </div>
        </div>

        <div className="mt-4 space-y-2.5">
          {t.sections.map((s, i) => (
            <section key={s.heading} className="rounded-2xl border border-white/70 bg-glass/60 p-3.5 shadow-sm backdrop-blur">
              <h3 className="mb-1.5 flex items-center gap-2 text-sm font-bold text-slate-900">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-100 text-[11px] font-bold text-amber-700">{i + 1}</span>
                {s.heading}
              </h3>
              <ul className="space-y-1 pr-7 text-[14px] leading-relaxed text-slate-700">
                {s.items.map((it) => (
                  <li key={it} className="list-disc marker:text-amber-500">{it}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="my-4 h-px bg-gradient-to-l from-transparent via-amber-300/80 to-transparent" aria-hidden />

        <p className="flex items-start gap-2 text-[13px] leading-relaxed text-slate-500">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
          <span>
            {t.transparency} {t.why}
          </span>
        </p>

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-emerald-200/70 bg-glass/70 backdrop-blur-md p-3.5">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="peer sr-only"
            data-testid="consent-checkbox"
          />
          <span
            aria-hidden
            className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2 transition ${checked ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-glass/85 backdrop-blur-md'} peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-400`}
          >
            {checked ? <Check className="h-4 w-4" /> : null}
          </span>
          <span className="text-[14px] font-semibold leading-relaxed text-slate-800">{t.checkboxLabel}</span>
        </label>

        <label className="mt-3 block">
          <span className="text-[14px] text-slate-700">{t.typePrompt}</span>
          <input
            type="text"
            value={typed}
            onChange={(e) => {
              const now = performance.now();
              if (typingStart.current == null) typingStart.current = now;
              typingEnd.current = now;
              setTyped(e.target.value);
            }}
            maxLength={30}
            autoComplete="off"
            inputMode="text"
            data-testid="consent-typed"
            aria-invalid={typed.length > 2 && !wordOk}
            className={`mt-1.5 w-full rounded-2xl border bg-glass/80 backdrop-blur-md px-4 py-3 text-lg font-semibold outline-none transition focus:ring-2 ${typed && wordOk ? 'border-emerald-400 focus:ring-emerald-300' : 'border-slate-200 focus:ring-amber-300'}`}
            placeholder={t.expectedWord.replace('/', ' / ')}
          />
        </label>

        {error ? <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p> : null}

        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row-reverse">
          <button
            type="button"
            onClick={submit}
            disabled={!ready}
            data-testid="consent-submit"
            className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-l ${accent} px-5 font-bold text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-45`}
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-label="שומר" /> : t.submitLabel}
          </button>
          <button type="button" onClick={onClose} disabled={busy} className="min-h-12 flex-1 rounded-2xl border border-slate-200 bg-glass/70 backdrop-blur-md px-5 font-semibold text-slate-700">
            {dismissLabel ?? 'לא עכשיו'}
          </button>
        </div>
      </div>
    </AnimatedDialog>
  );
}
