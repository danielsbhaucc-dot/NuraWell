import { getPublicCdnImageUrl } from '@/lib/cdn/public-images';

/** מפתח אובייקט R2 לרקע מדריך. */
export function guideBackgroundObjectKey(guideId: string): string {
  return `guides/backgrounds/${guideId}.webp`;
}

/** ממיר background_image_key ל-URL ציבורי. */
export function resolveGuideBackgroundUrl(
  backgroundImageKey: string | null | undefined,
  cacheBuster?: string
): string | null {
  if (!backgroundImageKey?.trim()) return null;
  return getPublicCdnImageUrl(backgroundImageKey.trim(), cacheBuster);
}
