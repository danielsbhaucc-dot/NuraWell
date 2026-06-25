/**
 * יוצר זוג מפתחות ECDH P-256 לערוץ השדות הפרטיים בפרופיל.
 * הרץ: node scripts/generate-profile-vault-keys.mjs
 */
import { webcrypto } from 'node:crypto';

const subtle = webcrypto.subtle;

const pair = await subtle.generateKey(
  { name: 'ECDH', namedCurve: 'P-256' },
  true,
  ['deriveKey']
);

const publicJwk = await subtle.exportKey('jwk', pair.publicKey);
const privateJwk = await subtle.exportKey('jwk', pair.privateKey);

console.log('הוסף ל-.env.local (פרטי — לעולם לא לגיט):\n');
console.log(`PROFILE_VAULT_ECDH_PRIVATE_JWK=${JSON.stringify(privateJwk)}`);
console.log(`PROFILE_VAULT_ECDH_PUBLIC_JWK=${JSON.stringify(publicJwk)}`);
