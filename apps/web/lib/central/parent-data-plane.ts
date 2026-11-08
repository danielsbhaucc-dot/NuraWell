import {
  packParentSession,
  parentSessionDecision,
  sessionIdFromAccessToken,
  unpackParentSession,
  PARENT_SESSION_COOKIE,
  PARENT_SESSION_COOKIE_MAX_AGE,
  PARENT_GRANT_LEASE_SECONDS,
  type ParentSessionDecision,
  type ParentSessionProof,
} from './parent-session';

/**
 * App-side mirror of parent_session_ok / parent_session_renew in migration 000232.
 * The database is the authority for table access. A missing grant table is a denial
 * when protected access is closed. An expired grant is not renewed.
 */

export type Entitlement = 'active' | 'revoked' | 'unknown';

export type GrantRow = {
  userId: string;
  sessionId: string;
  parentSub: string;
  expiresAt: number;
  revokedAt: number | null;
  entitlementRevokedAt: number | null;
};

export type SigninColumn = 'off' | 'test' | 'all' | 'unreadable' | null;

export type Continuation = {
  decision: ParentSessionDecision;
  next: ParentSessionProof | null;
  entitlementRevoked: boolean;
};

export function continueParentSession(input: {
  modeOn: boolean;
  proof: ParentSessionProof | null;
  userId: string;
  sessionId: string;
  nowS: number;
  entitlement: Entitlement;
  userMetadata?: Record<string, unknown> | null;
  appMetadata?: Record<string, unknown> | null;
}): Continuation {
  if (!input.modeOn) return { decision: 'skip', next: null, entitlementRevoked: false };
  const base = parentSessionDecision({
    modeOn: true,
    proof: input.proof,
    userId: input.userId,
    sessionId: input.sessionId,
    nowS: input.nowS,
    userMetadata: input.userMetadata,
    appMetadata: input.appMetadata,
  });
  const same = Boolean(input.proof) && input.proof!.userId === input.userId && input.proof!.sessionId === input.sessionId;
  if (base === 'expired' && same) return { decision: 'ok', next: null, entitlementRevoked: input.entitlement === 'revoked' };
  if (base !== 'ok') return { decision: base, next: null, entitlementRevoked: false };
  if (input.entitlement === 'revoked') return { decision: 'ok', next: null, entitlementRevoked: true };
  return { decision: 'ok', next: null, entitlementRevoked: false };
}

/**
 * RLS predicate the design SQL implements. The signin column is the only switch
 * Postgres can read. Metadata is ignored. No grant ⇒ deny when the column is test or all.
 */
export function dataPlaneAllows(input: {
  signinColumn: SigninColumn;
  sub: string | null;
  sessionId: string | null;
  grants: GrantRow[];
  nowS: number;
  userMetadata?: Record<string, unknown> | null;
  appMetadata?: Record<string, unknown> | null;
}): boolean {
  void input.userMetadata;
  void input.appMetadata;
  if (input.signinColumn === 'off') return true;
  if (input.signinColumn !== 'test' && input.signinColumn !== 'all') return false;
  if (!input.sub || !input.sessionId) return false;
  const grant = input.grants.find((row) => row.userId === input.sub && row.sessionId === input.sessionId);
  if (!grant || grant.revokedAt !== null || grant.entitlementRevokedAt !== null) return false;
  return grant.expiresAt >= input.nowS;
}

/**
 * Live parent status only. app_metadata is not an input: a cached license id is not a verdict.
 * no_status and stale_status do not renew and do not mark the row revoked.
 * A real non-active reason does. An expired row can still be renewed when this says revalidated and eligible.
 */
export function renewalDecision(input: {
  sessionLive: boolean;
  sessionMatchesGrant: boolean;
  parentSubMatches: boolean;
  liveReason: string;
}): { eligible: boolean; revalidated: boolean } {
  const outage = input.liveReason === 'no_status' || input.liveReason === 'stale_status' || input.liveReason === '';
  return {
    eligible: input.liveReason === 'active',
    revalidated: input.sessionLive && input.sessionMatchesGrant && input.parentSubMatches && !outage,
  };
}

/** Extends a live eligible grant. An expired row is not extended here; the database renews that after revalidation. */
export function slideGrant(grant: GrantRow, nowS: number, entitlement: Entitlement, sessionId: string): GrantRow | null {
  if (grant.sessionId !== sessionId || grant.revokedAt !== null || grant.entitlementRevokedAt !== null) return null;
  if (entitlement === 'revoked') return { ...grant, entitlementRevokedAt: grant.entitlementRevokedAt ?? nowS };
  if (entitlement !== 'active' || grant.expiresAt <= nowS) return null;
  return { ...grant, expiresAt: nowS + PARENT_GRANT_LEASE_SECONDS };
}

