import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeDb } from './helpers/access-fake-db';

vi.mock('server-only', () => ({}));
const wa = vi.hoisted(() => ({ auth: vi.fn(), reg: vi.fn() }));
vi.mock('@simplewebauthn/server', () => ({
  generateAuthenticationOptions: vi.fn(async () => ({ challenge: 'c' })), generateRegistrationOptions: vi.fn(async () => ({ challenge: 'c' })),
  verifyAuthenticationResponse: wa.auth, verifyRegistrationResponse: wa.reg,
}));
const ch = vi.hoisted(() => ({ consume: vi.fn() }));
vi.mock('@/lib/auth/passkeys', () => ({ RP_NAME: 'X', storeChallenge: vi.fn(async () => 'sec'), consumeChallenge: ch.consume }));
const dt = vi.hoisted(() => ({ create: vi.fn(async () => 'dev-1.secret'), revoke: vi.fn(async () => true) }));
vi.mock('@/lib/ops/device-trust', () => ({ audit: vi.fn(async () => undefined), createTrustedDevice: dt.create, deviceLabel: () => 'Chrome · Mac', revokeDevice: dt.revoke }));
vi.mock('@/lib/ops/device-notify', () => ({ ownerAdminIds: async () => ['00000000-0000-0000-0000-0000000000aa'] }));
vi.mock('@/lib/ceo/channel', () => ({ allowedChatIds: () => ['42'] }));
vi.mock('@/lib/ops-host', () => ({ opsCanonicalHostname: () => 'ops.example.test' }));

import { completeFactor, decideMatch, finishEnrollment, issueEnrollmentLink, openEnrollment, registrationOptions } from '@/lib/ops/enrollment';
import { handleEnrollUpdate } from '@/lib/ops/enroll-telegram';

const UID = '00000000-0000-0000-0000-0000000000aa';
const ID = '00000000-0000-0000-0000-0000000000e1';
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const row = (o: Record<string, unknown> = {}) => ({ id: ID, user_id: UID, session_hash: 'x', ip_hash: 'iph', label: 'Chrome · Mac', location: 'TLV, IL', expires_at: iso(600_000),
  used_at: iso(-1000), revoked_at: null, factor_ok_at: null, factor_via: null, match_number: null, match_expires_at: null, match_decided_at: null, match_result: null, completed_at: null, ...o });
const TOKEN = 'A'.repeat(43);
beforeEach(() => { vi.clearAllMocks(); });

