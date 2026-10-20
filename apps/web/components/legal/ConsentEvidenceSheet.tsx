'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MotionConfig } from 'framer-motion';
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

export const MAX_SHEET_SEGMENTS = 6;
/** Segment height as a multiple of the capture width: tall strips so the PDF can lay 3 side by side, full page height. */
const SEG_ASPECT = 2.9;
const CAP_W = 1080;

function encode(c: HTMLCanvasElement): string {
  for (const q of [0.82, 0.68, 0.55]) {
    const url = c.toDataURL('image/webp', q);
    if (!url.startsWith('data:image/webp')) return c.toDataURL('image/jpeg', 0.72);
    if (url.length * 0.75 < 200_000 || q === 0.55) return url;
  }
  return c.toDataURL('image/webp', 0.55);
}

/**
 * Temporarily un-clips the live sheet so the WHOLE content (top to the checkbox + typed word + buttons)
 * is laid out at its natural height with no scrollbars: removes max-height/overflow on the sheet and on
 * every scrollable descendant, hides scrollbars, and pins the width so nothing wraps differently.
 * Returns a restore function. This is the root-cause fix for viewport-cropped captures with scrollbars.
 */
export function expandForCapture(node: HTMLElement): () => void {
  const touched: Array<[HTMLElement, string | null]> = [];
  const set = (el: HTMLElement, css: string) => {
    touched.push([el, el.getAttribute('style')]);
    el.setAttribute('style', `${el.getAttribute('style') ?? ''};${css}`);
  };
  const width = node.getBoundingClientRect().width;
  set(node, `max-height:none!important;height:auto!important;overflow:visible!important;width:${width}px!important;scrollbar-width:none!important`);
  node.querySelectorAll<HTMLElement>('*').forEach((el) => {
    const cs = getComputedStyle(el);
    if (/(auto|scroll|hidden)/.test(cs.overflowY + cs.overflowX) && el.scrollHeight > el.clientHeight + 1) {
      set(el, 'max-height:none!important;height:auto!important;overflow:visible!important;scrollbar-width:none!important');
    }
  });
  node.setAttribute('data-capturing', '1');
  return () => {
    node.removeAttribute('data-capturing');
    for (const [el, st] of touched.reverse()) (st == null ? el.removeAttribute('style') : el.setAttribute('style', st));
  };
}

/**
 * Captures the WHOLE sheet top to bottom (including the checkbox + typed word in their final state),
 * not just the visible scroll area. Tall sheets are split into ordered strips (≤6, each ≤2.9× the width);
 * each strip is hashed and signed server-side exactly as stored. Best-effort.
 */
