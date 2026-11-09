import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/central/parent-connect', () => ({ CLIENT_ID: 'nurawell', PARENT: 'https://parent.example' }));
vi.mock('@/lib/privacy/delete-user-account', () => ({ deleteUserAccountCompletely: vi.fn() }));
const { buildLegalSection, leaveParent } = await import('@/lib/central/parent-leave');

const SECRET = 's'.repeat(40);
const section = { product: 'nurawell' as const, requestedAt: '2026-11-09T00:00:00.000Z', policyVersionNow: 'v', consents: [], receipts: [] };

describe('parent leave (deletion lifecycle)', () => {
  it('posts the client secret, email and legal section to /id/product/leave', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: true, parent: 'scheduled', scheduledFor: '2026-12-09T00:00:00Z' }), { status: 200 }));
    const r = await leaveParent('synthetic@example.com', section, f as unknown as typeof fetch, SECRET);
    expect(r).toEqual({ ok: true, parent: 'scheduled', scheduledFor: '2026-12-09T00:00:00Z' });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://parent.example/id/product/leave/');
    expect(JSON.parse(String(init.body))).toMatchObject({ client_id: 'nurawell', client_secret: SECRET, email: 'synthetic@example.com', record: { product: 'nurawell' } });
  });

  it('fails closed when the parent is down, refuses, or the secret is missing', async () => {
    expect(await leaveParent('a@example.com', section, (async () => { throw new Error('down'); }) as unknown as typeof fetch, SECRET)).toEqual({ ok: false, error: 'unavailable' });
    expect(await leaveParent('a@example.com', section, (async () => new Response('{"error":"invalid_client"}', { status: 401 })) as unknown as typeof fetch, SECRET)).toEqual({ ok: false, error: 'unavailable' });
    expect(await leaveParent('a@example.com', section, vi.fn() as unknown as typeof fetch, 'short')).toEqual({ ok: false, error: 'config' });
  });

  it('the legal section carries consents and receipts only, never product content', async () => {
    const rows: Record<string, unknown[]> = {
      user_consents: [{ consent_type: 'terms', granted: true, choice: null, policy_version: '2026-10-20', created_at: '2026-10-21T00:00:00Z', evidence_id: 'e1' }],
      billing_events: [{ kind: 'payment', provider: 'mock', provider_event_id: 'p1', amount_ils: '49.00', created_at: '2026-10-22T00:00:00Z' }],
    };
    const chain = (t: string) => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: rows[t] }) }) }) }) });
    const admin = { from: (t: string) => chain(t) };
    const s = await buildLegalSection(admin as never, 'u1', new Date('2026-11-09T00:00:00Z'));
    expect(Object.keys(s).sort()).toEqual(['consents', 'policyVersionNow', 'product', 'receipts', 'requestedAt']);
    expect(s.consents[0]).toEqual({ type: 'terms', granted: true, choice: null, policyVersion: '2026-10-20', at: '2026-10-21T00:00:00Z', evidenceId: 'e1' });
    expect(s.receipts[0].amountIls).toBe(49);
  });

  it('profile deletion tells the parent first and deletes nothing when the parent is unreachable', async () => {
    const { deleteWithParent } = await import('@/lib/central/parent-leave');
    const empty = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }) }) };
    const order: string[] = [];
    const del = vi.fn(async () => { order.push('delete'); return { ok: true as const, vectorsRemoved: 0 }; });
    const ok = await deleteWithParent(empty as never, 'u1', 'a@example.com', { leave: async () => { order.push('leave'); return { ok: true, parent: 'scheduled', scheduledFor: 'x' }; }, del: del as never });
    expect(ok).toMatchObject({ ok: true, parent: 'scheduled', scheduledFor: 'x' });
    expect(order).toEqual(['leave', 'delete']);
    const down = vi.fn();
    const bad = await deleteWithParent(empty as never, 'u1', 'a@example.com', { leave: async () => ({ ok: false, error: 'unavailable' }), del: down as never });
    expect(bad).toMatchObject({ ok: false, status: 503 });
    expect(down).not.toHaveBeenCalled();
  });
});
