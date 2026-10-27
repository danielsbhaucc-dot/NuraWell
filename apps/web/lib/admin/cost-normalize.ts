import 'server-only';
/**
 * Normalizes receipts in the existing media_receipts index into cost fields:
 * service, fixed/usage, cost month, ILS at the Bank of Israel rate of the receipt day, VAT.
 * Server-side only; no personal data is written (amounts, dates, vendor ids).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { costVendor } from './cost-vendors';
import { boiUrl, parseBoiCsv, vatIncluded } from './fx-core';
import { parseInvoiceRef, parseVat } from '@/lib/legal/media/receipts-core';
import { receiptSearchText } from '@/lib/legal/media/receipt-search';

const memo = new Map<string, number>();

/** ILS per 1 unit of `currency` on `day` — cached in cost_fx_rates; BoI first, Frankfurter (ECB) fallback. */
export async function fxRate(admin: SupabaseClient, currency: string, day: string): Promise<number | null> {
  const cur = currency.toUpperCase();
  if (cur === 'ILS') return 1;
  const key = `${day}:${cur}`;
  if (memo.has(key)) return memo.get(key)!;
  const { data: hit } = await admin.from('cost_fx_rates').select('rate_ils').eq('day', day).eq('currency', cur).maybeSingle();
  if (hit) { const v = Number((hit as { rate_ils: number }).rate_ils); memo.set(key, v); return v; }
  let rate: number | null = null;
  let source = 'boi';
  try {
    const r = await fetch(boiUrl(cur, day), { signal: AbortSignal.timeout(6000), cache: 'no-store' });
    if (r.ok) rate = parseBoiCsv(await r.text(), day);
  } catch { /* fallback below */ }
  if (rate == null) {
    try {
      const r = await fetch(`https://api.frankfurter.dev/v1/${day}?from=${cur}&to=ILS`, { signal: AbortSignal.timeout(6000), cache: 'no-store' });
      if (r.ok) { const j = (await r.json()) as { rates?: { ILS?: number } }; rate = j.rates?.ILS ?? null; source = 'ecb'; }
    } catch { /* unknown */ }
  }
  if (rate == null) return null;
  memo.set(key, rate);
  if (day < new Date().toISOString().slice(0, 10)) await admin.from('cost_fx_rates').upsert({ day, currency: cur, rate_ils: rate, source });
  return rate;
}

/** Average USD→ILS for a month (mid-month rate, or today's for the current month). */
export async function monthUsdIls(admin: SupabaseClient, month: string, now = new Date()): Promise<number> {
  const today = now.toISOString().slice(0, 10);
  const mid = `${month}-15`;
  const day = mid > today ? new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10) : mid;
  return (await fxRate(admin, 'USD', day)) ?? 3.7;
}

type NormInput = { id: string; vendor: string; amount: number | null; currency: string | null; receipt_date: string | null; vat?: number | null; dedupe?: string | null };

export async function normalizeReceiptCost(admin: SupabaseClient, r: NormInput) {
  const v = costVendor(r.vendor);
  const day = r.receipt_date ?? new Date().toISOString().slice(0, 10);
  const cur = (r.currency ?? 'ILS').toUpperCase();
  const rate = r.amount == null ? null : await fxRate(admin, cur, day);
  const amountIls = r.amount != null && rate != null ? Math.round(r.amount * rate * 100) / 100 : null;
  let vatIls: number | null = null;
  if (r.vat != null && rate != null) vatIls = Math.round(r.vat * rate * 100) / 100;
  else if (cur === 'ILS' && amountIls) vatIls = vatIncluded(amountIls); // Israeli consumer charges include VAT
  const patch: Record<string, unknown> = {
    service: v.service, cost_kind: v.billing === 'prepaid' ? 'prepaid' : v.kind, cost_month: `${day.slice(0, 7)}-01`,
    fx_rate: rate, amount_ils: amountIls, vat_ils: vatIls, normalized_at: rate != null || r.amount == null ? new Date().toISOString() : null,
  };
  if (r.dedupe) patch.dedupe_key = r.dedupe;
  const { error } = await admin.from('media_receipts').update(patch).eq('id', r.id);
  if (error?.code === '23505' && r.dedupe) {
    // A second copy of an invoice we already have → keep the row (evidence) but mark it so it is never summed twice.
    await admin.from('media_receipts').update({ ...patch, dedupe_key: `${r.dedupe}:dup:${r.id}` }).eq('id', r.id);
  }
}

/** Lazily normalizes up to `limit` receipts that predate this feature or were stored by another path. */
export async function normalizePending(admin: SupabaseClient, limit = 50): Promise<number> {
  const { data } = await admin.from('media_receipts')
    .select('id, vendor, plan, amount, currency, receipt_date, subject, dedupe_key, source')
    .is('normalized_at', null).neq('source', 'gmail_confirmation').limit(limit);
  let n = 0;
  for (const row of (data ?? []) as Array<{ id: string; vendor: string; amount: number | null; currency: string | null; receipt_date: string | null; plan: string | null; subject: string | null; dedupe_key: string | null }>) {
    // same text the dropped generated search_text held, built from decrypted values
    const text = receiptSearchText(row);
    const dedupe = row.dedupe_key ? null : parseInvoiceRef(row.vendor, row.subject ?? '', text);
    await normalizeReceiptCost(admin, { id: row.id, vendor: row.vendor, amount: row.amount == null ? null : Number(row.amount), currency: row.currency, receipt_date: row.receipt_date, vat: parseVat(text), dedupe }).catch(() => null);
    n++;
  }
  return n;
}
