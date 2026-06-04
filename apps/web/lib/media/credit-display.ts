import type { MediaCredit, MediaSource } from '@/lib/validation/media-asset';

/** האם חובה להציג קרדיט למשתמש לפי מקור/רישיון. */
export function creditRequiresAttribution(source: MediaSource, credit?: MediaCredit | null): boolean {
  if (credit?.requires_attribution === true) return true;
  if (credit?.requires_attribution === false) return false;
  if (source === 'pixabay' || source === 'pexels') return true;
  if (source === 'suno') return false;
  if (source === 'upload') return false;
  return Boolean(
    credit?.author || credit?.photographer || credit?.page_url || credit?.link
  );
}

export function creditDisplayLabel(credit: MediaCredit | null | undefined, source: MediaSource): string | null {
  if (!creditRequiresAttribution(source, credit)) return null;
  const name = credit?.author || credit?.photographer;
  if (name) return name;
  if (source === 'pixabay') return 'Pixabay';
  if (source === 'pexels') return 'Pexels';
  return null;
}

export function defaultCreditForSource(source: MediaSource): MediaCredit {
  if (source === 'suno') {
    return { source: 'suno', license: 'Suno Pro commercial', requires_attribution: false };
  }
  if (source === 'pixabay') {
    return { source: 'pixabay', requires_attribution: true };
  }
  if (source === 'pexels') {
    return { source: 'pexels', requires_attribution: true };
  }
  return { source, requires_attribution: false };
}
