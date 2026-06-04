import type { FileSubtype } from '@/lib/validation/media-asset';

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
