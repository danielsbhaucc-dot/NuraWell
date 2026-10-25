import 'server-only';
/** Loads receipts + metered usage for the smart cost ledger and runs the pure engine. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildLedger, monthsBack, receiptIls, type LedgerReceipt, type MonthUsage } from './cost-ledger-core';
import { monthUsdIls, normalizePending } from './cost-normalize';
import { costVendor, COST_VENDORS } from './cost-vendors';

const PAGE = 1000;
async function pageAll<T>(run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; out.length < 200_000; from += PAGE) {
    const { data, error } = await run(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }
  return out;
}

type ReceiptRow = {
  id: string; vendor: string; plan: string | null; amount: number | null; currency: string | null; amount_ils: number | null; vat_ils: number | null;
  receipt_date: string | null; period_start: string | null; period_end: string | null; trust: string; source: string; subject: string | null;
  attachments: Array<{ sha256: string; name: string; mime: string }> | null; dedupe_key: string | null; created_at: string;
};

export async function loadCostLedger(admin: SupabaseClient, now = new Date(), nMonths = 4) {
  await normalizePending(admin).catch(() => 0);
  const months = monthsBack(now, nMonths);
  const since = `${months[0]}-01`;
  const sinceIso = `${since}T00:00:00Z`;
  const yearAgo = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1)).toISOString().slice(0, 10);

  const [receiptRows, usageRows, chatRows, profilesRes, subsRes] = await Promise.all([
    pageAll<ReceiptRow>((f, t) => admin.from('media_receipts')
      .select('id, vendor, plan, amount, currency, amount_ils, vat_ils, receipt_date, period_start, period_end, trust, source, subject, attachments, dedupe_key, created_at')
      .gte('receipt_date', yearAgo).order('receipt_date', { ascending: false }).range(f, t)),
    pageAll<{ user_id: string | null; cost_usd: number | string; created_at: string }>((f, t) => admin.from('ai_usage_events')
      .select('user_id, cost_usd, created_at').gte('created_at', sinceIso).range(f, t)),
    pageAll<{ user_id: string; created_at: string }>((f, t) => admin.from('ai_interactions')
      .select('user_id, created_at').eq('role', 'user').gte('created_at', sinceIso).range(f, t)),
    admin.from('profiles').select('id').eq('role', 'user').limit(50_000),
    admin.from('subscriptions').select('user_id, status, created_at, canceled_at').limit(50_000),
  ]);

  const real = new Set(((profilesRes.data ?? []) as Array<{ id: string }>).map((p) => p.id));
  const subs = (subsRes.data ?? []) as Array<{ user_id: string; status: string; created_at: string; canceled_at: string | null }>;

  const usage: MonthUsage[] = [];
  for (const m of months) {
    const perUserUsd: Record<string, number> = {};
    let sharedUsd = 0;
    const active = new Set<string>();
    for (const u of usageRows) {
      if (!u.created_at.startsWith(m)) continue;
      const c = Number(u.cost_usd) || 0;
      // Admin/test accounts and system jobs are operating cost → shared pool, not a "user".
      if (u.user_id && real.has(u.user_id)) { perUserUsd[u.user_id] = (perUserUsd[u.user_id] ?? 0) + c; active.add(u.user_id); }
      else sharedUsd += c;
    }
    for (const c of chatRows) if (c.created_at.startsWith(m) && real.has(c.user_id)) active.add(c.user_id);
    const end = `${m}-31T23:59:59Z`;
    const paying = new Set(subs.filter((s) => real.has(s.user_id) && (s.status === 'active' || s.status === 'past_due') && s.created_at <= end).map((s) => s.user_id)).size;
    usage.push({ month: m, perUserUsd, sharedUsd, activeUserIds: [...active], payingUsers: paying, usdIls: await monthUsdIls(admin, m, now) });
  }

  const receipts: LedgerReceipt[] = receiptRows
    .filter((r) => !(r.dedupe_key ?? '').includes(':dup:'))
    .map((r) => ({
      id: r.id, vendor: r.vendor, plan: r.plan, amount: r.amount == null ? null : Number(r.amount), currency: r.currency,
      amount_ils: r.amount_ils == null ? null : Number(r.amount_ils), vat_ils: r.vat_ils == null ? null : Number(r.vat_ils),
      receipt_date: r.receipt_date, period_start: r.period_start, period_end: r.period_end, trust: r.trust, source: r.source, files: 1 + (r.attachments?.length ?? 0),
    }));
  const report = buildLedger(receipts, usage, now, nMonths);

  const list = receiptRows.filter((r) => r.source !== 'gmail_confirmation' && (r.receipt_date ?? '') >= since).slice(0, 100).map((r) => {
    const v = costVendor(r.vendor);
    return {
      id: r.id, vendor: r.vendor, vendorLabel: v.label, category: v.category, plan: r.plan, subject: (r.subject ?? '').slice(0, 140),
      date: r.receipt_date, amount: r.amount == null ? null : Number(r.amount), currency: r.currency,
      ils: receiptIls({ ...receipts.find((x) => x.id === r.id)! } as LedgerReceipt) ?? null,
      vatIls: r.vat_ils == null ? null : Number(r.vat_ils), trust: r.trust, duplicate: (r.dedupe_key ?? '').includes(':dup:'),
      files: [{ i: -1, name: 'המייל המקורי (.eml)' }, ...(r.attachments ?? []).map((a, i) => ({ i, name: a.name }))],
    };
  });

  return {
    generatedAt: now.toISOString(),
    fx: { usdIls: usage[usage.length - 1]?.usdIls ?? null, source: 'בנק ישראל (שער יציג)' },
    ...report,
    receipts: list,
    coverage: COST_VENDORS.filter((v) => v.id !== 'unknown').map((v) => ({ id: v.id, label: v.label, billing: v.billing, autoReceipts: AUTO_RECEIPTS.has(v.id) })),
  };
}

/** Vendors whose receipts currently reach receipts@ automatically (forward filter / daily import). */
export const AUTO_RECEIPTS = new Set(['google', 'xai', 'openai', 'suno', 'x_premium']);
export type CostLedgerPayload = Awaited<ReturnType<typeof loadCostLedger>>;
