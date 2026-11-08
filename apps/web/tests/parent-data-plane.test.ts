import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  continueParentSession,
  dataPlaneAllows,
  missingRelation,
  planParentAccess,
  recordParentSessionGrant,
  revokeGrant,
  shouldPersistSlide,
  slideGrant,
  type GrantRow,
} from '@/lib/central/parent-data-plane';
import { PARENT_SESSION_TTL_SECONDS, type ParentSessionProof } from '@/lib/central/parent-session';

/**
 * Local decisions and static SQL inventory. No database, no mail, no production schema.
 * A passing run does not mean the direct PostgREST bypass is closed.
 */
const now = 1_800_000_000;
const secretProof = (patch: Partial<ParentSessionProof> = {}): ParentSessionProof => ({
  product: 'nurawell', userId: 'user-1', sessionId: 'sess-1', parentSub: 'sub_A',
  iat: now - 60, exp: now + PARENT_SESSION_TTL_SECONDS, ...patch,
});
const grant = (patch: Partial<GrantRow> = {}): GrantRow => ({
  userId: 'user-1', sessionId: 'sess-1', expiresAt: now + PARENT_SESSION_TTL_SECONDS,
  revokedAt: null, entitlementRevokedAt: null, ...patch,
});

const migrations = join(process.cwd(), '../../supabase/migrations');
const sqlFiles = () => readdirSync(migrations).filter((name) => name.endsWith('.sql')).map((name) => readFileSync(join(migrations, name), 'utf8'));

