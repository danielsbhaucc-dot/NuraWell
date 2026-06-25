'use client';

import type { ReactNode } from 'react';
import { MapPin, CheckCircle2, XCircle } from 'lucide-react';

const QUIZ_PIN_COLORS = [
  { bg: 'linear-gradient(145deg, #ecfdf5 0%, #d1fae5 100%)', border: 'rgba(16,185,129,0.35)', tag: '#047857', pin: '#10b981' },
  { bg: 'linear-gradient(145deg, #f0fdfa 0%, #ccfbf1 100%)', border: 'rgba(20,184,166,0.35)', tag: '#0f766e', pin: '#14b8a6' },
  { bg: 'linear-gradient(145deg, #eff6ff 0%, #dbeafe 100%)', border: 'rgba(59,130,246,0.3)', tag: '#1d4ed8', pin: '#3b82f6' },
  { bg: 'linear-gradient(145deg, #f5f3ff 0%, #ede9fe 100%)', border: 'rgba(139,92,246,0.3)', tag: '#6d28d9', pin: '#8b5cf6' },
] as const;

const GAME_PIN_COLORS = [
  { bg: 'linear-gradient(145deg, #fffbeb 0%, #fef3c7 100%)', border: 'rgba(245,158,11,0.35)', tag: '#b45309', pin: '#f59e0b' },
  { bg: 'linear-gradient(145deg, #fff7ed 0%, #ffedd5 100%)', border: 'rgba(249,115,22,0.32)', tag: '#c2410c', pin: '#f97316' },
  { bg: 'linear-gradient(145deg, #fef2f2 0%, #fee2e2 100%)', border: 'rgba(244,63,94,0.28)', tag: '#be123c', pin: '#f43f5e' },
  { bg: 'linear-gradient(145deg, #fdf4ff 0%, #fae8ff 100%)', border: 'rgba(192,132,252,0.32)', tag: '#7e22ce', pin: '#a855f7' },
] as const;

type MapPalette = { bg: string; border: string; tag: string; pin: string };

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
      className="relative rounded-[22px] p-4 pt-5 overflow-hidden"
      style={{
        background: palette.bg,
        border: `1.5px solid ${palette.border}`,
        boxShadow: '0 8px 24px rgba(6,78,59,0.08)',
      }}
    >
      <div
        className="absolute top-3 left-3 flex h-8 w-8 items-center justify-center rounded-full shadow-sm"
        style={{ background: `${palette.pin}22`, border: `1px solid ${palette.pin}55` }}
        aria-hidden
      >
        <MapPin className="h-4 w-4" style={{ color: palette.pin }} />
      </div>

      <div className="flex items-start justify-between gap-2 mb-3 pr-1">
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
        <span
          className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full shrink-0"
          style={{
            background: ok ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.15)',
            color: ok ? '#047857' : '#b91c1c',
            border: ok ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(239,68,68,0.28)',
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
}: {
  index: number;
  question: string;
  pickedLabel: string;
  correctLabel?: string;
  ok: boolean;
  explanation: string;
}) {
  const palette = QUIZ_PIN_COLORS[index % QUIZ_PIN_COLORS.length]!;
  return (
    <ResultMapCardShell
      index={index}
      label="שאלה"
      ok={ok}
      okLabel="נכון"
      failLabel="צריך חיזוק"
      palette={palette}
    >
      <p className="text-[15px] font-black leading-relaxed mb-2.5" style={{ color: '#064e3b' }}>
        {question}
      </p>
      <p className="text-xs font-bold mb-1" style={{ color: '#047857' }}>
        מה שענית:{' '}
        <span style={{ color: ok ? '#059669' : '#dc2626' }}>{pickedLabel}</span>
      </p>
      {!ok && correctLabel ? (
        <p className="text-xs font-bold mb-1" style={{ color: '#065f46' }}>
          התשובה הנכונה: <span className="text-emerald-700">{correctLabel}</span>
        </p>
      ) : null}
      <p
        className="text-xs font-semibold leading-relaxed mt-2.5 pt-2.5 border-t"
        style={{ color: '#134e4a', borderColor: `${palette.pin}30` }}
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
}: {
  index: number;
  statement: string;
  pickedLabel: string;
  correctLabel: string;
  ok: boolean;
  explanation: string;
}) {
  const palette = GAME_PIN_COLORS[index % GAME_PIN_COLORS.length]!;
  return (
    <ResultMapCardShell
      index={index}
      label="משפט"
      ok={ok}
      okLabel="פגעת בול"
      failLabel="שווה חידוד"
      palette={palette}
    >
      <p className="text-[15px] font-black leading-relaxed mb-2.5" style={{ color: '#78350f' }}>
        &ldquo;{statement}&rdquo;
      </p>
      <p className="text-xs font-bold mb-1" style={{ color: '#b45309' }}>
        מה שסימנת:{' '}
        <span style={{ color: ok ? '#059669' : '#dc2626' }}>{pickedLabel}</span>
        {' · '}
        נכון: <span className="text-emerald-800">{correctLabel}</span>
      </p>
      <p
        className="text-xs font-semibold leading-relaxed mt-2.5 pt-2.5 border-t"
        style={{ color: '#92400e', borderColor: `${palette.pin}30` }}
      >
        {explanation}
      </p>
    </ResultMapCardShell>
  );
}
