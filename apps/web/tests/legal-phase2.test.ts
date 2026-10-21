import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { generatePassphrase, passphraseEntropyBits, PASSPHRASE_WORDS } from '@/lib/legal/passphrase';
import { encryptPdf, encryptZip, passwordVerifier } from '@/lib/legal/export-crypto';
import { verifyCode } from '@/lib/legal/verify-code';
import { normalizeFrom } from '@/lib/email/senders';
import { contentDisposition, exportLabel } from '@/lib/legal/export-store';
import { corroboration } from '@/lib/legal/evidence-provenance';
import { fetchSupabaseLogs, fetchVercelContext } from '@/lib/legal/platform-logs';

describe('passphrase', () => {
  it('4 Hebrew words + 2 digits joined by -', () => {
    for (let i = 0; i < 200; i++) {
      const p = generatePassphrase().split('-');
      expect(p).toHaveLength(5);
      expect(p.filter((x) => /^\d{2}$/.test(x))).toHaveLength(1);
      expect(/^\d/.test(p[0]!) || /^\d/.test(p[4]!)).toBe(false);
      for (const w of p.filter((x) => !/^\d+$/.test(x))) expect(PASSPHRASE_WORDS).toContain(w);
    }
  });
  it('entropy and uniqueness', () => {
    expect(passphraseEntropyBits()).toBeGreaterThan(47.5);
    expect(new Set(Array.from({ length: 500 }, generatePassphrase)).size).toBe(500);
  });
  it('verifier never contains the plaintext', () => {
    const pw = generatePassphrase();
    expect(JSON.stringify(passwordVerifier(pw))).not.toContain(pw);
  });
});

describe('export encryption', () => {
  it('PDF needs the password (AES-256)', async () => {
    const d = await PDFDocument.create(); d.addPage();
    const enc = await encryptPdf(await d.save(), 'אגם-אבן-12-אהיל-אוהל');
    const dir = mkdtempSync(path.join(tmpdir(), 'pdf-')); const f = path.join(dir, 'x.pdf');
    writeFileSync(f, enc);
    const raw = Buffer.from(enc).toString('latin1');
    expect(raw).toMatch(/\/V 5/); expect(raw).toMatch(/\/R 6/); expect(raw).toContain('/AESV3');
    let pdfinfo = true; try { execFileSync('pdfinfo', ['-v'], { stdio: 'ignore' }); } catch { pdfinfo = false; }
    if (pdfinfo) expect(() => execFileSync('pdfinfo', [f], { stdio: 'pipe' })).toThrow();
    // every generated passphrase must be encryptable (SASLprep bidi rule)
    for (let i = 0; i < 30; i++) await encryptPdf(await d.save(), generatePassphrase());
  });
  it('ZIP entries are AES encrypted and decrypt with the password', async () => {
    const enc = await encryptZip({ 'a.txt': new TextEncoder().encode('hello') }, 'pw-test-11');
    expect(enc.readUInt16LE(6) & 1).toBe(1);
    expect(enc.readUInt16LE(8)).toBe(99);
    const zip = await import('@zip.js/zip.js');
    const r = new zip.ZipReader(new zip.Uint8ArrayReader(new Uint8Array(enc)), { password: 'pw-test-11' });
    const [e] = await r.getEntries();
    expect(await (e as any).getData(new zip.TextWriter())).toBe('hello');
    const bad = new zip.ZipReader(new zip.Uint8ArrayReader(new Uint8Array(enc)), { password: 'wrong' });
    const [b] = await bad.getEntries();
    await expect((b as any).getData(new zip.TextWriter())).rejects.toThrow();
  });
});

describe('labels and codes', () => {
  it('verifyCode format', () => expect(verifyCode('ab'.repeat(32))).toBe('NW-ABAB-ABAB-ABAB'));
  it('normalizeFrom', () => {
    expect(normalizeFrom('"NuraWell <a@b.co>"')).toBe('NuraWell <a@b.co>');
    expect(normalizeFrom('a@b.co')).toBe('a@b.co');
    expect(normalizeFrom('NuraWell a@b')).toBeNull();
    expect(normalizeFrom('')).toBeNull();
  });
  it('exportLabel uses name or pseudonymous id, not a password', () => {
    expect(exportLabel('דנה כהן', 'u-1234567890', '2026-10-20T10:00:00Z', 'K7Q2').label).toBe('דנה כהן · 2026-10-20 · K7Q2');
    expect(exportLabel(null, 'abcdef1234', '2026-10-20T10:00:00Z', 'K7Q2').label).toBe('משתמש abcdef12 · 2026-10-20 · K7Q2');
    expect(exportLabel('a/b', 'x', '2026-10-20', 'C').fileBase).toBe('a_b_2026-10-20_C');
  });
  it('contentDisposition has ascii + utf8', () => {
    const h = contentDisposition('דנה 2026.pdf');
    expect(h).toMatch(/filename="[\x20-\x7e]+"/);
    expect(h).toContain("filename*=UTF-8''" + encodeURIComponent('דנה 2026.pdf'));
  });
});

describe('corroboration linking', () => {
  const r = { id: 'ev1', action: 'grant', created_at: '2026-10-01T10:00:00Z' } as any;
  it('links by evidence_id, falls back to time window, rejects other ids', () => {
    const rows = corroboration(r, [
      { created_at: '2026-10-01T12:00:00Z', path: 'health_consent_granted', detail: { evidence_id: 'ev1' } },
      { created_at: '2026-10-01T10:00:30Z', path: 'health_consent_granted', detail: {} },
      { created_at: '2026-10-01T10:00:10Z', path: 'health_consent_granted', detail: { evidence_id: 'other' } },
      { created_at: '2026-10-01T10:30:00Z', path: 'health_consent_granted', detail: {} },
    ] as any, [{ created_at: '2026-10-01T10:00:01Z', granted: true, evidence_id: 'ev1' }] as any);
    expect(rows.map((x) => `${x.source}:${x.link}`)).toEqual(['consent_history:evidence_id', 'admin_audit_log:evidence_id', 'admin_audit_log:time_window']);
  });
});

