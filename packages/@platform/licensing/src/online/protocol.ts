/** Wire format between a buyer install and the optional online verifier. */
export type VerifyRequest = { token: string; moduleId: string; version: string; host: string; nonce: string; core?: { name: string; input: unknown } };
export type VerifyVerdict = {
  v: 1; lid: string | null; nonce: string; at: string;
  ok: boolean; reason?: string; state?: string; until?: string; core?: unknown;
};
/** Signed with the VERIFIER key (separate from the license-issuing key; a leaked verifier key cannot mint licenses). */
export type SignedVerdict = { verdict: VerifyVerdict; sig: string };
