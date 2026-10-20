/**
 * Retired consent-evidence signing PUBLIC keys (never private keys). After a rotation, append the old
 * key here so every signature it ever made stays verifiable and stays published at
 * /.well-known/nurawell-consent-signing-keys.json. Never remove entries. See docs/security/key-backup.md.
 */
export type RetiredSigningKey = { keyId: string; pem: string; validFrom: string; retiredAt: string; reason: string };

export const RETIRED_SIGNING_KEYS: RetiredSigningKey[] = [];
