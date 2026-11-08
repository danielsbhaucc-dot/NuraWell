import {
  packParentSession,
  parentSessionDecision,
  sessionIdFromAccessToken,
  unpackParentSession,
  PARENT_SESSION_COOKIE,
  PARENT_SESSION_COOKIE_MAX_AGE,
  PARENT_SESSION_TTL_SECONDS,
  type ParentSessionDecision,
  type ParentSessionProof,
} from './parent-session';

/**
 * Data-plane authorization for central mode.
 * The HMAC cookie is an app proof. Postgres never sees it. A password JWT still
 * satisfies today's auth.uid() policies. The grant row is the record RLS can see,
 * and only after parent-session-rls.design.sql is applied — it is not applied here.
 * Missing table ⇒ the app decision stands and the direct-call bypass stays open.
 */

export type Entitlement = 'active' | 'revoked' | 'unknown';

export type GrantRow = {
  userId: string;
  sessionId: string;
  expiresAt: number;
  revokedAt: number | null;
  entitlementRevokedAt: number | null;
};

export type SigninColumn = 'off' | 'test' | 'all' | null;

export type Continuation = {
  decision: ParentSessionDecision;
  next: ParentSessionProof | null;
  entitlementRevoked: boolean;
};

const SLIDE_WITHIN_SECONDS = 3600;

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
  if (!input.proof) return { decision: base, next: null, entitlementRevoked: false };
  if (input.proof.revoked) return { decision: 'revoked', next: null, entitlementRevoked: false };
  const same = input.proof.userId === input.userId && input.proof.sessionId === input.sessionId && input.sessionId.length > 0;
  if (!same) return { decision: base === 'ok' ? 'mismatch' : base, next: null, entitlementRevoked: false };
  if (input.entitlement === 'revoked') {
    return { decision: input.proof.exp < input.nowS ? 'expired' : 'ok', next: null, entitlementRevoked: true };
  }
  if (input.entitlement === 'active' && (base === 'ok' || base === 'expired')) {
    return {
      decision: 'ok',
      next: { ...input.proof, revoked: false, iat: input.nowS, exp: input.nowS + PARENT_SESSION_TTL_SECONDS },
      entitlementRevoked: false,
    };
  }
  return { decision: base, next: null, entitlementRevoked: false };
}

/** True when the signed window should be rewritten so the browser still sends it. */
export function shouldPersistSlide(proof: ParentSessionProof, nowS: number): boolean {
  return proof.exp < nowS + SLIDE_WITHIN_SECONDS;
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
  if (input.signinColumn !== 'test' && input.signinColumn !== 'all') return true;
  if (!input.sub || !input.sessionId) return false;
  const grant = input.grants.find((row) => row.userId === input.sub && row.sessionId === input.sessionId);
  if (!grant || grant.revokedAt !== null || grant.entitlementRevokedAt !== null) return false;
  return grant.expiresAt >= input.nowS;
}

