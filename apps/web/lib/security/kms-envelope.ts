/**
 * KMS envelope protection for the app's master keys (PII / vault / consent-signing).
 *
 * Production env can hold ONLY KMS-wrapped ciphertext (KMS_WRAPPED_<NAME>). On first use per server
 * instance the ciphertexts are unwrapped by Google Cloud KMS (europe-west3) and cached in memory
 * (process.env of this instance only; never logged, never persisted).
 *
 * Auth: Vercel OIDC token -> Google STS (Workload Identity Federation) -> short-lived token for the
 * `vercel-kms` service account, which only has cryptoKeyEncrypterDecrypter on one key. No long-lived
 * Google credentials exist anywhere.
 *
 * KMS_ENVELOPE_MODE:
 *   off (default) - nothing happens, plain env vars are used exactly as before.
 *   verify        - unwrap and compare fingerprints with the plain env var; the plain value keeps being used.
 *   enforce       - the unwrapped value is used. If KMS fails and a plain var still exists, falls back to it.
 *
 * The sync key getters (pii.ts etc.) call ensureKmsKeysSync(); the KMS round-trip runs in a worker
 * thread and the caller waits on Atomics (once per instance, ~3 KMS calls), so no call sites change.
 */
import { createHash } from 'node:crypto';
import { MessageChannel, Worker, receiveMessageOnPort } from 'node:worker_threads';

export const ENVELOPE_KEY_NAMES = ['PII_ENCRYPTION_KEY', 'SECURE_VAULT_KEY', 'CONSENT_SIGNING_PRIVATE_KEY'] as const;
export type EnvelopeKeyName = (typeof ENVELOPE_KEY_NAMES)[number];
export type EnvelopeMode = 'off' | 'verify' | 'enforce';

export type KmsConfig = {
  kmsKey: string;
  projectNumber: string;
  pool: string;
  serviceAccount: string;
  teamSlug: string;
};

export function kmsConfig(env: NodeJS.ProcessEnv = process.env): KmsConfig {
  return {
    kmsKey: env.GCP_KMS_KEY?.trim() || 'projects/nurawell-kms-2610/locations/europe-west3/keyRings/nurawell/cryptoKeys/nurawell-kek',
    projectNumber: env.GCP_PROJECT_NUMBER?.trim() || '553849306477',
    pool: env.GCP_WIF_POOL?.trim() || 'vercel',
    serviceAccount: env.GCP_SERVICE_ACCOUNT?.trim() || 'vercel-kms@nurawell-kms-2610.iam.gserviceaccount.com',
    teamSlug: env.VERCEL_TEAM_SLUG?.trim() || 'danielsbhaucc-2308s-projects',
  };
}

export function envelopeMode(env: NodeJS.ProcessEnv = process.env): EnvelopeMode {
  const m = env.KMS_ENVELOPE_MODE?.trim().toLowerCase();
  return m === 'verify' || m === 'enforce' ? m : 'off';
}

export const wrappedVar = (n: EnvelopeKeyName) => `KMS_WRAPPED_${n}`;
export const fingerprint = (v: string) => createHash('sha256').update(v).digest('hex').slice(0, 12);

/** Vercel OIDC token: request-context header first, then env (builds / local dev). */
export function vercelOidcTokenSync(env: NodeJS.ProcessEnv = process.env): string | null {
  const ctx = (globalThis as Record<symbol, { get?: () => { headers?: Record<string, string> } } | undefined>)[
    Symbol.for('@vercel/request-context')
  ];
  const h = ctx?.get?.()?.headers?.['x-vercel-oidc-token'];
  return h || env.VERCEL_OIDC_TOKEN?.trim() || null;
}

