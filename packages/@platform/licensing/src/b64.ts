export const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');
export const unb64u = (s: string) => Buffer.from(s, 'base64url');
export { canonicalJson } from './canonical';
