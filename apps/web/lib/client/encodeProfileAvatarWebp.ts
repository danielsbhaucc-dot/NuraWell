import { encodeImageToWebpBlob } from './encodeAlmogAvatarWebp';

const MAX_SIDE = 512;
const TARGET_BYTES = 400_000;

/** דחיסה אגרסיבית לתמונת פרופיל — מקטין כמה שאפשר בלי לחסום משתמש */
export async function encodeProfileAvatarWebp(file: File): Promise<Blob> {
  const qualities = [0.82, 0.72, 0.62, 0.52, 0.42];
  const sides = [MAX_SIDE, 420, 320];

  let best: Blob | null = null;

  for (const side of sides) {
    for (const q of qualities) {
      try {
        const blob = await encodeImageToWebpBlob(file, side, q);
        if (!best || blob.size < best.size) best = blob;
        if (blob.size <= TARGET_BYTES) return blob;
      } catch {
        continue;
      }
    }
  }

  if (best) return best;
  return encodeImageToWebpBlob(file, MAX_SIDE, 0.75);
}
