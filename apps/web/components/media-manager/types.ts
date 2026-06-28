import type { FileSubtype, MediaCredit, MediaKind, MediaSource } from '@/lib/validation/media-asset';

export type MediaAsset = {
  id: string;
  kind: MediaKind;
  file_subtype: FileSubtype | null;
  bucket: 'images' | 'audio' | 'files' | null;
  object_key: string | null;
  public_url: string | null;
  provider: 'bunny' | null;
  external_id: string | null;
  external_url: string | null;
  title: string | null;
  original_filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  original_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  alt_text: string | null;
  folder: string | null;
  source: MediaSource;
  credit: MediaCredit;
  url?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type MediaManagerMode = 'browse' | 'pick';

export type OpenMediaManagerOptions = {
  /** סוג מדיה ראשי (או מערך מותרים) */
  kind?: MediaKind | MediaKind[];
  mode?: MediaManagerMode;
  title?: string;
  uploadFolder?: string;
  onSelect?: (asset: MediaAsset) => void;
};

export const FILE_TAB_LABELS: Record<FileSubtype, string> = {
  pdf: 'PDF',
  presentation: 'מצגות',
  word: 'וורד',
  spreadsheet: 'גיליונות',
  archive: 'ארכיון',
  other: 'אחר',
};

export const KIND_LABELS: Record<MediaKind, string> = {
  image: 'תמונות',
  audio: 'אודיו',
  file: 'קבצים',
  video: 'וידאו',
};
