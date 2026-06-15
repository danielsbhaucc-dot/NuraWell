/** Shared WebP validation for admin image upload routes. */

/** Client sends pre-compressed WebP; keep margin under Vercel ~4.5 MB body limit. */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export function isWebpBuffer(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  return (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  );
}
