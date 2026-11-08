import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  packParentSession,
  parentSessionDecision,
  sessionIdFromAccessToken,
  unpackParentSession,
  PARENT_SESSION_TTL_SECONDS,
  type ParentSessionProof,
} from '@/lib/central/parent-session';
import { boundNonceOk } from '@/lib/central/parent-session';

const secret = 's'.repeat(32);
const now = 1_800_000_000;
const proof = (patch: Partial<ParentSessionProof> = {}): ParentSessionProof => ({
  product: 'nurawell', userId: 'user-1', sessionId: 'sess-1', parentSub: 'sub_A',
  iat: now - 10, exp: now + PARENT_SESSION_TTL_SECONDS, ...patch,
});

describe('parent session proof (unit, not a live session)', () => {
  it('accepts a fresh proof for the same product, user and session', () => {
    const packed = packParentSession(proof(), secret);
    const read = unpackParentSession(packed!, secret);
    expect(parentSessionDecision({
      modeOn: true, proof: read, userId: 'user-1', sessionId: 'sess-1', nowS: now,
      userMetadata: { pl_sub: 'spoof' }, appMetadata: { pl_sub: 'also-not-enough' },
    })).toBe('ok');
  });

  it('keeps local password sessions and spoofed metadata out when enforcement is on', () => {
    expect(parentSessionDecision({
      modeOn: true, proof: null, userId: 'user-1', sessionId: 'password-session', nowS: now,
      userMetadata: { pl_sub: 'sub_A' }, appMetadata: { pl_sub: 'sub_A' },
    })).toBe('missing');
  });

  it('does not apply the check while central sign-in is off', () => {
    expect(parentSessionDecision({
      modeOn: false, proof: null, userId: 'user-1', sessionId: 'password-session', nowS: now,
      appMetadata: { pl_sub: 'sub_A' },
    })).toBe('skip');
  });

  it('rejects a mismatched session, an expired proof and a revoked proof', () => {
    expect(parentSessionDecision({ modeOn: true, proof: proof(), userId: 'user-1', sessionId: 'other', nowS: now })).toBe('mismatch');
    expect(parentSessionDecision({ modeOn: true, proof: proof({ exp: now - 1 }), userId: 'user-1', sessionId: 'sess-1', nowS: now })).toBe('expired');
    expect(parentSessionDecision({ modeOn: true, proof: proof({ revoked: true }), userId: 'user-1', sessionId: 'sess-1', nowS: now })).toBe('revoked');
    expect(unpackParentSession(`${packParentSession(proof(), secret)!.slice(0, -3)}aaa`, secret)).toBeNull();
  });

  it('reads session_id only from the token payload and does not treat that read as a signature check', () => {
    const payload = Buffer.from(JSON.stringify({ session_id: 'sess-9' })).toString('base64url');
    expect(sessionIdFromAccessToken(`h.${payload}.sig`)).toBe('sess-9');
    expect(sessionIdFromAccessToken('not-a-jwt')).toBeNull();
  });

  it('checks the authorize nonce apart from access-token verification', () => {
    expect(boundNonceOk('n'.repeat(32), 'n'.repeat(32))).toBe(true);
    expect(boundNonceOk('n'.repeat(32), 'm'.repeat(32))).toBe(false);
    expect(boundNonceOk(undefined, 'n'.repeat(32))).toBe(false);
    expect(readFileSync('app/api/v1/central/callback/route.ts', 'utf8')).toMatch(/boundNonceOk\(claims\.nonce, tx\.nonce\)/);
    expect(readFileSync('lib/central/parent-connect.ts', 'utf8')).not.toMatch(/boundNonceOk/);
  });

  it('does not invent an admin exemption for the session proof', () => {
    const plane = readFileSync('lib/central/parent-data-plane.ts', 'utf8');
    expect(plane).toMatch(/parentSessionDecision\(/);
    expect(plane).not.toMatch(/role === 'admin'/);
    expect(readFileSync('lib/api/route-guards.ts', 'utf8')).toMatch(/refuseParentSession/);
    expect(readFileSync('app/(dashboard)/layout.tsx', 'utf8')).toMatch(/enforceParentSessionPage/);
    expect(readFileSync('app/challenge/layout.tsx', 'utf8')).toMatch(/enforceParentSessionPage/);
    const proxy = readFileSync('proxy.ts', 'utf8');
    const slide = proxy.slice(proxy.indexOf('async function slideParentSession'));
    expect(slide).toMatch(/if \(!user\) return;/);
    expect(slide).not.toMatch(/PLATFORM_SIGNIN_MODE/);
    expect(slide).toMatch(/rememberParentSession/);
  });

  it('guards direct signup and leaves Almog copy behind the existing license decision', () => {
    expect(readFileSync('lib/actions/complete-onboarding.ts', 'utf8')).toMatch(/allowProductProvision/);
    expect(readFileSync('app/(auth)/register/form/page.tsx', 'utf8')).toMatch(/unpackProvision/);
    const job = readFileSync('lib/notifications/jobs/master.ts', 'utf8');
    const gate = job.indexOf('suppressUnlicensedNudge(admin, userId)');
    const send = job.indexOf('sendJourneyCompanionNudge(admin, userId, companion)');
    expect(gate).toBeGreaterThan(-1);
    expect(send).toBeGreaterThan(gate);
    expect(readFileSync('lib/workflows/send-journey-companion-nudge.ts', 'utf8')).not.toMatch(/licenseGate/);
  });
});
