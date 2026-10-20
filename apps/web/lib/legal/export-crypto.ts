import 'server-only';
/**
 * Per-export AES-256 protection. A fresh strong password is generated for every export, returned ONCE
 * to the admin UI and never stored (only a salted scrypt verifier lands in the permanent access log).
 * PDF: standard PDF 2.0 AES-256 (V=5,R=6). ZIP: WinZip AES-256 entries. File hashes inside the package
 * (SHA256SUMS.txt, signatures, TSA/OTS proofs) are computed on the ORIGINAL files, so they still verify
 * after the archive is opened with the password.
 */
import { randomBytes, scryptSync } from 'node:crypto';

export { generatePassphrase as generateExportPassword } from './passphrase';

/** Salted scrypt verifier (lets us later confirm a password someone presents, without storing it). */
export function passwordVerifier(pw: string): { alg: string; salt: string; hash: string } {
  const salt = randomBytes(16);
  return { alg: 'scrypt-N16384-r8-p1', salt: salt.toString('base64'), hash: scryptSync(pw, salt, 32).toString('base64') };
}

export async function encryptPdf(pdf: Uint8Array, password: string): Promise<Buffer> {
  const { encryptPDF } = await import('@pdfsmaller/pdf-encrypt');
  const out = await encryptPDF(pdf, password, { ownerPassword: randomBytes(24).toString('base64url'), algorithm: 'AES-256' });
  return Buffer.from(out);
}

export async function encryptZip(files: Record<string, Uint8Array>, password: string): Promise<Buffer> {
  const zip = await import('@zip.js/zip.js');
  zip.configure({ useWebWorkers: false });
  const w = new zip.ZipWriter(new zip.Uint8ArrayWriter(), { password, encryptionStrength: 3, zipCrypto: false });
  for (const name of Object.keys(files).sort()) await w.add(name, new zip.Uint8ArrayReader(files[name]!), { level: 6 });
  return Buffer.from(await w.close());
}
