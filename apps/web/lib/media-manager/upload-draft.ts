import type { MediaKind, MediaSource } from '@/lib/validation/media-asset';

export type UploadDraft = {
  title: string;
  source: MediaSource;
  author: string;
  license: string;
};

function key(kind: MediaKind): string {
  return `nura-media-upload-draft:${kind}`;
}

export function loadUploadDraft(kind: MediaKind): UploadDraft | null {
  try {
    const raw = localStorage.getItem(key(kind));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UploadDraft>;
    return {
      title: parsed.title ?? '',
      source: (parsed.source as MediaSource) ?? 'upload',
      author: parsed.author ?? '',
      license: parsed.license ?? '',
    };
  } catch {
    return null;
  }
}

export function saveUploadDraft(kind: MediaKind, draft: UploadDraft): void {
  try {
    const hasContent =
      draft.title.trim() || draft.author.trim() || draft.license.trim() || draft.source !== 'upload';
    if (hasContent) {
      localStorage.setItem(key(kind), JSON.stringify(draft));
    } else {
      localStorage.removeItem(key(kind));
    }
  } catch {
    /* ignore */
  }
}

export function clearUploadDraft(kind: MediaKind): void {
  try {
    localStorage.removeItem(key(kind));
  } catch {
    /* ignore */
  }
}