/** Shared by the worker (as source) and the async path. Plain JS, no imports. */
const GOOGLE_FLOW = String.raw`
async function googleToken(oidc, cfg) {
  let iss = '';
  try { iss = JSON.parse(Buffer.from(oidc.split('.')[1], 'base64url').toString()).iss || ''; } catch {}
  const provider = iss.replace(/\/$/, '') === 'https://oidc.vercel.com' ? 'vercel-global' : 'vercel-team';
  const sts = await fetch('https://sts.googleapis.com/v1/token', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grantType: 'urn:ietf:params:oauth:grant-type:token-exchange',
      audience: '//iam.googleapis.com/projects/' + cfg.projectNumber + '/locations/global/workloadIdentityPools/' + cfg.pool + '/providers/' + provider,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      requestedTokenType: 'urn:ietf:params:oauth:token-type:access_token',
      subjectTokenType: 'urn:ietf:params:oauth:token-type:jwt',
      subjectToken: oidc,
    }),
  });
  if (!sts.ok) throw new Error('sts_' + sts.status);
  const fed = (await sts.json()).access_token;
  const imp = await fetch('https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/' + cfg.serviceAccount + ':generateAccessToken', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + fed },
    body: JSON.stringify({ scope: ['https://www.googleapis.com/auth/cloudkms'], lifetime: '600s' }),
  });
  if (!imp.ok) throw new Error('impersonate_' + imp.status);
  return (await imp.json()).accessToken;
}
async function kmsCall(op, token, cfg, name, data) {
  const body = op === 'encrypt' ? { plaintext: data } : { ciphertext: data };
  body.additionalAuthenticatedData = Buffer.from('nurawell:' + name).toString('base64');
  const r = await fetch('https://cloudkms.googleapis.com/v1/' + cfg.kmsKey + ':' + op, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('kms_' + op + '_' + r.status);
  const j = await r.json();
  return op === 'encrypt' ? j.ciphertext : j.plaintext;
}
`;

type Item = { name: string; data: string };
type Runner = (op: 'encrypt' | 'decrypt', oidc: string, cfg: KmsConfig, items: Item[]) => Record<string, string>;

/** Default sync runner: worker thread + Atomics.wait. Values are base64. */
const workerRunner: Runner = (op, oidc, cfg, items) => {
  const sab = new SharedArrayBuffer(4);
  const flag = new Int32Array(sab);
  const { port1, port2 } = new MessageChannel();
  const src = `${GOOGLE_FLOW}
const { workerData } = require('node:worker_threads');
const { op, oidc, cfg, items, port, sab } = workerData;
const flag = new Int32Array(sab);
(async () => {
  try {
    const t = await googleToken(oidc, cfg);
    const out = {};
    for (const it of items) out[it.name] = await kmsCall(op, t, cfg, it.name, it.data);
    port.postMessage({ ok: true, out });
  } catch (e) { port.postMessage({ ok: false, error: String(e && e.message || e).slice(0, 80) }); }
  Atomics.store(flag, 0, 1); Atomics.notify(flag, 0);
})();`;
  const w = new Worker(src, { eval: true, workerData: { op, oidc, cfg, items, port: port2, sab }, transferList: [port2] });
  try {
    if (Atomics.wait(flag, 0, 0, 10_000) === 'timed-out') throw new Error('kms_timeout');
    const msg = receiveMessageOnPort(port1)?.message as { ok: boolean; out?: Record<string, string>; error?: string } | undefined;
    if (!msg?.ok || !msg.out) throw new Error(msg?.error || 'kms_no_result');
    return msg.out;
  } finally {
    void w.terminate();
    port1.close();
  }
};

let runner: Runner = workerRunner;
export function __setKmsRunner(r: Runner | null) { runner = r ?? workerRunner; }

export type EnvelopeStatus = {
  mode: EnvelopeMode;
  state: 'idle' | 'ok' | 'fallback' | 'failed' | 'skipped';
  at: string | null;
  error: string | null;
  keys: { name: EnvelopeKeyName; wrapped: boolean; plain: boolean; match: boolean | null; source: 'plain' | 'kms' | 'none' }[];
};

let status: EnvelopeStatus = { mode: 'off', state: 'idle', at: null, error: null, keys: [] };
let lastAttempt = 0;
const RETRY_MS = 5 * 60_000;
/** Plain values captured before we ever overwrite process.env (needed for verify/fallback). */
const originalPlain = new Map<string, string | undefined>();

export function __resetKmsEnvelope() { status = { mode: 'off', state: 'idle', at: null, error: null, keys: [] }; lastAttempt = 0; originalPlain.clear(); }
export function kmsEnvelopeStatus(): EnvelopeStatus { return { ...status, keys: status.keys.map((k) => ({ ...k })) }; }

