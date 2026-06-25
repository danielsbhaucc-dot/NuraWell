import {
  b64ToBytes,
  bytesToB64,
  type PrivateFieldEnvelopeV1,
} from './private-field-envelope';

const ECDH_PARAMS: EcKeyImportParams = { name: 'ECDH', namedCurve: 'P-256' };
const AES_PARAMS: AesDerivedKeyParams = { name: 'AES-GCM', length: 256 };

export async function encryptPrivateFieldValue(
  plaintext: string,
  serverPublicJwk: JsonWebKey
): Promise<PrivateFieldEnvelopeV1> {
  const serverPub = await crypto.subtle.importKey(
    'jwk',
    serverPublicJwk,
    ECDH_PARAMS,
    false,
    []
  );

  const ephemeral = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey']
  );

  const aesKey = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: serverPub },
    ephemeral.privateKey,
    AES_PARAMS,
    false,
    ['encrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    new TextEncoder().encode(plaintext)
  );

  const ephemeral_public_key = (await crypto.subtle.exportKey(
    'jwk',
    ephemeral.publicKey
  )) as JsonWebKey;

  return {
    mode: 'ecdh-aes-gcm-v1',
    ephemeral_public_key,
    iv: bytesToB64(iv),
    ciphertext: bytesToB64(new Uint8Array(ciphertext)),
  };
}

/** לבדיקות — מפענח עם מפתח פרטי (לא לשימוש בדפדפן) */
export async function decryptPrivateFieldValueForTest(
  envelope: PrivateFieldEnvelopeV1,
  serverPrivateJwk: JsonWebKey
): Promise<string> {
  const serverPriv = await crypto.subtle.importKey(
    'jwk',
    serverPrivateJwk,
    ECDH_PARAMS,
    false,
    ['deriveKey']
  );

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
