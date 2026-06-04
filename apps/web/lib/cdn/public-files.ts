import { resolveAlmogPublicBaseUrl } from '../ai/almog-avatar';

export function resolveCdnFilesPrefix(): string {
  const raw =
    process.env.NEXT_PUBLIC_CDN_FILES_PREFIX?.trim() ||
    process.env.CDN_FILES_PREFIX?.trim() ||
    '/files';
  const noSlashes = raw.replace(/^\/+|\/+$/g, '');
  return noSlashes ? `/${noSlashes}` : '/files';
}

export function getPublicCdnFileUrl(objectKey: string, cacheBuster?: string): string | null {
  const base = resolveAlmogPublicBaseUrl();
  if (!base) return null;
  const key = objectKey.replace(/^\/+/, '');
  const url = `${base}${resolveCdnFilesPrefix()}/${key}`;
  return cacheBuster ? `${url}?v=${encodeURIComponent(cacheBuster)}` : url;
}
