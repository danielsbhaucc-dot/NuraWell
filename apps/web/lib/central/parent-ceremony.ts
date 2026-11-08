import { CLIENT_ID, REDIRECT_URI } from './parent-connect';

/** Contract errors the product must show as themselves. Never a local password login. */
export const CONTRACT_ERRORS = ['email_unverified', 'no_license', 'unsupported_mode', 'not_migrated'] as const;
export type ContractError = (typeof CONTRACT_ERRORS)[number];

const APPROVE = /\/account\/approve\/\?t=([A-Za-z0-9_-]{16,128})$/;
const QR_TTL_MS = 120_000;

export type QrStart = { url: string; expiresAt: string; pollToken: string };
export type QrPoll = { status: 'pending' | 'approved' | 'expired' | 'denied'; code?: string };
export type CeremonyResult<T> = { ok: true; value: T } | { ok: false; error: ContractError | 'ceremony' };

const asError = (value: unknown): ContractError | null =>
  CONTRACT_ERRORS.find((item) => item === value) ?? null;

const readJson = async (res: Response): Promise<Record<string, unknown>> => {
  const data = await res.json().catch(() => null);
  return data && typeof data === 'object' ? data as Record<string, unknown> : {};
};

const nestedQr = (body: Record<string, unknown>): Record<string, unknown> | null =>
  body.qr && typeof body.qr === 'object' ? body.qr as Record<string, unknown> : null;

/** Accept either flat url/expires_at or qr.url/expires_in. poll_token is required and must not be the visible t. */
export function readQrStart(body: Record<string, unknown>, nowMs: number): QrStart | null {
  const qr = nestedQr(body);
  const url = typeof body.url === 'string' ? body.url : typeof qr?.url === 'string' ? qr.url : '';
  const match = APPROVE.exec(url);
  if (!match || url.includes('@') || url.toLowerCase().includes('email')) return null;
  const visibleT = match[1] as string;
  const pollToken = typeof body.poll_token === 'string' ? body.poll_token : '';
  if (pollToken.length < 16 || pollToken === visibleT) return null;
  let expiresAt = '';
  if (typeof body.expires_at === 'string') expiresAt = body.expires_at;
  else if (typeof body.expires_in === 'number') expiresAt = new Date(nowMs + body.expires_in * 1000).toISOString();
  else if (typeof qr?.expires_in === 'number') expiresAt = new Date(nowMs + qr.expires_in * 1000).toISOString();
  const ttl = Date.parse(expiresAt) - nowMs;
  if (!Number.isFinite(ttl) || ttl < QR_TTL_MS - 10_000 || ttl > QR_TTL_MS + 10_000) return null;
  return { url, expiresAt, pollToken };
}

/** Parent QR ceremony. Body uses only authorize fields plus mode and the product client secret. */
export async function startParentQr(input: {
  origin: string;
  secret: string;
  state: string;
  nonce: string;
  challenge: string;
  fetchImpl?: typeof fetch;
  nowMs?: number;
}): Promise<CeremonyResult<QrStart>> {
  const fetcher = input.fetchImpl ?? fetch;
  const nowMs = input.nowMs ?? Date.now();
  const res = await fetcher(`${input.origin.replace(/\/$/, '')}/id/ceremony`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'qr',
      client_id: CLIENT_ID,
      client_secret: input.secret,
      redirect_uri: REDIRECT_URI,
      state: input.state,
      nonce: input.nonce,
      code_challenge: input.challenge,
      code_challenge_method: 'S256',
    }),
  });
  const body = await readJson(res);
  const error = asError(body.error);
  if (!res.ok || error) return { ok: false, error: error ?? 'ceremony' };
  const value = readQrStart(body, nowMs);
  return value ? { ok: true, value } : { ok: false, error: 'ceremony' };
}

/**
 * Poll with the server-held poll_token, client secret and the same state.
 * A request that carries only the visible t is not sent.
 */
export async function pollParentQr(input: {
  origin: string;
  secret: string;
  state: string;
  pollToken: string;
  fetchImpl?: typeof fetch;
}): Promise<CeremonyResult<QrPoll>> {
  if (!input.pollToken || input.pollToken.length < 16) return { ok: false, error: 'ceremony' };
  const fetcher = input.fetchImpl ?? fetch;
  const res = await fetcher(`${input.origin.replace(/\/$/, '')}/id/ceremony/poll`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'qr',
      client_id: CLIENT_ID,
      client_secret: input.secret,
      state: input.state,
      poll_token: input.pollToken,
    }),
  });
  const body = await readJson(res);
  if (res.status === 401) return { ok: false, error: 'ceremony' };
  const error = asError(body.error);
  if (!res.ok || error) return { ok: false, error: error ?? 'ceremony' };
  const status = body.status;
  if (status !== 'pending' && status !== 'approved' && status !== 'expired' && status !== 'denied') return { ok: false, error: 'ceremony' };
  const code = typeof body.code === 'string' ? body.code : undefined;
  return { ok: true, value: { status, code } };
}
