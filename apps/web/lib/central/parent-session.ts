import { createHmac, timingSafeEqual } from 'node:crypto';
import { timingSafeEqualStr } from '@/lib/api/timing-safe-equal';

/**
 * pl_sub is written only with the service role into app_metadata (see the parent callback and
 * completeOnboarding). The client can write user_metadata, not app_metadata. A later password
 * login still receives the stored app_metadata inside its new Supabase JWT, so pl_sub is an
 * account link, not proof that this session was opened by the parent.
 */
export const PARENT_SESSION_COOKIE = 'pl_parent_session';
/** Signed proof window. A confirmed refresh of the same session id slides this forward. */
export const PARENT_SESSION_TTL_SECONDS = 43_200;
/**
 * Browser lifetime of the cookie. The signed exp stays 12h, but the browser must still
 * present the cookie after GoTrue refreshes the access token, or a live session is stranded.
 * Logout sets maxAge 0. This does not extend a revoked grant.
 */
export const PARENT_SESSION_COOKIE_MAX_AGE = 30 * 24 * 3600;
export const QR_POLL_COOKIE = 'pl_qr_poll';

export type ParentSessionProof = {
  product: 'nurawell';
  userId: string;
  sessionId: string;
  parentSub: string;
  iat: number;
  exp: number;
  revoked?: boolean;
};

export type ParentSessionDecision = 'skip' | 'ok' | 'missing' | 'mismatch' | 'expired' | 'revoked';

const macOf = (body: string, secret: string) => createHmac('sha256', secret).update(body).digest('base64url');

export function packParentSession(proof: ParentSessionProof, secret: string): string | null {
  if (secret.length < 32 || proof.product !== 'nurawell') return null;
  if (!proof.userId || !proof.sessionId || !proof.parentSub) return null;
  if (!Number.isFinite(proof.iat) || !Number.isFinite(proof.exp) || proof.exp <= proof.iat) return null;
  const body = Buffer.from(JSON.stringify({
    product: proof.product, userId: proof.userId, sessionId: proof.sessionId, parentSub: proof.parentSub,
    iat: proof.iat, exp: proof.exp, revoked: proof.revoked === true,
  })).toString('base64url');
  return `${body}.${macOf(body, secret)}`;
}

export function unpackParentSession(raw: string | undefined, secret: string): ParentSessionProof | null {
  if (!raw || secret.length < 32) return null;
  const cut = raw.lastIndexOf('.');
  if (cut < 1) return null;
  const body = raw.slice(0, cut);
  const got = Buffer.from(raw.slice(cut + 1));
  const want = Buffer.from(macOf(body, secret));
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString()) as Partial<ParentSessionProof>;
    if (parsed.product !== 'nurawell') return null;
    if (typeof parsed.userId !== 'string' || typeof parsed.sessionId !== 'string' || typeof parsed.parentSub !== 'string') return null;
    if (typeof parsed.iat !== 'number' || typeof parsed.exp !== 'number') return null;
    return {
      product: 'nurawell', userId: parsed.userId, sessionId: parsed.sessionId, parentSub: parsed.parentSub,
      iat: parsed.iat, exp: parsed.exp, revoked: parsed.revoked === true,
    };
  } catch {
    return null;
  }
}

/**
 * Trust comes only from the signed proof bound to this product, user and Supabase session.
 * user_metadata and app_metadata, including pl_sub, are ignored here.
 */
export function parentSessionDecision(input: {
  modeOn: boolean;
  proof: ParentSessionProof | null;
  userId: string;
  sessionId: string;
  nowS: number;
  userMetadata?: Record<string, unknown> | null;
  appMetadata?: Record<string, unknown> | null;
}): ParentSessionDecision {
  if (!input.modeOn) return 'skip';
  void input.userMetadata;
  void input.appMetadata;
  if (!input.proof) return 'missing';
  if (input.proof.revoked) return 'revoked';
  if (input.proof.exp < input.nowS || input.proof.iat > input.nowS + 30) return 'expired';
  if (input.proof.product !== 'nurawell' || input.proof.userId !== input.userId || input.proof.sessionId !== input.sessionId) return 'mismatch';
  if (!input.sessionId) return 'missing';
  return 'ok';
}

/** Payload read after Supabase has already accepted the access token. This function does not check the signature. */
export function sessionIdFromAccessToken(accessToken: string | undefined): string | null {
  const part = accessToken?.split('.')[1];
  if (!part) return null;
  try {
    const payload = JSON.parse(Buffer.from(part, 'base64url').toString()) as { session_id?: unknown };
    return typeof payload.session_id === 'string' && payload.session_id.length > 0 ? payload.session_id : null;
  } catch {
    return null;
  }
}

/** Nonce binding is a separate check from JWT signature verification. */
export function boundNonceOk(claimNonce: string | undefined, expected: string): boolean {
  return Boolean(claimNonce) && claimNonce!.length === expected.length && timingSafeEqualStr(claimNonce!, expected);
}
