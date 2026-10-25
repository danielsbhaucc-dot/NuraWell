/**
 * Smart cost ledger — pure math (no I/O), so every number is unit-tested.
 *
 * Month truth per vendor (see cost-vendors.ts):
 *   invoice vendors  → the invoice once it arrives; until then the live estimate (flagged 'estimate').
 *   prepaid vendors  → metered consumption; credit top-ups are cash-out only (never summed → no double count).
 *   subscriptions    → the charged amount, spread over the paid period when it is longer than a month.
 *
 * Per-user algorithm (activity-based costing):
 *   variable_i = the user's own metered AI cost
 *              + shared variable pool (AI with no user, other usage vendors) × the user's usage share
 *   fixed_i    = fixed pool ÷ active users
 *   We report mean AND median (heavy users can't skew it), p90, per paying user, and the marginal
 *   cost of one more user (= median variable cost: fixed costs don't grow with one more user).
 */
import { COST_VENDORS, costVendor, type CostVendor } from './cost-vendors';

export type LedgerReceipt = {
  id: string;
  vendor: string;
  plan: string | null;
  amount: number | null;
  currency: string | null;
  amount_ils: number | null;
  vat_ils: number | null;
  receipt_date: string | null;
  period_start: string | null;
  period_end: string | null;
  trust: string;
  source: string;
  files: number;
};

export type MonthUsage = {
  month: string; // YYYY-MM
  /** metered AI cost per user (USD) */
  perUserUsd: Record<string, number>;
  /** metered AI cost with no user — crons, batch (USD) */
  sharedUsd: number;
  /** users active in the month (any activity), superset of perUserUsd keys */
  activeUserIds: string[];
  payingUsers: number;
  /** average USD→ILS for the month */
  usdIls: number;
};

export type VendorMonth = {
  vendor: string;
  label: string;
  category: CostVendor['category'];
  billing: CostVendor['billing'];
  kind: CostVendor['kind'];
  service: string;
  plan: string | null;
  ils: number;
  source: 'invoice' | 'estimate' | 'metered' | 'free' | 'subscription';
  invoiceIls: number;
  liveIls: number;
  cashOutIls: number;
  receipts: number;
};

export type MonthLedger = {
  month: string;
  partial: boolean;
  totalIls: number;
  fixedIls: number;
  variableIls: number;
  byVendor: VendorMonth[];
  activeUsers: number;
  payingUsers: number;
  perActiveMeanIls: number;
  perActiveMedianIls: number;
  perActiveP90Ils: number;
  perPayingIls: number | null;
  marginalIls: number;
};

export type Flag = { vendor: string; label: string; message: string; severity: 'warn' | 'info' };

const r2 = (n: number) => Math.round(n * 100) / 100;
export const monthOf = (iso: string) => iso.slice(0, 7);

export function monthsBack(now: Date, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate();
}

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function quantile(xs: number[], q: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

/** ILS value of a receipt: stored normalized value, else ILS amount as-is, else null (unknown FX). */
export function receiptIls(r: LedgerReceipt): number | null {
  if (r.amount_ils != null && Number.isFinite(Number(r.amount_ils))) return Number(r.amount_ils);
  if (r.amount == null) return null;
  if ((r.currency ?? 'ILS').toUpperCase() === 'ILS') return Number(r.amount);
  return null;
}

/** Month shares of a receipt: monthly charge → its month; a longer paid period → spread evenly. */
export function receiptMonthShares(r: LedgerReceipt): Array<{ month: string; share: number }> {
  const date = r.receipt_date ?? r.period_start;
  if (!date) return [];
  if (r.period_start && r.period_end) {
    const days = (Date.parse(r.period_end) - Date.parse(r.period_start)) / 86_400_000;
    if (days > 40) {
      const n = Math.max(1, Math.round(days / 30.44));
      const start = new Date(`${r.period_start}T00:00:00Z`);
      return Array.from({ length: n }, (_, i) => ({ month: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1)).toISOString().slice(0, 7), share: 1 / n }));
    }
  }
  return [{ month: monthOf(date), share: 1 }];
}

export function countable(r: LedgerReceipt) {
  return r.trust !== 'rejected' && r.source !== 'gmail_confirmation';
}

/** Live-usage estimate (ILS) per vendor for a month — only metered vendors have one today. */
function liveIlsFor(v: CostVendor, u: MonthUsage | undefined): number {
  if (!u || !v.metered) return 0;
  const usd = Object.values(u.perUserUsd).reduce((a, b) => a + b, 0) + u.sharedUsd;
  return usd * u.usdIls;
}