export function revokeGrant(grant: GrantRow, nowS: number): GrantRow {
  return { ...grant, revokedAt: grant.revokedAt ?? nowS };
}

export type GrantRead =
  | { kind: 'absent-table' }
  | { kind: 'error' }
  | { kind: 'row'; row: GrantRow | null };

export type AccessPlan = {
  access: 'allow' | 'deny';
  slide: boolean;
  markEntitlement: boolean;
  clearCookie: boolean;
};

/**
 * Cookie decision plus the server grant, when the table exists.
 * Logout (revoked_at) denies every tab and a copied cookie.
 * Entitlement revocation does not by itself deny privacy routes; it stops the slide
 * and is written onto the grant so RLS can see it after the design SQL is applied.
 */
export function planParentAccess(input: {
  continued: Continuation;
  grant: GrantRead;
  nowS: number;
  sessionId: string;
  entitlement: Entitlement;
}): AccessPlan {
  const deny = (clearCookie: boolean): AccessPlan => ({ access: 'deny', slide: false, markEntitlement: false, clearCookie });
  if (input.continued.decision === 'skip') return { access: 'allow', slide: false, markEntitlement: false, clearCookie: false };
  if (input.continued.decision !== 'ok') {
    return {
      access: 'deny',
      slide: false,
      markEntitlement: input.continued.entitlementRevoked,
      clearCookie: input.continued.decision === 'revoked',
    };
  }
  if (input.grant.kind !== 'row') return deny(false);
  const row = input.grant.row;
  if (!row || row.sessionId !== input.sessionId) return deny(false);
  if (row.revokedAt !== null || row.entitlementRevokedAt !== null) return deny(row.revokedAt !== null);
  const renewing = input.entitlement === 'active';
  const marking = input.entitlement === 'revoked';
  if (row.expiresAt <= input.nowS && !renewing) return deny(false);
  return {
    access: 'allow',
    slide: renewing,
    markEntitlement: marking,
    clearCookie: false,
  };
}

type GrantError = { code?: string; message?: string } | null;

export function missingRelation(error: unknown): boolean {
  const value = error as GrantError;
  const code = value && typeof value === 'object' ? value.code ?? '' : '';
  const message = value && typeof value === 'object' ? value.message ?? '' : '';
  if (code === '42P01' || code === 'PGRST205') return true;
  return /parent_session_grants/i.test(message) && /schema cache|does not exist|could not find/i.test(message);
}

export type GrantWrite = 'recorded' | 'unapplied' | 'failed';

type GrantClient = {
  from: (table: string) => {
    upsert: (values: Record<string, unknown>, options: { onConflict: string }) => PromiseLike<{ error: GrantError }>;
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => PromiseLike<{ error: GrantError }>;
      };
    };
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => PromiseLike<{ data: Record<string, unknown> | null; error: GrantError }>;
        };
      };
    };
  };
};

const classify = (error: GrantError): GrantWrite => (error ? 'failed' : 'recorded');

export function resetGrantTableProbe(): void {
  return;
}

export async function recordParentSessionGrant(admin: unknown, input: {
  userId: string;
  sessionId: string;
  parentSub: string;
  issuedAt: number;
  expiresAt: number;
}): Promise<GrantWrite> {
  try {
    const rpc = (admin as { rpc?: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: GrantError }> }).rpc;
    if (rpc) {
      const { data, error } = await rpc('parent_session_issue', {
        p_user: input.userId, p_session: input.sessionId, p_parent_sub: input.parentSub,
      });
      if (error || data == null) return 'failed';
      return 'recorded';
    }
    const { error } = await (admin as GrantClient).from('parent_session_grants').upsert({
      user_id: input.userId,
      session_id: input.sessionId,
      parent_sub: input.parentSub,
      issued_at: new Date(input.issuedAt * 1000).toISOString(),
      expires_at: new Date(input.expiresAt * 1000).toISOString(),
      revoked_at: null,
      entitlement_revoked_at: null,
    }, { onConflict: 'user_id,session_id' });
    return classify(error);
  } catch {
    return 'failed';
  }
}

async function rpcRenew(userId: string, sessionId: string, eligible: boolean, revalidated: boolean): Promise<string | null> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const { data, error } = await createAdminClient().rpc('parent_session_renew', {
      p_user: userId, p_session: sessionId, p_eligible: eligible, p_revalidated: revalidated,
    });
    if (error || data == null || data === '') return null;
    return String(data);
  } catch {
    return null;
  }
}

const cookieOptions = (maxAge: number) => ({
  httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', maxAge,
});

function secret(): string {
  return process.env.PLATFORM_ID_CLIENT_SECRET ?? '';
}

