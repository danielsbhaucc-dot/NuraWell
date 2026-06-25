import 'server-only';

import {
  b64ToBytes,
  type PrivateFieldEnvelopeV1,
  type PrivateFieldTlsPayloadV1,
} from './private-field-envelope';

const ECDH_PARAMS: EcKeyImportParams = { name: 'ECDH', namedCurve: 'P-256' };
const AES_PARAMS: AesDerivedKeyParams = { name: 'AES-GCM', length: 256 };

function parsePrivateJwk(): JsonWebKey | null {
  const raw = process.env.PROFILE_VAULT_ECDH_PRIVATE_JWK?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as JsonWebKey;
  } catch {
    return null;
  }
}

function parsePublicJwk(): JsonWebKey | null {
  const raw =
    process.env.PROFILE_VAULT_ECDH_PUBLIC_JWK?.trim() ||
    process.env.NEXT_PUBLIC_PROFILE_VAULT_ECDH_PUBLIC_JWK?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as JsonWebKey;
  } catch {
    return null;
  }
}

export function profileVaultEncryptionEnabled(): boolean {
  return Boolean(parsePrivateJwk() && parsePublicJwk());
}

export async function getProfileVaultPublicJwk(): Promise<JsonWebKey | null> {
  return parsePublicJwk();
}

export async function decryptPrivateFieldEnvelope(
  envelope: PrivateFieldEnvelopeV1
): Promise<string> {
  const privJwk = parsePrivateJwk();
  if (!privJwk) throw new Error('VAULT_NOT_CONFIGURED');

  const serverPriv = await crypto.subtle.importKey('jwk', privJwk, ECDH_PARAMS, false, [
    'deriveKey',
  ]);

  const ephemeralPub = await crypto.subtle.importKey(
    'jwk',
    envelope.ephemeral_public_key,
    ECDH_PARAMS,
    false,
    []
  );

  const aesKey = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: ephemeralPub },
    serverPriv,
    AES_PARAMS,
    false,
    ['decrypt']
  );

  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(envelope.iv) as BufferSource },
    aesKey,
    b64ToBytes(envelope.ciphertext) as BufferSource
  );

  return new TextDecoder().decode(plain);
}

export async function resolvePrivateFieldPlaintext(
  envelope: PrivateFieldEnvelopeV1 | PrivateFieldTlsPayloadV1
): Promise<string> {
  if (envelope.mode === 'tls-v1') {
    if (process.env.NODE_ENV === 'production' && profileVaultEncryptionEnabled()) {
      throw new Error('ENCRYPTION_REQUIRED');
    }
    return envelope.value;
  }
  return decryptPrivateFieldEnvelope(envelope);
}