describe('parent data plane (local, not a live database)', () => {
  it('slides a refreshed session with the same session id and does not slide a revoked entitlement', () => {
    const expired = continueParentSession({
      modeOn: true, proof: secretProof({ exp: now - 1 }), userId: 'user-1', sessionId: 'sess-1',
      nowS: now, entitlement: 'active', userMetadata: { pl_sub: 'spoof' }, appMetadata: { pl_sub: 'spoof' },
    });
    expect(expired.decision).toBe('ok');
    expect(expired.next?.exp).toBe(now + PARENT_SESSION_TTL_SECONDS);
    expect(expired.next?.sessionId).toBe('sess-1');

    const revoked = continueParentSession({
      modeOn: true, proof: secretProof(), userId: 'user-1', sessionId: 'sess-1', nowS: now, entitlement: 'revoked',
    });
    expect(revoked.decision).toBe('ok');
    expect(revoked.next).toBeNull();
    expect(revoked.entitlementRevoked).toBe(true);

    const unknown = continueParentSession({
      modeOn: true, proof: secretProof({ exp: now - 1 }), userId: 'user-1', sessionId: 'sess-1', nowS: now, entitlement: 'unknown',
    });
    expect(unknown.decision).toBe('expired');
    expect(unknown.next).toBeNull();
  });

  it('keeps a password session and a different session id from inheriting the proof', () => {
    expect(continueParentSession({
      modeOn: true, proof: secretProof(), userId: 'user-1', sessionId: 'password-session', nowS: now, entitlement: 'active',
      appMetadata: { pl_sub: 'sub_A' },
    }).decision).toBe('mismatch');
    expect(continueParentSession({
      modeOn: false, proof: null, userId: 'user-1', sessionId: 'password-session', nowS: now, entitlement: 'active',
    }).decision).toBe('skip');
    expect(shouldPersistSlide(secretProof({ exp: now + 30 }), now)).toBe(true);
    expect(shouldPersistSlide(secretProof({ exp: now + PARENT_SESSION_TTL_SECONDS }), now)).toBe(false);
  });

  it('models the RLS grant: password JWT fails, refresh of the same session id does not strand, revoke and entitlement do', () => {
    expect(dataPlaneAllows({
      signinColumn: 'all', sub: 'user-1', sessionId: 'password-session', grants: [], nowS: now,
      userMetadata: { pl_sub: 'sub_A' }, appMetadata: { pl_sub: 'sub_A' },
    })).toBe(false);
    expect(dataPlaneAllows({ signinColumn: 'off', sub: 'user-1', sessionId: 'password-session', grants: [], nowS: now })).toBe(true);
    expect(dataPlaneAllows({ signinColumn: null, sub: 'user-1', sessionId: 'password-session', grants: [], nowS: now })).toBe(true);
    expect(dataPlaneAllows({
      signinColumn: 'all', sub: 'user-1', sessionId: null, grants: [grant()], nowS: now,
    })).toBe(false);

    const expiredGrant = grant({ expiresAt: now - 5 });
    expect(dataPlaneAllows({ signinColumn: 'all', sub: 'user-1', sessionId: 'sess-1', grants: [expiredGrant], nowS: now })).toBe(false);
    const slid = slideGrant(expiredGrant, now, 'active', 'sess-1');
    expect(slid?.expiresAt).toBe(now + PARENT_SESSION_TTL_SECONDS);
    expect(dataPlaneAllows({ signinColumn: 'all', sub: 'user-1', sessionId: 'sess-1', grants: [slid!], nowS: now })).toBe(true);

    const entitled = slideGrant(grant(), now, 'revoked', 'sess-1');
    expect(entitled?.expiresAt).toBe(grant().expiresAt);
    expect(entitled?.entitlementRevokedAt).toBe(now);
    expect(dataPlaneAllows({ signinColumn: 'all', sub: 'user-1', sessionId: 'sess-1', grants: [entitled!], nowS: now })).toBe(false);
    expect(slideGrant(grant(), now, 'active', 'other-session')).toBeNull();

    const loggedOut = revokeGrant(grant(), now);
    expect(dataPlaneAllows({ signinColumn: 'all', sub: 'user-1', sessionId: 'sess-1', grants: [loggedOut], nowS: now })).toBe(false);
    expect(dataPlaneAllows({ signinColumn: 'all', sub: 'user-1', sessionId: 'other-tab', grants: [loggedOut], nowS: now })).toBe(false);
  });

  it('denies a copied cookie after logout once the grant row exists, and does not deny while the table is absent', () => {
    const continued = continueParentSession({
      modeOn: true, proof: secretProof(), userId: 'user-1', sessionId: 'sess-1', nowS: now, entitlement: 'active',
    });
    expect(planParentAccess({
      continued, grant: { kind: 'row', row: revokeGrant(grant(), now) }, nowS: now, sessionId: 'sess-1', entitlement: 'active',
    }).access).toBe('deny');
    expect(planParentAccess({
      continued, grant: { kind: 'absent-table' }, nowS: now, sessionId: 'sess-1', entitlement: 'active',
    }).access).toBe('allow');
    expect(planParentAccess({
      continued, grant: { kind: 'row', row: null }, nowS: now, sessionId: 'sess-1', entitlement: 'active',
    }).access).toBe('deny');
    const expiredContinued = continueParentSession({
      modeOn: true, proof: secretProof({ exp: now - 1 }), userId: 'user-1', sessionId: 'sess-1', nowS: now, entitlement: 'active',
    });
    expect(planParentAccess({
      continued: expiredContinued, grant: { kind: 'row', row: grant({ expiresAt: now - 5 }) }, nowS: now, sessionId: 'sess-1', entitlement: 'active',
    })).toMatchObject({ access: 'allow', slide: true });
  });

  it('treats a missing grant table as unapplied and any other write error as failure', async () => {
    expect(missingRelation({ code: 'PGRST205', message: 'schema cache' })).toBe(true);
    expect(missingRelation({ code: '42P01', message: 'parent_session_grants does not exist' })).toBe(true);
    expect(missingRelation({ code: '23505', message: 'parent_session_grants' })).toBe(false);
    const input = { userId: 'user-1', sessionId: 'sess-1', parentSub: 'sub_A', issuedAt: now, expiresAt: now + 10 };
    const client = (error: { code?: string; message?: string } | null) => ({
      from: () => ({ upsert: async () => ({ error }) }),
    });
    expect(await recordParentSessionGrant(client(null) as never, input)).toBe('recorded');
    expect(await recordParentSessionGrant(client({ code: 'PGRST205', message: 'schema cache' }) as never, input)).toBe('unapplied');
    expect(await recordParentSessionGrant(client({ code: '42501', message: 'permission denied' }) as never, input)).toBe('failed');
  });

  it('shows applied migrations still authorize auth.uid() and do not reference the grant', () => {
    const files = sqlFiles();
    const joined = files.join('\n');
    expect(joined).toMatch(/auth\.uid\(\)/);
    expect(joined).not.toMatch(/parent_session_ok/);
    expect(joined).not.toMatch(/parent_session_grants/);
    expect(joined).not.toMatch(/storage\.objects/);
    const design = readFileSync('lib/central/parent-session-rls.design.sql', 'utf8');
    expect(design).toMatch(/auth\.jwt\(\) ->> 'session_id'/);
    expect(design).toMatch(/platform_link_settings/);
    expect(design).toMatch(/revoked_at is null/);
    expect(design).toMatch(/entitlement_revoked_at is null/);
    expect(design).toMatch(/expires_at > now\(\)/);
    expect(design).toMatch(/is_admin/);
    const fn = design.slice(design.indexOf('create or replace function'));
    expect(fn).not.toMatch(/user_metadata|app_metadata|pl_sub/);
    expect(design).toMatch(/Not a Supabase migration/);
  });

  it('lists the authenticated RPCs in the repo and the surfaces a password JWT can still reach', () => {
    expect([...netAuthenticatedExecutes()].sort()).toEqual([
      'admin_has_passkey()',
      'challenge_public_stats()',
      'demo_access_blocks_admin(uuid)',
      'iam_my_permission(text,text)',
      'is_admin()',
      'nura_is_admin(uuid)',
    ]);
    const profiles = readFileSync(join(migrations, '000001_initial_schema.sql'), 'utf8');
    expect(profiles).toMatch(/auth\.uid\(\) = id OR public\.is_admin\(\)/);
    const realtime = readFileSync(join(migrations, '000220_ops_realtime_ping.sql'), 'utf8');
    expect(realtime).toMatch(/auth\.uid\(\)/);
    expect(realtime).toMatch(/is_admin\(\)/);
    expect(readFileSync('lib/journey/use-journey-progress-live.ts', 'utf8')).toMatch(/postgres_changes/);
    expect(readFileSync('components/notifications/NotificationsProvider.tsx', 'utf8')).toMatch(/postgres_changes/);
    expect(walkSources(process.cwd()).some((text) => text.includes('.storage.from(') || text.includes('supabase.storage'))).toBe(false);
  });

  it('wires the server action, logout and the parent callback without claiming the table exists', () => {
    expect(readFileSync('lib/actions/mark-welcome-seen.ts', 'utf8')).toMatch(/allowUserServerAction/);
    expect(readFileSync('lib/actions/complete-onboarding.ts', 'utf8')).toMatch(/allowProductProvision/);
    expect(readFileSync('app/api/v1/auth/sign-out/route.ts', 'utf8')).toMatch(/revokeBrowserParentSession/);
    expect(readFileSync('lib/auth/sign-out-client.ts', 'utf8')).toMatch(/\/api\/v1\/auth\/sign-out/);
    const callback = readFileSync('app/api/v1/central/callback/route.ts', 'utf8');
    expect(callback).toMatch(/recordParentSessionGrant/);
    expect(callback).toMatch(/recorded === 'failed'/);
    expect(readFileSync('lib/central/parent-data-plane.ts', 'utf8')).not.toMatch(/role === 'admin'/);
  });
});

