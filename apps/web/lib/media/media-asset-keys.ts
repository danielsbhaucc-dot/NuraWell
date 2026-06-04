import { randomUUID } from 'node:crypto';
import type { FileSubtype, MediaKind } from '@/lib/validation/media-asset';

const SAFE_EXT = /^[a-z0-9]{1,8}$/i;

export function inferFileSubtype(filename: string, mimeType?: string): FileSubtype {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const mime = (mimeType ?? '').toLowerCase();

  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (
    ['ppt', 'pptx', 'odp', 'key'].includes(ext) ||
    mime.includes('presentation') ||
    mime.includes('powerpoint')
  ) {
    return 'presentation';
  }
  if (
    ['doc', 'docx', 'odt', 'rtf'].includes(ext) ||
    mime.includes('msword') ||
    mime.includes('wordprocessing')
  ) {
    return 'word';
  }
  if (
    ['xls', 'xlsx', 'ods', 'csv'].includes(ext) ||
    mime.includes('spreadsheet') ||
    mime.includes('excel')
  ) {
    return 'spreadsheet';
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) || mime.includes('zip') || mime.includes('archive')) {
    return 'archive';
  }
  return 'other';
}

function extensionFromFilename(name: string, fallback: string): string {
  const raw = name.split('.').pop()?.toLowerCase() ?? '';
  if (SAFE_EXT.test(raw)) return raw;
  return fallback;
}

/** מפתח אובייקט ב-R2 לפי סוג מדיה. */
export function buildMediaObjectKey(params: {
  kind: Exclude<MediaKind, 'video'>;
  assetId: string;
  contentType: string;
  originalFilename?: string;
}): string {
  const id = params.assetId;
  if (params.kind === 'image') {
    return `media/images/${id}.webp`;
  }
  if (params.kind === 'audio') {
    return `media/audio/${id}.mp3`;
  }
  const ext = extensionFromFilename(params.originalFilename ?? '', 'bin');
  return `media/files/${id}.${ext}`;
}

export function newMediaAssetId(): string {
  return randomUUID();
}

export function bucketForKind(kind: Exclude<MediaKind, 'video'>): 'images' | 'audio' | 'files' {
  if (kind === 'image') return 'images';
  if (kind === 'audio') return 'audio';
  return 'files';
}
