import { getPublicCdnAudioUrl } from './public-audio';
import { getPublicCdnFileUrl } from './public-files';
import { getPublicCdnImageUrl } from './public-images';
import type { MediaAssetRow, MediaKind } from '@/lib/validation/media-asset';

export function resolvePublicUrlForAsset(row: Pick<MediaAssetRow, 'kind' | 'object_key' | 'public_url' | 'external_url'>): string | null {
  if (row.public_url?.trim()) return row.public_url;
  if (row.kind === 'video') return row.external_url ?? null;
  const key = row.object_key?.trim();
  if (!key) return null;
  if (row.kind === 'image') return getPublicCdnImageUrl(key);
  if (row.kind === 'audio') return getPublicCdnAudioUrl(key);
  if (row.kind === 'file') return getPublicCdnFileUrl(key);
  return null;
}

export function buildPublicUrlForUpload(params: {
  kind: Exclude<MediaKind, 'video'>;
  objectKey: string;
}): string | null {
  const { kind, objectKey } = params;
  if (kind === 'image') return getPublicCdnImageUrl(objectKey);
  if (kind === 'audio') return getPublicCdnAudioUrl(objectKey);
  return getPublicCdnFileUrl(objectKey);
}
