import { CLIENT_ID, REDIRECT_URI } from './parent-connect';

/** Contract errors the product must show as themselves. Never a local password login. */
export const CONTRACT_ERRORS = ['email_unverified', 'no_license', 'unsupported_mode', 'not_migrated'] as const;
export type ContractError = (typeof CONTRACT_ERRORS)[number];

const APPROVE = /\/account\/approve\/\?t=([A-Za-z0-9_-]{16,128})$/;

export type QrStart = { url: string; t: string; expiresAt: string };
export type QrPoll = { status: 'pending' | 'approved' | 'expired' | 'denied'; code?: string };
export type CeremonyResult<T> = { ok: true; value: T } | { ok: false; error: ContractError | 'ceremony' };

const asError = (value: unknown): ContractError | null =>
  CONTRACT_ERRORS.find((item) => item === value) ?? null;

const readJson = async (res: Response): Promise<Record<string, unknown>> => {
  const data = await res.json().catch(() => null);
  return data && typeof data === 'object' ? data as Record<string, unknown> : {};
};

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
  const url = typeof body.url === 'string' ? body.url : '';
  const match = APPROVE.exec(url);
  if (!match || url.includes('@') || url.toLowerCase().includes('email')) return { ok: false, error: 'ceremony' };
  const expiresAt = typeof body.expires_at === 'string' ? body.expires_at : '';
  const ttl = Date.parse(expiresAt) - (input.nowMs ?? Date.now());
  if (!Number.isFinite(ttl) || ttl < 110_000 || ttl > 130_000) return { ok: false, error: 'ceremony' };
  return { ok: true, value: { url, t: match[1] as string, expiresAt } };
}

/** Poll is bound to the same state and client secret. The product server holds the secret. */
export async function pollParentQr(input: {
  origin: string;
  secret: string;
  state: string;
  t: string;
  fetchImpl?: typeof fetch;
}): Promise<CeremonyResult<QrPoll>> {
  const fetcher = input.fetchImpl ?? fetch;
  const res = await fetcher(`${input.origin.replace(/\/$/, '')}/id/ceremony/poll`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'qr', client_id: CLIENT_ID, client_secret: input.secret, state: input.state, t: input.t }),
  });
  const body = await readJson(res);
  const error = asError(body.error);
  if (!res.ok || error) return { ok: false, error: error ?? 'ceremony' };
  const status = body.status;
  if (status !== 'pending' && status !== 'approved' && status !== 'expired' && status !== 'denied') return { ok: false, error: 'ceremony' };
  const code = typeof body.code === 'string' ? body.code : undefined;
  return { ok: true, value: { status, code } };
}