describe('platform logs', () => {
  it('not_configured without tokens and no fetch', async () => {
    delete process.env.LEGAL_LOGS_SUPABASE_TOKEN; delete process.env.LEGAL_LOGS_VERCEL_TOKEN;
    const f = (() => { throw new Error('no fetch'); }) as any;
    expect((await fetchSupabaseLogs('00000000-0000-0000-0000-000000000001', '2026-10-01T10:00:00Z', null)).status).toBe('not_configured');
    const rpc = { rpc: async () => ({ data: [{ source: 'auth.audit_log_entries', action: 'login' }], error: null }) };
    expect((await fetchSupabaseLogs('00000000-0000-0000-0000-000000000001', '2026-10-01T10:00:00Z', rpc)).status).toBe('ok');
    expect((await fetchVercelContext('2026-10-01T10:00:00Z', null, f)).status).toBe('not_configured');
  });
});

describe('failure path', () => {
  it('flags every failed check, fails first', async () => {
    const { findIssues } = await import('@/lib/legal/evidence-pdf');
    const ev = (over: any) => ({ checks: [], tsa: { ok: true }, screenshotSha: 'a', screenshotShaComputed: 'a', otsCalendars: ['x'], otsStatus: [{ status: 'bitcoin' }], emailReceipt: { ok: true }, ...over });
    const issues = findIssues({
      events: [
        ev({ checks: [{ label: 'חתימה', ok: false }] }),
        ev({ screenshotShaComputed: 'b', tsa: { ok: false }, otsStatus: [{ status: 'pending' }] }),
        ev({ screenshotSegments: [{ i: 2, sha256: 'c', computed: null }] }),
      ] as any,
      providerLogs: [{ provider: 'Vercel', status: 'empty' }],
    });
    const keys = issues.map((i) => i.key);
    expect(keys).toEqual(expect.arrayContaining(['signature', 'shot_mismatch', 'tsa', 'seg_gone', 'ots_pending', 'logs_Vercel']));
    expect(issues[0]!.level).toBe('fail');
    expect(issues.find((i) => i.key === 'signature')!.events).toEqual([1]);
    expect(findIssues({ events: [ev({})] as any })).toEqual([]);
  });
});

describe('legal provider tokens guard', () => {
  it('blocks + audits + alerts outside an evidence request; audits each use inside', async () => {
    const { runEvidenceRequest, legalToken, __setLegalTokenHooks } = await import('@/lib/legal/legal-tokens');
    const { fetchVercelContext, fetchSupabaseProviderLogs } = await import('@/lib/legal/platform-logs');
    const rows: any[] = []; const alerts: string[] = [];
    const db = { from: () => ({ insert: (r: any) => { rows.push(r); return Promise.resolve({}); } }) } as any;
    __setLegalTokenHooks({ alert: async (_d, t) => { alerts.push(t); }, db: () => db });
    process.env.LEGAL_LOGS_VERCEL_TOKEN = 'v-test'; process.env.LEGAL_LOGS_SUPABASE_TOKEN = 's-test';
    process.env.VERCEL_PROJECT_ID = 'prj_x'; process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abcxyz.supabase.co';
    const seen: string[] = [];
    const f = (async (url: string, init: any) => { seen.push(`${url.split('?')[0]} ${init.headers.Authorization}`); return new Response(JSON.stringify(url.includes('vercel') ? { deployments: [] } : { result: [{ timestamp: 1 }] }), { status: 200 }); }) as any;

    expect(await legalToken('vercel', 'test')).toBeNull();
    expect((await fetchVercelContext('2026-10-01T10:00:00Z', null, f)).note).toBe('token_blocked_outside_evidence_request');
    expect(seen).toHaveLength(0);
    expect(rows.filter((r) => r.action === 'legal_token_misuse')).toHaveLength(2);
    expect(alerts).toHaveLength(2);

    await expect(runEvidenceRequest({ db, actorId: 'a', subjectUserId: 'u', evidenceId: 'e', stepUp: false }, async () => 1)).rejects.toThrow();
    const uid = '00000000-0000-0000-0000-000000000001';
    const [vc, sp] = await runEvidenceRequest({ db, actorId: 'admin1', subjectUserId: uid, evidenceId: 'ev1', stepUp: true }, () =>
      Promise.all([fetchVercelContext('2026-10-01T10:00:00Z', null, f), fetchSupabaseProviderLogs(uid, '2026-10-01T10:00:00Z', f)]));
    expect(vc.status).toBe('empty'); expect(sp.status).toBe('ok');
    const used = rows.filter((r) => r.action === 'legal_token_used');
    expect(used.map((r) => r.detail.provider).sort()).toEqual(['supabase', 'vercel']);
    expect(used.every((r) => r.actor_id === 'admin1' && r.user_id === uid && r.detail.evidence_id === 'ev1' && r.detail.at)).toBe(true);
    expect(alerts).toHaveLength(2);
    expect(JSON.stringify(rows)).not.toContain('v-test');
    delete process.env.LEGAL_LOGS_VERCEL_TOKEN; delete process.env.LEGAL_LOGS_SUPABASE_TOKEN;
  });
});