export function buildMonth(month: string, receipts: LedgerReceipt[], usage: MonthUsage | undefined, now: Date): MonthLedger {
  const partial = month === now.toISOString().slice(0, 7);
  const byVendor = new Map<string, VendorMonth>();
  const row = (id: string): VendorMonth => {
    let x = byVendor.get(id);
    if (!x) {
      const v = costVendor(id);
      x = { vendor: v.id === 'unknown' ? id : v.id, label: v.label, category: v.category, billing: v.billing, kind: v.kind, service: v.service, plan: v.plan ?? null, ils: 0, source: v.billing === 'free' ? 'free' : v.billing === 'prepaid' ? 'metered' : v.billing === 'subscription' ? 'subscription' : 'estimate', invoiceIls: 0, liveIls: 0, cashOutIls: 0, receipts: 0 };
      byVendor.set(id, x);
    }
    return x;
  };
  for (const r of receipts) {
    if (!countable(r)) continue;
    const ils = receiptIls(r);
    for (const s of receiptMonthShares(r)) {
      if (s.month !== month) continue;
      const x = row(r.vendor);
      x.receipts += 1;
      if (r.plan) x.plan = r.plan;
      if (ils == null) continue;
      if (x.billing === 'prepaid') x.cashOutIls += ils * s.share;
      else x.invoiceIls += ils * s.share;
    }
  }
  for (const v of COST_VENDORS) {
    if (v.id === 'unknown') continue;
    const live = liveIlsFor(v, usage);
    if (live > 0 || v.billing === 'free' || v.billing === 'prepaid' && v.metered) row(v.id).liveIls = live;
  }
  for (const x of byVendor.values()) {
    if (x.billing === 'prepaid') { x.ils = x.liveIls; x.source = 'metered'; }
    else if (x.invoiceIls > 0 || x.receipts > 0) { x.ils = x.invoiceIls; x.source = x.billing === 'subscription' ? 'subscription' : 'invoice'; }
    else if (x.billing === 'free') { x.ils = 0; x.source = 'free'; }
    else { x.ils = x.liveIls; x.source = 'estimate'; }
  }
  const list = [...byVendor.values()].sort((a, b) => b.ils - a.ils || a.label.localeCompare(b.label));
  const fixedIls = list.filter((x) => x.kind === 'fixed').reduce((a, x) => a + x.ils, 0);
  const variableIls = list.filter((x) => x.kind !== 'fixed').reduce((a, x) => a + x.ils, 0);
  const totalIls = fixedIls + variableIls;

  // Per-user allocation.
  const fx = usage?.usdIls ?? 0;
  const direct = new Map<string, number>();
  for (const id of usage?.activeUserIds ?? []) direct.set(id, 0);
  for (const [id, usd] of Object.entries(usage?.perUserUsd ?? {})) direct.set(id, (direct.get(id) ?? 0) + usd * fx);
  const directSum = [...direct.values()].reduce((a, b) => a + b, 0);
  const active = direct.size;
  const sharedVariable = Math.max(0, variableIls - directSum);
  const perUser: number[] = [];
  const perUserVar: number[] = [];
  for (const d of direct.values()) {
    const share = directSum > 0 ? d / directSum : 1 / active;
    const v = d + sharedVariable * share;
    perUserVar.push(v);
    perUser.push(v + fixedIls / active);
  }
  const paying = usage?.payingUsers ?? 0;
  return {
    month, partial,
    totalIls: r2(totalIls), fixedIls: r2(fixedIls), variableIls: r2(variableIls),
    byVendor: list.map((x) => ({ ...x, ils: r2(x.ils), invoiceIls: r2(x.invoiceIls), liveIls: r2(x.liveIls), cashOutIls: r2(x.cashOutIls) })),
    activeUsers: active, payingUsers: paying,
    perActiveMeanIls: active ? r2(totalIls / active) : 0,
    perActiveMedianIls: r2(median(perUser)),
    perActiveP90Ils: r2(quantile(perUser, 0.9)),
    perPayingIls: paying ? r2(totalIls / paying) : null,
    marginalIls: r2(median(perUserVar)),
  };
}

/** Current month run-rate: usage scales with elapsed days; fixed/invoiced amounts don't. Missing recurring charges assumed = last month. */
export function projectCurrentMonth(cur: MonthLedger, prev: MonthLedger | undefined, now: Date): number {
  const dim = daysInMonth(cur.month);
  const day = Math.max(1, now.getUTCDate());
  let total = 0;
  for (const x of cur.byVendor) {
    const usageLike = x.source === 'metered' || x.source === 'estimate';
    total += usageLike ? (x.ils * dim) / day : x.ils;
  }
  for (const p of prev?.byVendor ?? []) {
    if ((p.source === 'invoice' || p.source === 'subscription') && p.ils > 0) {
      const c = cur.byVendor.find((x) => x.vendor === p.vendor);
      if (!c || c.receipts === 0) total += p.ils;
    }
  }
  return r2(total);
}