/**
 * Idempotent. Never throws in off/verify mode. In enforce mode throws only when a key has neither a
 * working KMS unwrap nor a plain fallback (the same situation as a missing key today).
 */
export function ensureKmsKeysSync(env: NodeJS.ProcessEnv = process.env): void {
  const mode = envelopeMode(env);
  if (mode === 'off') return;
  if (status.state === 'ok' || status.state === 'skipped') return;
  if (status.state !== 'idle' && Date.now() - lastAttempt < RETRY_MS) return;
  lastAttempt = Date.now();

  for (const n of ENVELOPE_KEY_NAMES) if (!originalPlain.has(n)) originalPlain.set(n, env[n]?.trim() || undefined);
  const items: Item[] = ENVELOPE_KEY_NAMES.filter((n) => env[wrappedVar(n)]?.trim()).map((n) => ({ name: n, data: env[wrappedVar(n)]!.trim() }));
  const base = ENVELOPE_KEY_NAMES.map((n) => ({ name: n, wrapped: !!env[wrappedVar(n)]?.trim(), plain: !!originalPlain.get(n), match: null as boolean | null, source: (originalPlain.get(n) ? 'plain' : 'none') as 'plain' | 'kms' | 'none' }));
  if (!items.length) { status = { mode, state: 'skipped', at: new Date().toISOString(), error: null, keys: base }; return; }

  const oidc = vercelOidcTokenSync(env);
  let out: Record<string, string> | null = null;
  let error: string | null = null;
  if (!oidc) error = 'no_oidc_token';
  else {
    try { out = runner('decrypt', oidc, kmsConfig(env), items); } catch (e) { error = e instanceof Error ? e.message.slice(0, 80) : 'kms_error'; }
  }

  const keys = base.map((k) => {
    const b64 = out?.[k.name];
    if (!b64) return k;
    const val = Buffer.from(b64, 'base64').toString('utf8');
    const plain = originalPlain.get(k.name);
    const match = plain ? fingerprint(plain) === fingerprint(val) : null;
    if (mode === 'enforce' || !plain) { env[k.name] = val; return { ...k, match, source: 'kms' as const }; }
    return { ...k, match };
  });

  const missing = keys.some((k) => k.wrapped && k.source !== 'kms' && mode === 'enforce');
  status = { mode, state: error ? (keys.every((k) => k.source !== 'none' || !k.wrapped) ? 'fallback' : 'failed') : missing ? 'fallback' : 'ok', at: new Date().toISOString(), error, keys };
  if (error) console.warn(`[kms-envelope] unwrap failed (${error}); state=${status.state}`);
  if (status.state === 'failed' && mode === 'enforce') throw new Error('kms_keys_unavailable');
}

/** Async wrap for the admin route: returns base64 ciphertexts (safe to store/display) + fingerprints. */
export function wrapKeysSync(names: readonly EnvelopeKeyName[], env: NodeJS.ProcessEnv = process.env) {
  const oidc = vercelOidcTokenSync(env);
  if (!oidc) throw new Error('no_oidc_token');
  const items: Item[] = [];
  const fps: Record<string, string> = {};
  for (const n of names) {
    const v = (originalPlain.get(n) ?? env[n])?.trim();
    if (!v) continue;
    items.push({ name: n, data: Buffer.from(v, 'utf8').toString('base64') });
    fps[n] = fingerprint(v);
  }
  if (!items.length) throw new Error('no_keys');
  const ct = runner('encrypt', oidc, kmsConfig(env), items);
  // Round-trip check before handing anything back.
  const back = runner('decrypt', oidc, kmsConfig(env), Object.entries(ct).map(([name, data]) => ({ name, data })));
  return Object.keys(ct).map((n) => {
    const ok = fingerprint(Buffer.from(back[n] ?? '', 'base64').toString('utf8')) === fps[n];
    return { name: n as EnvelopeKeyName, envVar: wrappedVar(n as EnvelopeKeyName), ciphertext: ct[n], fingerprint: fps[n], roundTrip: ok };
  });
}
