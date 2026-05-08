/**
 * Encode an image file to WebP in the browser (no server native deps).
 * Used before upload so Vercel only stores a small WebP in R2.
 */
export async function encodeImageToWebpBlob(
  file: File,
  maxSide: number,
  quality: number
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('אין תמיכה בעיבוד תמונה בדפדפן');

    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/webp', quality);
    });

    if (!blob || blob.size < 32) {
      throw new Error('WEBP_UNSUPPORTED');
    }
    return blob;
  } finally {
    bitmap.close?.();
  }
}

export function isWebpEncodeUnsupportedError(e: unknown): boolean {
  return e instanceof Error && e.message === 'WEBP_UNSUPPORTED';
}