async function liveLicenseReason(user: { app_metadata?: Record<string, unknown> | null }): Promise<string> {
  const lic = user.app_metadata?.pl_lic;
  if (typeof lic !== 'string' || lic.length === 0) return 'no_status';
  try {
    const { licenseReasonFor } = await import('@/lib/central/license-gate');
    return await licenseReasonFor(lic);
  } catch {
    return 'no_status';
  }
}

function grantFrom(data: Record<string, unknown> | null): GrantRow | null {
  if (!data || typeof data.user_id !== 'string' || typeof data.session_id !== 'string' || typeof data.parent_sub !== 'string' || typeof data.expires_at !== 'string') return null;
  const expiresAt = Date.parse(data.expires_at);
  if (!Number.isFinite(expiresAt)) return null;
  const at = (value: unknown) => (typeof value === 'string' ? Date.parse(value) / 1000 : null);
  const revokedAt = at(data.revoked_at);
  const entitlementRevokedAt = at(data.entitlement_revoked_at);
  return {
    userId: data.user_id,
    sessionId: data.session_id,
    parentSub: data.parent_sub,
    expiresAt: Math.floor(expiresAt / 1000),
    revokedAt: revokedAt !== null && Number.isFinite(revokedAt) ? revokedAt : null,
    entitlementRevokedAt: entitlementRevokedAt !== null && Number.isFinite(entitlementRevokedAt) ? entitlementRevokedAt : null,
  };
}

async function readGrant(userId: string, sessionId: string): Promise<GrantRead> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const { data, error } = await createAdminClient()
      .from('parent_session_grants')
      .select('user_id, session_id, parent_sub, expires_at, revoked_at, entitlement_revoked_at')
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .maybeSingle();
    if (missingRelation(error)) return { kind: 'absent-table' };
    if (error) return { kind: 'error' };
    return { kind: 'row', row: grantFrom(data as Record<string, unknown> | null) };
  } catch (error) {
    if (missingRelation(error)) return { kind: 'absent-table' };
    return { kind: 'error' };
  }
}

async function applyPlan(plan: AccessPlan, userId: string, sessionId: string, revalidated: boolean): Promise<string | null> {
  if (!revalidated || (!plan.slide && !plan.markEntitlement)) return null;
  return rpcRenew(userId, sessionId, plan.slide, true);
}

type SessionUser = { id: string; user_metadata?: Record<string, unknown> | null; app_metadata?: Record<string, unknown> | null };
type SessionSource = { auth: { getSession: () => Promise<{ data: { session: { access_token?: string } | null } }> } };

async function evaluate(user: SessionUser, proofRaw: string | undefined, supabase: SessionSource): Promise<{
  plan: AccessPlan;
  continued: Continuation;
  sessionId: string;
  nowS: number;
  entitlement: Entitlement;
  renewed: string | null;
  proof: ParentSessionProof | null;
}> {
  const { data } = await supabase.auth.getSession();
  const sessionId = sessionIdFromAccessToken(data.session?.access_token) ?? '';
  const nowS = Math.floor(Date.now() / 1000);
  const proof = unpackParentSession(proofRaw, secret());
  const grant = sessionId ? await readGrant(user.id, sessionId) : { kind: 'absent-table' as const };
  const grantRow = grant.kind === 'row' ? grant.row : null;
  const parentSub = typeof user.app_metadata?.pl_sub === 'string' ? user.app_metadata.pl_sub : '';
  const checked = renewalDecision({
    sessionLive: sessionId.length > 0,
    sessionMatchesGrant: Boolean(grantRow) && grantRow!.sessionId === sessionId,
    parentSubMatches: parentSub.length > 0 && grantRow?.parentSub === parentSub,
    liveReason: await liveLicenseReason(user),
  });
  const entitlement: Entitlement = checked.eligible ? 'active' : checked.revalidated ? 'revoked' : 'unknown';
  const continued = continueParentSession({
    modeOn: true,
    proof,
    userId: user.id,
    sessionId,
    nowS,
    entitlement,
    userMetadata: user.user_metadata,
    appMetadata: user.app_metadata,
  });
  let plan = planParentAccess({ continued, grant, nowS, sessionId, entitlement });
  const renewed = await applyPlan(plan, user.id, sessionId, checked.revalidated && (checked.eligible || entitlement === 'revoked'));
  if (plan.slide && !renewed) plan = { ...plan, access: 'deny', slide: false };
  return { plan, continued, sessionId, nowS, entitlement, renewed, proof };
}

