import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __resetFieldCrypto, setDekStoreForTests } from '@/lib/security/field-crypto';
import { useMemDekStore } from '@/tests/helpers/mem-dek';
import { decryptInvoiceDocUrl, sealInvoiceDocUrl } from '@/lib/billing/invoice-doc-url';
import { runBillingInvoiceDocUrlBackfill } from '@/lib/privacy/billing-invoice-doc-url-backfill';

const DB = 'nurawell_stack_chain';
const TOKEN_URL = 'https://provider.example/invoice/abc.pdf?access_token=sekrit-token-value-xyz&exp=999';

function loadEnv() {
  for (const line of readFileSync('/workspace/local-lab-paired/secrets/next-a.env', 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) process.env[m[1]] = m[2];
  }
}
function psql(sql: string): string {
  return execFileSync('psql', ['-h', '127.0.0.1', '-U', 'postgres', '-d', DB, '-v', 'ON_ERROR_STOP=1', '-Atq'], {
    encoding: 'utf8', input: sql,
  }).trim();
}

describe('billing_invoices.doc_url seal (no billing writer feature)', () => {
  beforeEach(() => {
    loadEnv();
    useMemDekStore();
  });
  afterEach(() => {
    setDekStoreForTests(null);
    __resetFieldCrypto();
  });

  it('roundtrip seal/decrypt; ciphertext omits token; wrong user fails closed', async () => {
    const user = '11111111-1111-4111-8111-111111111111';
    const inv = '22222222-2222-4222-8222-222222222222';
    const sealed = await sealInvoiceDocUrl(user, inv, TOKEN_URL);
    expect(sealed.startsWith('enc:v2:')).toBe(true);
    expect(sealed).not.toContain('sekrit-token-value-xyz');
    expect(sealed).not.toContain(TOKEN_URL);
    expect(await decryptInvoiceDocUrl(user, inv, sealed)).toBe(TOKEN_URL);
    expect(await decryptInvoiceDocUrl('33333333-3333-4333-8333-333333333333', inv, sealed)).toBeNull();
    expect(await decryptInvoiceDocUrl(user, '44444444-4444-4444-8444-444444444444', sealed)).toBeNull();
  });

  it('legacy plaintext http URL decrypt path; non-url rejected', async () => {
    const user = '11111111-1111-4111-8111-111111111111';
    const inv = '22222222-2222-4222-8222-222222222222';
    expect(await decryptInvoiceDocUrl(user, inv, 'https://ok.example/a')).toBe('https://ok.example/a');
    expect(await decryptInvoiceDocUrl(user, inv, 'javascript:alert(1)')).toBeNull();
    expect(await decryptInvoiceDocUrl(user, inv, 'enc:v1:nope')).toBeNull();
  });

  it('backfill dry-run empty + synthetic legacy apply/idempotent (local PG)', async () => {
    __resetFieldCrypto();
    setDekStoreForTests(null); // real user_data_keys for admin fixture
    const uid = psql(`select id::text from public.profiles where role='admin' limit 1`);
    if (!uid) return;
    const id = psql(`insert into public.billing_invoices (user_id, provider, doc_type, doc_number, doc_url, total_agorot, vat_agorot)
      values ('${uid}', 'test', 'invoice_receipt', 'DOC-URL-TEST-1', '${TOKEN_URL.replace(/'/g, "''")}', 100, 17) returning id::text`);
    try {
      const rows = [{ id, user_id: uid, doc_url: TOKEN_URL }];
      const dry = await runBillingInvoiceDocUrlBackfill(rows, async () => false, false);
      expect(dry).toMatchObject({ examined: 1, planned: 1, written: 0, aborted: false });
      const write = async (rid: string, sealed: string, previous: string) => {
        const esc = (s: string) => s.replace(/'/g, "''");
        const out = psql(`update public.billing_invoices set doc_url='${esc(sealed)}' where id='${esc(rid)}' and doc_url='${esc(previous)}' and doc_url not like 'enc:%' returning id::text`);
        return out === rid;
      };
      const applied = await runBillingInvoiceDocUrlBackfill(rows, write, true);
      expect(applied).toMatchObject({ written: 1, aborted: false });
      const stored = psql(`select doc_url from public.billing_invoices where id='${id}'`);
      expect(stored.startsWith('enc:v2:')).toBe(true);
      expect(stored).not.toContain('sekrit-token-value-xyz');
      expect(await decryptInvoiceDocUrl(uid, id, stored)).toBe(TOKEN_URL);
      const again = await runBillingInvoiceDocUrlBackfill([{ id, user_id: uid, doc_url: stored }], write, true);
      expect(again).toMatchObject({ skipped: 1, written: 0, aborted: false });
    } finally {
      psql(`delete from public.billing_invoices where id='${id}'`);
    }
  }, 60_000);
});
