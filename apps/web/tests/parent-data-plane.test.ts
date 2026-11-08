import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  continueParentSession,
  dataPlaneAllows,
  planParentAccess,
  recordParentSessionGrant,
  renewalDecision,
  revokeGrant,
  slideGrant,
  type GrantRow,
} from '@/lib/central/parent-data-plane';
import { PARENT_SESSION_TTL_SECONDS, type ParentSessionProof } from '@/lib/central/parent-session';

/** Pure decisions. Database behavior is tests/parent-rls.db.test.ts against local Postgres. */
const now = 1_800_000_000;
const secretProof = (patch: Partial<ParentSessionProof> = {}): ParentSessionProof => ({
  product: 'nurawell', userId: 'user-1', sessionId: 'sess-1', parentSub: 'sub_A',
  iat: now - 60, exp: now + PARENT_SESSION_TTL_SECONDS, ...patch,
});
const grant = (patch: Partial<GrantRow> = {}): GrantRow => ({
  userId: 'user-1', sessionId: 'sess-1', parentSub: 'sub_A', expiresAt: now + 120,
  revokedAt: null, entitlementRevokedAt: null, ...patch,
});

describe('parent grant decisions', () => {
  it('does not treat an old cookie as the data-plane lease', () => {
    expect(continueParentSession({
      modeOn: true, proof: secretProof({ exp: now - 1 }), userId: 'user-1', sessionId: 'sess-1', nowS: now, entitlement: 'active',
    }).decision).toBe('ok');
    expect(slideGrant(grant({ expiresAt: now - 5 }), now, 'active', 'sess-1')).toBeNull();
    const live = slideGrant(grant(), now, 'active', 'sess-1');
    expect(live?.expiresAt).toBe(now + 120);
    expect(renewalDecision({
      sessionLive: true, sessionMatchesGrant: true, parentSubMatches: true, liveReason: 'active',
    })).toEqual({ eligible: true, revalidated: true });
    expect(renewalDecision({
      sessionLive: true, sessionMatchesGrant: true, parentSubMatches: true, liveReason: 'no_status',
    })).toEqual({ eligible: false, revalidated: false });
    expect(renewalDecision({
      sessionLive: true, sessionMatchesGrant: true, parentSubMatches: false, liveReason: 'active',
    }).revalidated).toBe(false);
    expect(renewalDecision({
      sessionLive: true, sessionMatchesGrant: true, parentSubMatches: true, liveReason: 'expired',
    })).toEqual({ eligible: false, revalidated: true });
    expect(renewalDecision({
      sessionLive: true, sessionMatchesGrant: true, parentSubMatches: true, liveReason: 'wrong_product',
    }).revalidated).toBe(false);
    expect(renewalDecision({
      sessionLive: true, sessionMatchesGrant: true, parentSubMatches: true, liveReason: 'revoked',
    })).toEqual({ eligible: false, revalidated: true });
    expect(slideGrant(grant(), now, 'revoked', 'sess-1')?.entitlementRevokedAt).toBe(now);
    expect(slideGrant(grant(), now, 'unknown', 'sess-1')).toBeNull();
  });

  it('denies a password session, an unreadable switch, a missing table and a revoked grant', () => {
    expect(dataPlaneAllows({
      signinColumn: 'all', sub: 'user-1', sessionId: 'password-session', grants: [], nowS: now,
      userMetadata: { pl_sub: 'spoof' }, appMetadata: { pl_sub: 'spoof' },
    })).toBe(false);
    expect(dataPlaneAllows({ signinColumn: 'off', sub: 'user-1', sessionId: 'password-session', grants: [], nowS: now })).toBe(true);
    expect(dataPlaneAllows({ signinColumn: null, sub: 'user-1', sessionId: 'sess-1', grants: [grant()], nowS: now })).toBe(false);
    expect(dataPlaneAllows({ signinColumn: 'unreadable', sub: 'user-1', sessionId: 'sess-1', grants: [grant()], nowS: now })).toBe(false);
    const continued = continueParentSession({
      modeOn: true, proof: secretProof(), userId: 'user-1', sessionId: 'sess-1', nowS: now, entitlement: 'active',
    });
    expect(planParentAccess({
      continued, grant: { kind: 'row', row: revokeGrant(grant(), now) }, nowS: now, sessionId: 'sess-1', entitlement: 'active',
    }).access).toBe('deny');
    expect(planParentAccess({
      continued, grant: { kind: 'absent-table' }, nowS: now, sessionId: 'sess-1', entitlement: 'active',
    }).access).toBe('deny');
    expect(planParentAccess({
      continued, grant: { kind: 'row', row: grant({ expiresAt: now - 1 }) }, nowS: now, sessionId: 'sess-1', entitlement: 'unknown',
    }).access).toBe('deny');
    expect(planParentAccess({
      continued, grant: { kind: 'row', row: grant({ expiresAt: now - 1 }) }, nowS: now, sessionId: 'sess-1', entitlement: 'active',
    }).slide).toBe(true);
    expect(planParentAccess({
      continued, grant: { kind: 'row', row: grant({ expiresAt: now - 1 }) }, nowS: now, sessionId: 'sess-1', entitlement: 'revoked',
    })).toMatchObject({ access: 'deny', slide: false, markEntitlement: true });
    expect(planParentAccess({
      continued, grant: { kind: 'row', row: grant() }, nowS: now, sessionId: 'sess-1', entitlement: 'active',
    })).toMatchObject({ access: 'allow', slide: true });
  });

  it('a missing authorization function or table fails the parent sign-in', async () => {
    const input = { userId: '11111111-1111-1111-1111-111111111111', sessionId: '33333333-3333-3333-3333-333333333333', parentSub: 'sub_A', issuedAt: now, expiresAt: now + 10 };
    const rpc = async () => ({ data: null, error: { code: 'PGRST202', message: 'parent_session_issue' } });
    expect(await recordParentSessionGrant({ rpc } as never, input)).toBe('failed');
    const upsert = async () => ({ error: { code: '42P01', message: 'parent_session_grants does not exist' } });
    expect(await recordParentSessionGrant({ from: () => ({ upsert }) } as never, input)).toBe('failed');
    expect(readFileSync('app/api/v1/central/callback/route.ts', 'utf8')).toMatch(/recorded !== 'recorded'/);
    expect(readFileSync('lib/api/route-guards.ts', 'utf8')).toMatch(/parentSessionRefusal\(request, session\.supabase, session\.user\)/);
  });
});
