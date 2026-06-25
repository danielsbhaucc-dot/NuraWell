'use client';

import type { ReactNode } from 'react';
import { MapPin, CheckCircle2, XCircle } from 'lucide-react';

type MapPalette = { bg: string; border: string; tag: string; pin: string; text: string; muted: string };

const SUCCESS_PALETTES: MapPalette[] = [
  {
    bg: 'linear-gradient(145deg, #ecfdf5 0%, #d1fae5 100%)',
    border: 'rgba(16,185,129,0.38)',
    tag: '#047857',
    pin: '#10b981',
    text: '#064e3b',
    muted: '#065f46',
  },
  {
    bg: 'linear-gradient(145deg, #f0fdfa 0%, #ccfbf1 100%)',
    border: 'rgba(20,184,166,0.36)',
    tag: '#0f766e',
    pin: '#14b8a6',
    text: '#134e4a',
    muted: '#115e59',
  },
  {
    bg: 'linear-gradient(145deg, #f7fee7 0%, #d9f99d 55%, #ecfccb 100%)',
    border: 'rgba(132,204,22,0.34)',
    tag: '#3f6212',
    pin: '#84cc16',
    text: '#365314',
    muted: '#4d7c0f',
  },
];

const FAIL_PALETTES: MapPalette[] = [
  {
    bg: 'linear-gradient(145deg, #fef2f2 0%, #fecaca 100%)',
    border: 'rgba(239,68,68,0.36)',
    tag: '#b91c1c',
    pin: '#ef4444',
    text: '#7f1d1d',
    muted: '#991b1b',
  },
  {
    bg: 'linear-gradient(145deg, #fff1f2 0%, #fecdd3 100%)',
    border: 'rgba(244,63,94,0.34)',
    tag: '#be123c',
    pin: '#f43f5e',
    text: '#881337',
    muted: '#9f1239',
  },
  {
    bg: 'linear-gradient(145deg, #fdf2f8 0%, #fbcfe8 100%)',
    border: 'rgba(236,72,153,0.32)',
    tag: '#be185d',
    pin: '#ec4899',
    text: '#831843',
    muted: '#9d174d',
  },
];

function paletteFor(ok: boolean, index: number): MapPalette {
  const list = ok ? SUCCESS_PALETTES : FAIL_PALETTES;
  return list[index % list.length]!;
}

function ResultMapCardShell({
  index,
  label,
  ok,
  okLabel,
  failLabel,
  palette,
  children,
}: {
  index: number;
  label: string;
  ok: boolean;
  okLabel: string;
  failLabel: string;
  palette: MapPalette;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-[22px] p-4 overflow-hidden"
      style={{
        background: palette.bg,
        border: `1.5px solid ${palette.border}`,
        boxShadow: '0 8px 24px rgba(6,78,59,0.08)',
      }}
    >
      <div className="flex flex-col gap-2.5 mb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ background: `${palette.pin}22`, border: `1px solid ${palette.pin}55` }}
            aria-hidden
          >
            <MapPin className="h-4 w-4" style={{ color: palette.pin }} />
          </span>
          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-black tracking-wide"
            style={{
              background: `${palette.pin}18`,
              color: palette.tag,
              border: `1px solid ${palette.pin}40`,
            }}
          >
            {label} {index + 1}
          </span>
        </div>
        <span
          className="inline-flex w-fit items-center gap-1 self-start text-[11px] font-black px-2.5 py-1 rounded-full shrink-0 sm:self-center"
          style={{
            background: ok ? 'rgba(16,185,129,0.22)' : 'rgba(239,68,68,0.18)',
            color: ok ? '#047857' : '#b91c1c',
            border: ok ? '1px solid rgba(16,185,129,0.38)' : '1px solid rgba(239,68,68,0.32)',
          }}
        >
          {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
          {ok ? okLabel : failLabel}
        </span>
      </div>
      {children}
    </div>
  );
}

export function QuizResultMapCard({
  index,
  question,
  pickedLabel,
  correctLabel,
  ok,
  explanation,
  youAnsweredLabel = 'מה שענית',
}: {
  index: number;
  question: string;
  pickedLabel: string;
  correctLabel?: string;
  ok: boolean;
  explanation: string;
  youAnsweredLabel?: string;
}) {
  const palette = paletteFor(ok, index);
  return (
    <ResultMapCardShell
      index={index}
      label="שאלה"
      ok={ok}
      okLabel="נכון"
      failLabel="צריך חיזוק"
      palette={palette}
    >
      <p className="text-[15px] font-black leading-relaxed mb-2.5" style={{ color: palette.text }}>
        {question}
      </p>
      <p className="text-xs font-bold mb-1" style={{ color: palette.muted }}>
        {youAnsweredLabel}:{' '}
        <span style={{ color: ok ? '#059669' : '#dc2626' }}>{pickedLabel}</span>
      </p>
      {!ok && correctLabel ? (
        <p className="text-xs font-bold mb-1" style={{ color: palette.muted }}>
          התשובה הנכונה: <span className="text-emerald-700">{correctLabel}</span>
        </p>
      ) : null}
      <p
        className="text-xs font-semibold leading-relaxed mt-2.5 pt-2.5 border-t"
        style={{ color: palette.muted, borderColor: `${palette.pin}30` }}
      >
        {explanation}
      </p>
    </ResultMapCardShell>
  );
}

export function GameResultMapCard({
  index,
  statement,
  pickedLabel,
  correctLabel,
  ok,
  explanation,
  youMarkedLabel = 'מה שסימנת',
}: {
  index: number;
  statement: string;
  pickedLabel: string;
  correctLabel: string;
  ok: boolean;
  explanation: string;
  youMarkedLabel?: string;
}) {
  const palette = paletteFor(ok, index);
  return (
    <ResultMapCardShell
      index={index}
      label="משפט"
      ok={ok}
      okLabel="פגעת בול"
      failLabel="שווה חידוד"
      palette={palette}
    >
      <p className="text-[15px] font-black leading-relaxed mb-2.5" style={{ color: palette.text }}>
        &ldquo;{statement}&rdquo;
      </p>
      <p className="text-xs font-bold mb-1" style={{ color: palette.muted }}>
        {youMarkedLabel}:{' '}
        <span style={{ color: ok ? '#059669' : '#dc2626' }}>{pickedLabel}</span>
        {' · '}
        נכון: <span className="text-emerald-800">{correctLabel}</span>
      </p>
      <p
        className="text-xs font-semibold leading-relaxed mt-2.5 pt-2.5 border-t"
        style={{ color: palette.muted, borderColor: `${palette.pin}30` }}
      >
        {explanation}
      </p>
    </ResultMapCardShell>
  );
}