/** Least-squares line through the months' totals → next month (never below 0). */
export function linearNext(values: number[]): number {
  const n = values.length;
  if (!n) return 0;
  if (n === 1) return r2(values[0]!);
  const xm = (n - 1) / 2;
  const ym = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  values.forEach((y, x) => { num += (x - xm) * (y - ym); den += (x - xm) ** 2; });
  const slope = den ? num / den : 0;
  return r2(Math.max(0, ym + slope * (n - xm)));
}

/** A vendor that charged in any of the previous months but not (yet) this month, past its usual day + grace. */
export function missingReceipts(receipts: LedgerReceipt[], months: string[], now: Date, graceDays = 3): Flag[] {
  const cur = months[months.length - 1]!;
  const prev = new Set(months.slice(0, -1));
  const seen = new Map<string, number[]>();
  const thisMonth = new Set<string>();
  for (const r of receipts) {
    if (!countable(r) || !r.receipt_date) continue;
    const v = costVendor(r.vendor);
    if (v.id === 'unknown' || v.billing === 'free' || v.billing === 'prepaid') continue;
    const m = monthOf(r.receipt_date);
    if (m === cur) thisMonth.add(v.id);
    if (prev.has(m)) seen.set(v.id, [...(seen.get(v.id) ?? []), Number(r.receipt_date.slice(8, 10))]);
  }
  const today = now.getUTCDate();
  const out: Flag[] = [];
  for (const [id, days] of seen) {
    if (thisMonth.has(id)) continue;
    const usual = Math.max(...days);
    if (today < Math.min(usual + graceDays, daysInMonth(cur))) continue;
    const v = costVendor(id);
    out.push({ vendor: id, label: v.label, severity: 'warn', message: `לא הגיעה קבלה החודש (בחודשים קודמים הגיעה עד ה-${usual} בחודש)` });
  }
  return out;
}

/** Vendor (or total) clearly above its own history: > 1.5× median of earlier months and ≥ ₪10 more. */
export function costSpikes(ledgers: MonthLedger[], projectedCurrent: number | null): Flag[] {
  if (ledgers.length < 2) return [];
  const cur = ledgers[ledgers.length - 1]!;
  const hist = ledgers.slice(0, -1);
  const out: Flag[] = [];
  const check = (label: string, vendor: string, now: number, past: number[]) => {
    const base = median(past.filter((x) => x > 0));
    if (base > 0 && now > base * 1.5 && now - base >= 10) out.push({ vendor, label, severity: 'warn', message: `קפיצה בעלות: ₪${r2(now)} לעומת ₪${r2(base)} בדרך כלל (×${(now / base).toFixed(1)})` });
  };
  const dim = daysInMonth(cur.month);
  const scale = cur.partial && projectedCurrent != null && cur.totalIls > 0 ? projectedCurrent / cur.totalIls : 1;
  for (const x of cur.byVendor) {
    const usageLike = x.source === 'metered' || x.source === 'estimate';
    const nowVal = usageLike && cur.partial ? x.ils * scale : x.ils;
    check(x.label, x.vendor, nowVal, hist.map((h) => h.byVendor.find((y) => y.vendor === x.vendor)?.ils ?? 0));
  }
  check('סך הכול', 'total', projectedCurrent ?? cur.totalIls, hist.map((h) => h.totalIls));
  void dim;
  return out;
}

export type LedgerReport = {
  months: MonthLedger[];
  current: MonthLedger;
  projectedCurrentIls: number;
  projectedNextIls: number;
  missing: Flag[];
  spikes: Flag[];
};

export function buildLedger(receipts: LedgerReceipt[], usage: MonthUsage[], now: Date, nMonths = 4): LedgerReport {
  const months = monthsBack(now, nMonths);
  const byMonth = new Map(usage.map((u) => [u.month, u]));
  const ledgers = months.map((m) => buildMonth(m, receipts, byMonth.get(m), now));
  const current = ledgers[ledgers.length - 1]!;
  const projectedCurrentIls = projectCurrentMonth(current, ledgers[ledgers.length - 2], now);
  const series = [...ledgers.slice(0, -1).map((l) => l.totalIls), projectedCurrentIls].slice(-3);
  return {
    months: ledgers,
    current,
    projectedCurrentIls,
    projectedNextIls: linearNext(series),
    missing: missingReceipts(receipts, months, now),
    spikes: costSpikes(ledgers, projectedCurrentIls),
  };
}