describe('link', () => {
  it('replay: second open of the same link fails (claim is single-use)', async () => {
    let used = false;
    const db = fakeDb({ rpc: { ops_claim_enrollment: () => (used ? [] : ((used = true), [{ id: ID, user_id: UID }])) } });
    const f = { ipHash: 'h', label: 'l', location: 'x' };
    expect((await openEnrollment(db as never, TOKEN, f)).ok).toBe(true);
    expect((await openEnrollment(db as never, TOKEN, f)).ok).toBe(false);
  });
  it('race: of two concurrent opens only one wins', async () => {
    let used = false;
    const db = fakeDb({ rpc: { ops_claim_enrollment: () => (used ? [] : ((used = true), [{ id: ID, user_id: UID }])) } });
    const r = await Promise.all([openEnrollment(db as never, TOKEN, { ipHash: 'a', label: '', location: '' }), openEnrollment(db as never, TOKEN, { ipHash: 'b', label: '', location: '' })]);
    expect(r.filter((x) => x.ok)).toHaveLength(1);
  });
  it('malformed token never reaches the DB', async () => {
    const db = fakeDb();
    expect((await openEnrollment(db as never, 'short', { ipHash: null, label: '', location: '' })).ok).toBe(false);
    expect(db.calls).toHaveLength(0);
  });
  it('max 3 open links', async () => {
    const db = fakeDb({ results: { ops_device_enrollments: [[1, 2, 3]] } });
    expect(await issueEnrollmentLink(db as never, UID, 'https://ops')).toEqual({ ok: false, error: 'too_many' });
  });
  it('link is high-entropy and only its hash is stored', async () => {
    const db = fakeDb({ results: { ops_device_enrollments: [[]] } });
    const r = await issueEnrollmentLink(db as never, UID, 'https://ops.example.test');
    expect(r.ok).toBe(true);
    const token = (r as { url: string }).url.split('/k/')[1];
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const ins = db.calls.find((c) => c.op === 'insert')!.args[0] as { token_hash: string };
    expect(ins.token_hash).not.toContain(token);
    expect(ins.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('password + strong factor', () => {
  const pw = async () => UID;
  it('link + password without a valid second factor does not progress', async () => {
    const db = fakeDb({ rpc: { ops_use_recovery_code: () => false } });
    expect(await completeFactor(db as never, row() as never, { email: 'e', password: 'p', factor: { method: 'backup', code: 'WRONG12345' } }, { checkPassword: pw })).toEqual({ ok: false, error: 'factor' });
    expect(db.calls.some((c) => c.op === 'update')).toBe(false);
  });
  it('wrong password fails before the factor is even checked', async () => {
    const db = fakeDb({ rpc: { ops_use_recovery_code: () => true } });
    expect(await completeFactor(db as never, row() as never, { email: 'e', password: 'p', factor: { method: 'backup', code: 'X' } }, { checkPassword: async () => null })).toEqual({ ok: false, error: 'password' });
    expect(db.calls.some((c) => c.table === 'rpc:ops_use_recovery_code')).toBe(false);
  });
  it("another user's password does not count", async () => {
    const db = fakeDb({ rpc: { ops_use_recovery_code: () => true } });
    expect((await completeFactor(db as never, row() as never, { email: 'e', password: 'p', factor: { method: 'backup', code: 'X' } }, { checkPassword: async () => 'someone-else' })).ok).toBe(false);
  });
  it('passkey factor with failed verification is rejected', async () => {
    ch.consume.mockResolvedValue({ user_id: UID, challenge: 'c', origin: 'o', rp_id: 'r' });
    wa.auth.mockRejectedValue(new Error('bad sig'));
    const db = fakeDb({ results: { ops_security_keys: [[{ id: 'k', credential_id: 'cred', public_key: 'AA', counter: 1, transports: [] }]], ops_trusted_devices: [[]] } });
    expect((await completeFactor(db as never, row() as never, { email: 'e', password: 'p', factor: { method: 'passkey', challengeCookie: 'c', response: { id: 'cred' } as never } }, { checkPassword: pw })).ok).toBe(false);
  });
  it('password + backup code → number for the device and 3 options', async () => {
    const db = fakeDb({ rpc: { ops_use_recovery_code: () => true }, results: { 'ops_device_enrollments:update': [[{ id: ID }]] } });
    const r = await completeFactor(db as never, row() as never, { email: 'e', password: 'p', factor: { method: 'backup', code: 'X' } }, { checkPassword: pw });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.options).toContain(r.number); expect(r.options).toHaveLength(3); }
  });
  it('factor step cannot be repeated once passed', async () => {
    const db = fakeDb({ rpc: { ops_use_recovery_code: () => true } });
    expect(await completeFactor(db as never, row({ factor_ok_at: iso(-1), match_expires_at: iso(60_000) }) as never, { email: 'e', password: 'p', factor: { method: 'backup', code: 'X' } }, { checkPassword: pw })).toEqual({ ok: false, error: 'stage' });
  });
});

describe('number match decision', () => {
  it('wrong number → rejected, IP blocked', async () => {
    const db = fakeDb({ rpc: { ops_enroll_decide: () => 'wrong' }, results: { ops_device_enrollments: [row({ match_result: 'wrong', revoked_at: iso(0) })] } });
    expect((await decideMatch(db as never, ID, 12)).result).toBe('wrong');
    expect(db.calls.find((c) => c.table === 'ops_enroll_blocks' && c.op === 'upsert')).toBeTruthy();
  });
  it('approval for a different pending request is bound by id (RPC decides per id)', async () => {
    const db = fakeDb({ rpc: { ops_enroll_decide: (a) => (a.p_id === ID ? 'approved' : 'not_found') } });
    expect((await decideMatch(db as never, '00000000-0000-0000-0000-0000000000e2', 12)).result).toBe('not_found');
  });
});

describe('passkey registration only after approval', () => {
  const rp = { origin: 'https://ops', rpID: 'ops' };
  it('no options before approval or after a stale approval', async () => {
    const db = fakeDb();
    expect(await registrationOptions(db as never, row({ factor_ok_at: iso(-1), match_expires_at: iso(60_000) }) as never, 'e', rp)).toBeNull();
    expect(await registrationOptions(db as never, row({ match_result: 'approved', match_decided_at: iso(-6 * 60_000) }) as never, 'e', rp)).toBeNull();
  });
  it('finish refuses unapproved, UV-less, or already-completed enrollments', async () => {
    ch.consume.mockResolvedValue({ user_id: UID, challenge: 'c', origin: 'o', rp_id: 'r' });
    const db = fakeDb();
    const f = { ua: null, ipHash: null, ipMasked: '', country: '' };
    expect((await finishEnrollment(db as never, row() as never, 'c', {} as never, f)).ok).toBe(false);
    wa.reg.mockResolvedValue({ verified: true, registrationInfo: { userVerified: false, credential: { id: 'n', publicKey: new Uint8Array([1]), counter: 0 } } });
    expect((await finishEnrollment(db as never, row({ match_result: 'approved', match_decided_at: iso(-1000) }) as never, 'c', {} as never, f)).ok).toBe(false);
    wa.reg.mockResolvedValue({ verified: true, registrationInfo: { userVerified: true, credential: { id: 'n', publicKey: new Uint8Array([1]), counter: 0 } } });
    const done = fakeDb({ results: { 'ops_device_enrollments:update': [[]] } }); // completed_at already set → 0 rows
    expect((await finishEnrollment(done as never, row({ match_result: 'approved', match_decided_at: iso(-1000) }) as never, 'c', {} as never, f)).ok).toBe(false);
    expect(dt.create).not.toHaveBeenCalled();
  });
  it('approved + UV passkey → device bound to the credential', async () => {
    ch.consume.mockResolvedValue({ user_id: UID, challenge: 'c', origin: 'o', rp_id: 'r' });
    wa.reg.mockResolvedValue({ verified: true, registrationInfo: { userVerified: true, credential: { id: 'cred-new', publicKey: new Uint8Array([1, 2]), counter: 0 } } });
    const db = fakeDb({ results: { 'ops_device_enrollments:update': [[{ id: ID }]] } });
    const r = await finishEnrollment(db as never, row({ match_result: 'approved', match_decided_at: iso(-1000) }) as never, 'c', {} as never, { ua: null, ipHash: 'h', ipMasked: '1.2.x.x', country: 'IL' });
    expect(r).toMatchObject({ ok: true, deviceId: 'dev-1' });
    const upd = db.calls.find((c) => c.table === 'ops_trusted_devices' && c.op === 'update')!.args[0] as { credential_id: string };
    expect(upd.credential_id).toBe('cred-new');
  });
});

describe('Telegram commands', () => {
  const ch2 = () => ({ send: vi.fn(async () => undefined), ack: vi.fn(async () => undefined) });
  it('unauthorized sender: /newdevice ignored silently, no link issued', async () => {
    const db = fakeDb(); const c = ch2();
    const out = await handleEnrollUpdate(db as never, c as never, { message: { chat: { id: 7 } as never, text: '/newdevice' } }, null);
    expect(out).toMatchObject({ ignored: true });
    expect(c.send).not.toHaveBeenCalled();
    expect(db.calls.some((x) => x.op === 'insert')).toBe(false);
  });
  it('unauthorized number tap / revoke tap do nothing', async () => {
    const db = fakeDb(); const c = ch2();
    await handleEnrollUpdate(db as never, c as never, { callback_query: { id: 'q', data: `ceo:em:${ID}:12` } }, null);
    await handleEnrollUpdate(db as never, c as never, { callback_query: { id: 'q', data: `ceo:dr:${ID}` } }, null);
    expect(db.calls).toHaveLength(0);
  });
  it('owner gets a one-time link', async () => {
    const db = fakeDb({ results: { ops_device_enrollments: [[]] } }); const c = ch2();
    await handleEnrollUpdate(db as never, c as never, { message: { chat: { id: 42 } as never, text: 'מכשיר חדש' } }, '42');
    expect(String((c.send.mock.calls[0] as unknown[])[1])).toMatch(/https:\/\/ops\.example\.test\/k\/[A-Za-z0-9_-]{43}/);
  });
  it('owner revoke tap revokes the device and kills sessions', async () => {
    const db = fakeDb(); const c = ch2();
    await handleEnrollUpdate(db as never, c as never, { callback_query: { id: 'q', data: `ceo:dr:${ID}`, message: { chat: { id: 42 } as never, message_id: 1 } } }, '42');
    expect(dt.revoke).toHaveBeenCalled();
    expect(db.calls.some((x) => x.table === 'rpc:ops_revoke_user_sessions')).toBe(true);
  });
  it('unrelated text passes through', async () => {
    expect(await handleEnrollUpdate(fakeDb() as never, ch2() as never, { message: { chat: { id: 42 } as never, text: 'שלום' } }, '42')).toBeNull();
  });
});