function packRenewed(proof: ParentSessionProof | null, renewed: string | null): string | null {
  if (!proof || !renewed) return null;
  const exp = Math.floor(Date.parse(renewed) / 1000);
  const iat = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(exp) || exp <= iat) return null;
  return packParentSession({ ...proof, iat, exp, revoked: false }, secret());
}

async function closedMode(): Promise<'off' | 'closed'> {
  const { accessClosed, signinMode } = await import('@/lib/central/parent-signin');
  return accessClosed(await signinMode()) ? 'closed' : 'off';
}

/** Page layouts. Explicit off, and an unreadable switch, keep today's password session. */
export async function enforceParentSessionPage(user: SessionUser): Promise<void> {
  const mode = await closedMode();
  if (mode === 'off') return;
  const { redirect } = await import('next/navigation');
  const { cookies } = await import('next/headers');
  const { createClient } = await import('@/lib/supabase/server');
  const jar = await cookies();
  const proofRaw = jar.get(PARENT_SESSION_COOKIE)?.value;
  const supabase = await createClient();
  const { plan, renewed, proof } = await evaluate(user, proofRaw, supabase);
  const packed = packRenewed(proof, renewed);
  if (packed) {
    try { jar.set(PARENT_SESSION_COOKIE, packed, cookieOptions(PARENT_SESSION_COOKIE_MAX_AGE)); } catch { /* server components cannot always write cookies */ }
  }
  if (plan.clearCookie) {
    try { jar.set(PARENT_SESSION_COOKIE, '', cookieOptions(0)); } catch { /* same */ }
  }
  if (plan.access === 'deny') redirect('/login?e=parent_session');
}

/** Product API routes. Returns a 401 response, or null when the request may continue. */
export async function refuseParentSession(request: { headers: { get: (name: string) => string | null } }, supabase: SessionSource, user: SessionUser): Promise<Response | null> {
  const mode = await closedMode();
  if (mode === 'off') return null;
  const { cookies } = await import('next/headers');
  const { NextResponse } = await import('next/server');
  const proofRaw = readRequestCookie(request, PARENT_SESSION_COOKIE);
  const { plan, renewed, proof } = await evaluate(user, proofRaw, supabase);
  const packed = packRenewed(proof, renewed);
  if (packed || plan.clearCookie) {
    try {
      const jar = await cookies();
      jar.set(PARENT_SESSION_COOKIE, packed ?? '', cookieOptions(packed ? PARENT_SESSION_COOKIE_MAX_AGE : 0));
    } catch { /* route test doubles have no cookie store */ }
  }
  if (plan.access === 'allow') return null;
  return NextResponse.json({ error: 'parent_session_required' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
}

/** User-scoped server actions. Same decision as the API. Service-role actions are not covered here. */
export async function allowUserServerAction(): Promise<boolean> {
  const mode = await closedMode();
  if (mode === 'off') return true;
  const { cookies } = await import('next/headers');
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const jar = await cookies();
  const { plan } = await evaluate(user, jar.get(PARENT_SESSION_COOKIE)?.value, supabase);
  return plan.access === 'allow';
}

/** Page proxy: rewrite the cookie only after the database accepts a renewal. */
export async function rememberParentSession(
  request: { cookies: { get: (name: string) => { value: string } | undefined } },
  response: { cookies: { set: (name: string, value: string, options: { httpOnly: boolean; secure: boolean; sameSite: 'lax'; path: string; maxAge: number }) => unknown } },
  supabase: SessionSource,
  user: SessionUser,
): Promise<string | null> {
  if (await closedMode() !== 'closed') return null;
  const proofRaw = request.cookies.get(PARENT_SESSION_COOKIE)?.value;
  const { plan, renewed, proof } = await evaluate(user, proofRaw, supabase);
  if (plan.access !== 'allow') return null;
  const packed = packRenewed(proof, renewed);
  if (packed) response.cookies.set(PARENT_SESSION_COOKIE, packed, cookieOptions(PARENT_SESSION_COOKIE_MAX_AGE));
  return packed;
}

/** Logout for every tab of this browser, and the grant row when it exists. */
export async function revokeBrowserParentSession(): Promise<void> {
  const { cookies } = await import('next/headers');
  const { createClient } = await import('@/lib/supabase/server');
  const jar = await cookies();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase.auth.getSession();
    const sessionId = sessionIdFromAccessToken(data.session?.access_token) ?? '';
    if (user && sessionId) {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      await createAdminClient().rpc('parent_session_revoke', { p_user: user.id, p_session: sessionId });
    }
  } catch { /* still clear the cookie */ }
  jar.set(PARENT_SESSION_COOKIE, '', cookieOptions(0));
}

function readRequestCookie(request: { headers: { get: (name: string) => string | null } }, name: string): string | undefined {
  const raw = request.headers.get('cookie') ?? '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}