export async function captureSheet(node: HTMLElement): Promise<string[]> {
  const restore = expandForCapture(node);
  try {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const { toCanvas } = await import('html-to-image');
    const w0 = Math.ceil(node.getBoundingClientRect().width);
    const fullH = Math.ceil(Math.max(node.scrollHeight, node.getBoundingClientRect().height));
    const ratio = Math.min(2.5, CAP_W / Math.max(1, w0));
    const canvas = await toCanvas(node, {
      pixelRatio: ratio,
      cacheBust: true,
      backgroundColor: '#eef3e4',
      width: w0,
      height: fullH,
      canvasWidth: w0,
      canvasHeight: fullH,
      style: { maxHeight: 'none', height: `${fullH}px`, overflow: 'visible', transform: 'none', margin: '0' },
    });
    const w = canvas.width;
    const totalH = canvas.height;
    const n = Math.min(MAX_SHEET_SEGMENTS, Math.max(1, Math.ceil(totalH / (w * SEG_ASPECT))));
    const segH = Math.ceil(totalH / n);
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const seg = document.createElement('canvas');
      seg.width = w;
      seg.height = Math.min(segH, totalH - i * segH);
      seg.getContext('2d')?.drawImage(canvas, 0, i * segH, w, seg.height, 0, 0, w, seg.height);
      out.push(encode(seg));
    }
    return out;
  } catch {
    return [];
  } finally {
    restore();
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

  // iOS sheets open at the top: the dialog's initial focus can scroll the inner panel to the checkbox.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => panel.current?.scrollTo({ top: 0 }), 80);
    return () => window.clearTimeout(id);
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

  const accent = withdraw ? 'from-rose-500 to-amber-500' : 'from-emerald-600 to-teal-500';
  const hair = 'border-emerald-900/10 contrast-more:border-slate-700';

  return (
    <MotionConfig reducedMotion="user">
    <AnimatedDialog
      open={open}
      onClose={() => !busy && onClose()}
      variant="sheet"
      zIndex={520}
      aria-labelledby="consent-ev-title"
      dismissOnBackdrop={!busy}
      backdropClassName="absolute inset-0 bg-emerald-950/45 backdrop-blur-[6px]"
      panelClassName="w-full max-w-xl mx-auto rounded-t-[28px] sm:rounded-[28px] sm:mb-6 overflow-hidden ring-1 ring-emerald-900/10 shadow-[0_-1px_0_rgba(255,255,255,0.35)_inset,0_2px_6px_rgba(6,40,30,0.08),0_18px_40px_-12px_rgba(6,40,30,0.30),0_40px_90px_-30px_rgba(6,40,30,0.45)]"
    >
      <div
        ref={panel}
        dir="rtl"
        data-testid="consent-evidence-sheet"
        className="relative max-h-[86dvh] overflow-y-auto overscroll-contain [&[data-capturing]::-webkit-scrollbar]:hidden [&[data-capturing]]:[scrollbar-width:none] bg-[linear-gradient(180deg,rgba(238,243,228,0.96),rgba(231,238,220,0.95)_60%,rgba(243,236,220,0.96))] px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2.5 text-right font-[family-name:var(--font-assistant,inherit)] text-slate-800 backdrop-blur-2xl backdrop-saturate-150 contrast-more:bg-glass-hi sm:px-6 sm:pt-5"
      >
        <div className="mx-auto mb-4 h-[5px] w-9 rounded-full bg-emerald-950/20 contrast-more:bg-slate-700 sm:hidden" aria-hidden />
        <div className="flex flex-col items-center px-2 text-center">
          <span className={`grid h-14 w-14 place-items-center rounded-[18px] bg-gradient-to-br ${accent} text-white shadow-[0_8px_20px_-6px_rgba(4,120,87,0.45),inset_0_1px_0_rgba(255,255,255,0.35)] ring-1 ring-amber-300/50`}>
            {withdraw ? <Trash2 className="h-6 w-6" aria-hidden /> : <HeartPulse className="h-6 w-6" aria-hidden />}
          </span>
          <h2 id="consent-ev-title" className="mt-3 font-[family-name:var(--font-rubik,inherit)] text-[22px] font-bold leading-tight tracking-[-0.01em] text-emerald-950 contrast-more:text-black">
            {t.title}
          </h2>
          <p className="mt-1.5 max-w-md text-[15px] leading-relaxed text-slate-600 contrast-more:text-slate-900">{t.intro}</p>
        </div>

        <div className={`mt-5 overflow-hidden rounded-[20px] border ${hair} bg-glass-hi/80 shadow-[0_1px_2px_rgba(6,40,30,0.06)]`}>
          {t.sections.map((s, i) => (
            <section key={s.heading} className={`relative px-4 py-3.5 ${i > 0 ? 'before:absolute before:left-0 before:right-12 before:top-0 before:h-px before:bg-emerald-900/10 contrast-more:before:bg-slate-700' : ''}`}>
              <h3 className="mb-1 flex items-center gap-2.5 font-[family-name:var(--font-rubik,inherit)] text-[15px] font-semibold text-emerald-950 contrast-more:text-black">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-200 to-amber-400 text-[12px] font-bold text-amber-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">{i + 1}</span>
                {s.heading}
              </h3>
              <ul className="space-y-1 pr-[2.6rem] text-[14px] leading-relaxed text-slate-700 contrast-more:text-slate-900">
                {s.items.map((it) => (
                  <li key={it} className="list-disc marker:text-amber-600">{it}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="mt-3 flex items-start gap-2 px-3 text-[13px] leading-relaxed text-slate-500 contrast-more:text-slate-900">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
          <span>
            {t.transparency} {t.why}
          </span>
        </p>

        <div className={`mt-4 overflow-hidden rounded-[20px] border ${hair} bg-glass-hi/80 shadow-[0_1px_2px_rgba(6,40,30,0.06)]`}>
          <label className="flex min-h-[52px] cursor-pointer items-start gap-3 px-4 py-3.5 active:bg-emerald-900/[0.04]">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="peer sr-only"
              data-testid="consent-checkbox"
            />
            <span
              aria-hidden
              className={`mt-0.5 grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border-[1.5px] transition-all duration-200 motion-reduce:transition-none ${checked ? 'scale-100 border-emerald-600 bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_3px_8px_-2px_rgba(4,120,87,0.5)]' : 'border-emerald-900/30 bg-glass contrast-more:border-slate-800'} peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-400 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-glass-hi`}
            >
              {checked ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
            </span>
            <span className="text-[15px] font-semibold leading-relaxed text-emerald-950 contrast-more:text-black">{t.checkboxLabel}</span>
          </label>
          <label className="relative block px-4 pb-4 pt-3.5 before:absolute before:left-0 before:right-4 before:top-0 before:h-px before:bg-emerald-900/10 contrast-more:before:bg-slate-700">
            <span className="text-[14px] text-slate-600 contrast-more:text-slate-900">{t.typePrompt}</span>
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
              className={`mt-2 w-full rounded-[14px] border bg-glass px-4 py-3 text-[17px] font-semibold text-emerald-950 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:ring-4 motion-reduce:transition-none contrast-more:border-slate-800 ${typed && wordOk ? 'border-emerald-500 focus:ring-emerald-300/50' : 'border-emerald-900/15 focus:border-amber-400 focus:ring-amber-300/40'}`}
              placeholder={t.expectedWord}
            />
          </label>
        </div>

        {error ? <p role="alert" className="mt-3 rounded-[14px] border border-rose-200 bg-glass-rose px-3.5 py-2.5 text-sm font-semibold text-rose-700">{error}</p> : null}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            onClick={submit}
            disabled={!ready}
            data-testid="consent-submit"
            className={`flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-l ${accent} px-6 font-[family-name:var(--font-rubik,inherit)] text-[17px] font-semibold text-white shadow-[0_10px_24px_-10px_rgba(4,120,87,0.65),inset_0_1px_0_rgba(255,255,255,0.3)] ring-1 ring-amber-300/40 transition active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none`}
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-label="שומר" /> : t.submitLabel}
          </button>
          <button type="button" onClick={onClose} disabled={busy} className="min-h-[48px] flex-1 rounded-full px-5 text-[16px] font-semibold text-emerald-800 transition hover:bg-emerald-900/[0.05] active:bg-emerald-900/[0.08] motion-reduce:transition-none contrast-more:underline">
            {dismissLabel ?? 'לא עכשיו'}
          </button>
        </div>
      </div>
    </AnimatedDialog>
    </MotionConfig>
  );
}