/** Same session id, active entitlement: move expires_at forward. Revoked entitlement does not. */
export function slideGrant(grant: GrantRow, nowS: number, entitlement: Entitlement, sessionId: string): GrantRow | null {
  if (grant.sessionId !== sessionId || grant.revokedAt !== null) return null;
  if (entitlement === 'revoked') {
    return { ...grant, entitlementRevokedAt: grant.entitlementRevokedAt ?? nowS };
  }
  if (entitlement !== 'active') return { ...grant };
  return { ...grant, expiresAt: nowS + PARENT_SESSION_TTL_SECONDS, entitlementRevokedAt: null };
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
  if (input.grant.kind === 'error') return deny(false);
  if (input.grant.kind === 'absent-table') {
    return {
      access: 'allow',
      slide: false,
      markEntitlement: input.continued.entitlementRevoked,
      clearCookie: false,
    };
  }
  const row = input.grant.row;
  if (!row || row.sessionId !== input.sessionId) return deny(false);
  if (row.revokedAt !== null) return deny(true);
  const renew = input.entitlement === 'active'
    && (row.expiresAt < input.nowS + SLIDE_WITHIN_SECONDS || row.entitlementRevokedAt !== null);
  if (row.expiresAt < input.nowS && input.entitlement !== 'active') {
    return { access: 'deny', slide: false, markEntitlement: input.continued.entitlementRevoked, clearCookie: false };
  }
  return {
    access: 'allow',
    slide: renew,
    markEntitlement: input.continued.entitlementRevoked,
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

const classify = (error: GrantError): GrantWrite => (!error ? 'recorded' : missingRelation(error) ? 'unapplied' : 'failed');

let grantsTableAbsentUntil = 0;

export function resetGrantTableProbe(): void {
  grantsTableAbsentUntil = 0;
}

function stampAbsent(): void {
  grantsTableAbsentUntil = Date.now() + 30_000;
}

export async function recordParentSessionGrant(admin: unknown, input: {
  userId: string;
  sessionId: string;
  parentSub: string;
  issuedAt: number;
  expiresAt: number;
}): Promise<GrantWrite> {
  try {
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
  } catch (error) {
    return missingRelation(error) ? 'unapplied' : 'failed';
  }
}

async function patchGrant(admin: unknown, userId: string, sessionId: string, values: Record<string, unknown>): Promise<GrantWrite> {
  try {
    const { error } = await (admin as GrantClient).from('parent_session_grants').update(values).eq('user_id', userId).eq('session_id', sessionId);
    if (missingRelation(error)) stampAbsent();
    return classify(error);
  } catch (error) {
    if (missingRelation(error)) stampAbsent();
    return missingRelation(error) ? 'unapplied' : 'failed';
  }
}

const cookieOptions = (maxAge: number) => ({
  httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', maxAge,
});

function secret(): string {
  return process.env.PLATFORM_ID_CLIENT_SECRET ?? '';
}

async function readEntitlement(user: { id: string; app_metadata?: Record<string, unknown> | null }): Promise<Entitlement> {
  if (process.env.PLATFORM_LICENSE_MODE !== 'enforce') return 'active';
  try {
    const { licenseGate, profileRole } = await import('@/lib/central/license-gate');
    const gate = await licenseGate(user, await profileRole(user.id));
    if (gate.block) return 'revoked';
    if (gate.why === 'outage') return 'unknown';
    return 'active';
  } catch {
    return 'unknown';
  }
}

function grantFrom(data: Record<string, unknown> | null): GrantRow | null {
  if (!data || typeof data.user_id !== 'string' || typeof data.session_id !== 'string' || typeof data.expires_at !== 'string') return null;
  const expiresAt = Date.parse(data.expires_at);
  if (!Number.isFinite(expiresAt)) return null;
  const at = (value: unknown) => (typeof value === 'string' ? Date.parse(value) / 1000 : null);
  const revokedAt = at(data.revoked_at);
  const entitlementRevokedAt = at(data.entitlement_revoked_at);
  return {
    userId: data.user_id,
    sessionId: data.session_id,
    expiresAt: Math.floor(expiresAt / 1000),
    revokedAt: revokedAt !== null && Number.isFinite(revokedAt) ? revokedAt : null,
    entitlementRevokedAt: entitlementRevokedAt !== null && Number.isFinite(entitlementRevokedAt) ? entitlementRevokedAt : null,
  };
}

async function readGrant(userId: string, sessionId: string): Promise<GrantRead> {
  if (Date.now() < grantsTableAbsentUntil) return { kind: 'absent-table' };
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const { data, error } = await createAdminClient()
      .from('parent_session_grants')
      .select('user_id, session_id, expires_at, revoked_at, entitlement_revoked_at')
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .maybeSingle();
    if (missingRelation(error)) {
      stampAbsent();
      return { kind: 'absent-table' };
    }
    if (error) return { kind: 'error' };
    return { kind: 'row', row: grantFrom(data as Record<string, unknown> | null) };
  } catch (error) {
    if (missingRelation(error)) {
      stampAbsent();
      return { kind: 'absent-table' };
    }
    return { kind: 'error' };
  }
}

async function applyPlan(plan: AccessPlan, userId: string, sessionId: string, nowS: number, entitlement: Entitlement): Promise<void> {
  if (!plan.slide && !plan.markEntitlement) return;
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();
    if (plan.markEntitlement) {
      await patchGrant(admin, userId, sessionId, { entitlement_revoked_at: new Date(nowS * 1000).toISOString() });
      return;
    }
    const values: Record<string, unknown> = { expires_at: new Date((nowS + PARENT_SESSION_TTL_SECONDS) * 1000).toISOString() };
    if (entitlement === 'active') values.entitlement_revoked_at = null;
    await patchGrant(admin, userId, sessionId, values);
  } catch {
    /* table not applied, or the admin client is unavailable: app decision already stands */
  }
}

type SessionUser = { id: string; user_metadata?: Record<string, unknown> | null; app_metadata?: Record<string, unknown> | null };
type SessionSource = { auth: { getSession: () => Promise<{ data: { session: { access_token?: string } | null } }> } };

