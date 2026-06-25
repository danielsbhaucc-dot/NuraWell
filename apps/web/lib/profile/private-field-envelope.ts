export type PrivateFieldTransportMode = 'ecdh-aes-gcm-v1' | 'tls-v1';

export type PrivateFieldEnvelopeV1 = {
  mode: 'ecdh-aes-gcm-v1';
  ephemeral_public_key: JsonWebKey;
  iv: string;
  ciphertext: string;
};

export type PrivateFieldTlsPayloadV1 = {
  mode: 'tls-v1';
  value: string;
};

export type PrivateFieldSubmitBody = {
  key: 'full_name' | 'current_weight_kg' | 'goal_weight_kg' | 'wake_up_time' | 'sleep_time';
  envelope: PrivateFieldEnvelopeV1 | PrivateFieldTlsPayloadV1;
};

function bytesToB64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export { bytesToB64, b64ToBytes };
