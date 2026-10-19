'use client';
/** Shared iOS-style glass primitives for Ops logs (activity + errors). */
import type { ReactNode } from 'react';
import { Bell, Bot, Clock, Cpu, KeyRound, LogIn, Mail, MonitorSmartphone, Send, ShieldAlert, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';

export type Status = 'success' | 'failed' | 'warning' | 'pending' | 'security' | 'info';

export const STATUS: Record<Status, { label: string; dot: string; pill: string; ring: string }> = {
  success: { label: 'הצליח', dot: 'bg-emerald-500', pill: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', ring: 'ring-emerald-400/30' },
  failed: { label: 'נכשל', dot: 'bg-rose-500', pill: 'bg-rose-500/15 text-rose-700 dark:text-rose-300', ring: 'ring-rose-400/40' },
  warning: { label: 'אזהרה', dot: 'bg-amber-500', pill: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', ring: 'ring-amber-400/40' },
  pending: { label: 'ממתין', dot: 'bg-sky-500', pill: 'bg-sky-500/15 text-sky-700 dark:text-sky-300', ring: 'ring-sky-400/30' },
  security: { label: 'אבטחה', dot: 'bg-violet-500', pill: 'bg-violet-500/15 text-violet-700 dark:text-violet-300', ring: 'ring-violet-400/40' },
  info: { label: 'מידע', dot: 'bg-slate-400', pill: 'bg-slate-500/10 text-slate-600 dark:text-slate-300', ring: 'ring-slate-300/30' },
};

const ICONS: Record<string, typeof LogIn> = { login: LogIn, email: Mail, telegram: Send, push: Bell, security: ShieldAlert, device: MonitorSmartphone, cron: Clock, ai: Sparkles, other: Cpu, gideon: Bot, key: KeyRound };
export function CatIcon({ cat, className }: { cat: string; className?: string }) {
  const I = ICONS[cat] ?? Cpu;
  return <I size={16} className={className} aria-hidden />;
}

export function Glass({ children, className, glow }: { children: ReactNode; className?: string; glow?: Status }) {
  return (
    <div className={cn(
      'rounded-3xl border border-white/50 bg-white/55 p-4 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.18)] backdrop-blur-xl backdrop-saturate-150 transition-all duration-300 dark:border-white/10 dark:bg-slate-900/45',
      glow && glow !== 'info' && glow !== 'success' && `ring-1 ${STATUS[glow].ring}`,
      className,
    )}>{children}</div>
  );
}

export function Pill({ status, children }: { status: Status; children?: ReactNode }) {
  const s = STATUS[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold', s.pill)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', s.dot, status === 'pending' && 'animate-pulse')} />
      {children ?? s.label}
    </span>
  );
}

export function Stat({ label, value, status, sub }: { label: string; value: ReactNode; status: Status; sub?: ReactNode }) {
  return (
    <Glass className="flex min-w-0 flex-col gap-1 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400"><span className={cn('h-2 w-2 rounded-full', STATUS[status].dot)} />{label}</div>
      <div className="font-display text-2xl font-black tabular-nums text-slate-900 dark:text-white">{value}</div>
      {sub ? <div className="text-[11px] text-slate-500 dark:text-slate-400">{sub}</div> : null}
    </Glass>
  );
}

export function Spark({ data, status = 'info' }: { data: number[]; status?: Status }) {
  const max = Math.max(1, ...data);
  return (
    <div className="flex h-6 items-end gap-0.5" aria-label="מגמה" dir="ltr">
      {data.map((v, i) => <span key={i} className={cn('w-1.5 rounded-sm opacity-80', STATUS[status].dot)} style={{ height: `${Math.max(8, (v / max) * 100)}%`, opacity: v ? 0.9 : 0.2 }} />)}
    </div>
  );
}

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn('shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold backdrop-blur-md transition', active ? 'bg-slate-900 text-white shadow dark:bg-white dark:text-slate-900' : 'bg-white/60 text-slate-600 hover:bg-white/90 dark:bg-white/10 dark:text-slate-300')}>{children}</button>
  );
}

export function Empty({ title, sub }: { title: string; sub?: string }) {
  return <Glass className="py-10 text-center"><div className="text-3xl">✨</div><div className="mt-2 font-bold text-slate-800 dark:text-slate-100">{title}</div>{sub ? <div className="mt-1 text-sm text-slate-500">{sub}</div> : null}</Glass>;
}

export function Skeleton() {
  return <div className="flex flex-col gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-3xl bg-white/40 dark:bg-white/5" />)}</div>;
}

export const fmtIl = (iso: string) => new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
export function ago(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return 'עכשיו';
  if (s < 3600) return `לפני ${Math.round(s / 60)} דק׳`;
  if (s < 86400) return `לפני ${Math.round(s / 3600)} שע׳`;
  return `לפני ${Math.round(s / 86400)} ימים`;
}