function netAuthenticatedExecutes(): string[] {
  const granted = new Set<string>();
  const sig = (name: string, args: string) => `${name.toLowerCase()}(${args.toLowerCase().replace(/\s+/g, '')})`;
  for (const name of readdirSync(migrations).filter((file) => file.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(migrations, name), 'utf8');
    for (const match of sql.matchAll(/grant execute on function public\.([a-z0-9_]+)\(([^)]*)\) to ([^;]+);/gi)) {
      if (/\bauthenticated\b/i.test(match[3])) granted.add(sig(match[1], match[2]));
    }
    for (const match of sql.matchAll(/revoke (?:all|execute) on function public\.([a-z0-9_]+)\(([^)]*)\) from ([^;]+);/gi)) {
      if (/\bauthenticated\b/i.test(match[3])) granted.delete(sig(match[1], match[2]));
    }
    const dyn = sql.match(/ARRAY\[([\s\S]*?)\]\s*LOOP[\s\S]{0,240}REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated/);
    if (dyn) {
      for (const match of dyn[1].matchAll(/'public\.([a-z0-9_]+)\(([^)]*)\)'/gi)) granted.delete(sig(match[1], match[2]));
    }
  }
  return [...granted];
}

function walkSources(root: string): string[] {
  const out: string[] = [];
  const skip = new Set(['node_modules', '.next', 'coverage', 'tests']);
  const visit = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (skip.has(name)) continue;
      const path = join(dir, name);
      const info = statSync(path);
      if (info.isDirectory()) visit(path);
      else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(readFileSync(path, 'utf8'));
    }
  };
  visit(root);
  return out;
}
