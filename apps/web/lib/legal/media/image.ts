import 'server-only';
import { dHashFromGray } from './core';

export type ImageFacts = { width: number | null; height: number | null; phash: string | null; thumbJpeg: Buffer | null };

/** Perceptual hash + small preview (for the cheap describe step and the PDF). Never throws. */
export async function imageFacts(bytes: Buffer, mime: string): Promise<ImageFacts> {
  if (!/^image\//.test(mime)) return { width: null, height: null, phash: null, thumbJpeg: null };
  try {
    const sharp = (await import('sharp')).default;
    const base = sharp(bytes, { limitInputPixels: 8192 * 8192, density: mime.includes('svg') ? 144 : undefined });
    const m = await base.metadata();
    const gray = await sharp(bytes, { density: mime.includes('svg') ? 72 : undefined }).flatten({ background: '#ffffff' }).grayscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
    const thumb = await sharp(bytes, { density: mime.includes('svg') ? 144 : undefined }).flatten({ background: '#ffffff' }).resize({ width: 384, height: 384, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
    return { width: m.width ?? null, height: m.height ?? null, phash: dHashFromGray(new Uint8Array(gray)), thumbJpeg: thumb };
  } catch {
    return { width: null, height: null, phash: null, thumbJpeg: null };
  }
}