async function evaluate(user: SessionUser, proofRaw: string | undefined, supabase: SessionSource): Promise<{
  plan: AccessPlan;
  continued: Continuation;
  sessionId: string;
  nowS: number;
  entitlement: Entitlement;
}> {
  const { data } = await supabase.auth.getSession();
  const sessionId = sessionIdFromAccessToken(data.session?.access_token) ?? '';
  const nowS = Math.floor(Date.now() / 1000);
  const proof = unpackParentSession(proofRaw, secret());
  const entitlement = await readEntitlement(user);
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
  const grant = continued.decision === 'ok' || continued.entitlementRevoked
    ? await readGrant(user.id, sessionId)
    : { kind: 'absent-table' as const };
  const plan = planParentAccess({ continued, grant, nowS, sessionId, entitlement });
  await applyPlan(plan, user.id, sessionId, nowS, entitlement);
  return { plan, continued, sessionId, nowS, entitlement };
}

function packedSlide(continued: Continuation, proof: ParentSessionProof | null, nowS: number): string | null {
  if (!continued.next || !proof || !shouldPersistSlide(proof, nowS)) return null;
  return packParentSession(continued.next, secret());
}

/** Page layouts. Mode off keeps today's password session. */
export async function enforceParentSessionPage(user: SessionUser): Promise<void> {
  const { centralAuthOn, signinMode } = await import('@/lib/central/parent-signin');
  if (!centralAuthOn(await signinMode())) return;
  const { cookies } = await import('next/headers');
  const { createClient } = await import('@/lib/supabase/server');
  const jar = await cookies();
  const proofRaw = jar.get(PARENT_SESSION_COOKIE)?.value;
  const supabase = await createClient();
  const { plan, continued, nowS } = await evaluate(user, proofRaw, supabase);
  const packed = packedSlide(continued, unpackParentSession(proofRaw, secret()), nowS);
  if (packed) {
    try { jar.set(PARENT_SESSION_COOKIE, packed, cookieOptions(PARENT_SESSION_COOKIE_MAX_AGE)); } catch { /* server components cannot always write cookies */ }
  }
  if (plan.clearCookie) {
    try { jar.set(PARENT_SESSION_COOKIE, '', cookieOptions(0)); } catch { /* same */ }
  }
  if (plan.access === 'deny') {
    const { redirect } = await import('next/navigation');
    redirect('/login?e=parent_session');
  }
}

/** Product API routes. Returns a 401 response, or null when the request may continue. */
export async function refuseParentSession(request: { headers: { get: (name: string) => string | null } }, supabase: SessionSource, user: SessionUser): Promise<Response | null> {
  const { cookies } = await import('next/headers');
  const proofRaw = readRequestCookie(request, PARENT_SESSION_COOKIE);
  const { plan, continued, nowS } = await evaluate(user, proofRaw, supabase);
  const packed = packedSlide(continued, unpackParentSession(proofRaw, secret()), nowS);
  if (packed || plan.clearCookie) {
    try {
      const jar = await cookies();
      jar.set(PARENT_SESSION_COOKIE, packed ?? '', cookieOptions(packed ? PARENT_SESSION_COOKIE_MAX_AGE : 0));
    } catch { /* route test doubles have no cookie store */ }
  }
  if (plan.access === 'allow') return null;
  const { NextResponse } = await import('next/server');
  return NextResponse.json({ error: 'parent_session_required' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
}

/** User-scoped server actions. Same decision as the API. Service-role actions are not covered here. */
export async function allowUserServerAction(): Promise<boolean> {
  const { centralAuthOn, signinMode } = await import('@/lib/central/parent-signin');
  if (!centralAuthOn(await signinMode())) return true;
  const { cookies } = await import('next/headers');
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const jar = await cookies();
  const { plan } = await evaluate(user, jar.get(PARENT_SESSION_COOKIE)?.value, supabase);
  return plan.access === 'allow';
}

/**
 * Page proxy: refresh the browser cookie when the same session is still entitled,
 * so a 12h maxAge does not drop a session GoTrue has already refreshed.
 * Does not clear the cookie and does not redirect — layouts do that.
 */
export async function rememberParentSession(
  request: { cookies: { get: (name: string) => { value: string } | undefined } },
  response: { cookies: { set: (name: string, value: string, options: { httpOnly: boolean; secure: boolean; sameSite: 'lax'; path: string; maxAge: number }) => unknown } },
  supabase: SessionSource,
  user: SessionUser,
): Promise<string | null> {
  const { centralAuthOn, signinMode } = await import('@/lib/central/parent-signin');
  if (!centralAuthOn(await signinMode())) return null;
  const proofRaw = request.cookies.get(PARENT_SESSION_COOKIE)?.value;
  const proof = unpackParentSession(proofRaw, secret());
  if (!proof || !shouldPersistSlide(proof, Math.floor(Date.now() / 1000))) return null;
  const { continued, nowS, plan } = await evaluate(user, proofRaw, supabase);
  if (plan.access !== 'allow') return null;
  const packed = packedSlide(continued, proof, nowS);
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
      await patchGrant(createAdminClient(), user.id, sessionId, { revoked_at: new Date().toISOString() });
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
