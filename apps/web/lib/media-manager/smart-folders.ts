import type { MediaAsset } from '@/components/media-manager/types';

/** קטגוריה חכמה לסידור תיקיות במנהל הקבצים */
export type SmartFolderCategory = {
  id: string;
  label: string;
  icon: 'tts' | 'guides' | 'journey' | 'images' | 'audio' | 'files' | 'video' | 'general';
  /** תבנית prefix ל-folder או object_key */
  match: (asset: Pick<MediaAsset, 'folder' | 'object_key' | 'kind'>) => boolean;
};

export const SMART_FOLDER_CATEGORIES: SmartFolderCategory[] = [
  {
    id: 'tts',
    label: 'תמלול שאלונים',
    icon: 'tts',
    match: (a) => (a.folder?.startsWith('tts/') ?? false) || (a.object_key?.startsWith('tts/') ?? false),
  },
  {
    id: 'guides',
    label: 'מדריכים',
    icon: 'guides',
    match: (a) =>
      (a.object_key?.startsWith('guides/') ?? false) ||
      (a.folder?.startsWith('guides/') ?? false),
  },
  {
    id: 'journey',
    label: 'מסע / תחנות',
    icon: 'journey',
    match: (a) =>
      (a.object_key?.startsWith('journey/') ?? false) ||
      (a.folder?.startsWith('journey/') ?? false),
  },
  {
    id: 'almog',
    label: 'אלמוג / אווטאר',
    icon: 'images',
    match: (a) =>
      (a.object_key?.includes('almog') ?? false) ||
      (a.folder?.includes('almog') ?? false),
  },
  {
    id: 'images',
    label: 'תמונות כלליות',
    icon: 'images',
    match: (a) =>
      a.kind === 'image' &&
      !SMART_FOLDER_CATEGORIES.slice(0, 4).some((c) => c.id !== 'images' && c.match(a)),
  },
  {
    id: 'audio',
    label: 'אודיו כללי',
    icon: 'audio',
    match: (a) =>
      a.kind === 'audio' &&
      !(a.folder?.startsWith('tts/') ?? false) &&
      !(a.object_key?.startsWith('tts/') ?? false),
  },
  {
    id: 'files',
    label: 'קבצים',
    icon: 'files',
    match: (a) => a.kind === 'file',
  },
  {
    id: 'video',
    label: 'וידאו',
    icon: 'video',
    match: (a) => a.kind === 'video',
  },
];

/** מחזיר את הקטגוריה החכמה של נכס */
export function resolveSmartCategory(
  asset: Pick<MediaAsset, 'folder' | 'object_key' | 'kind'>
): SmartFolderCategory {
  return SMART_FOLDER_CATEGORIES.find((c) => c.match(asset)) ?? SMART_FOLDER_CATEGORIES[4];
}

/** מקבץ נכסים לפי תיקיית משנה בתוך קטגוריה */
export function groupBySubfolder(
  assets: MediaAsset[],
  categoryId: string
): { subfolder: string; label: string; items: MediaAsset[] }[] {
  const map = new Map<string, MediaAsset[]>();

  for (const asset of assets) {
    const sub = extractSubfolder(asset, categoryId);
    const list = map.get(sub) ?? [];
    list.push(asset);
    map.set(sub, list);
  }

  return Array.from(map.entries())
    .map(([subfolder, items]) => ({
      subfolder,
      label: formatSubfolderLabel(subfolder, categoryId),
      items,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'he'));
}

function extractSubfolder(
  asset: MediaAsset,
  categoryId: string
): string {
  if (categoryId === 'tts' && asset.folder?.startsWith('tts/')) {
    const parts = asset.folder.split('/');
    return parts.length >= 3 ? `${parts[1]}/${parts[2]}` : parts[1] ?? 'כללי';
  }
  if (asset.folder?.trim()) {
    const parts = asset.folder.split('/');
    return parts.length > 1 ? parts.slice(1).join('/') : asset.folder;
  }
  if (asset.object_key) {
    const parts = asset.object_key.split('/');
    if (parts.length >= 2) return parts.slice(0, -1).join('/');
  }
  return 'כללי';
}

function formatSubfolderLabel(subfolder: string, categoryId: string): string {
  if (subfolder === 'כללי') return 'כללי';
  if (categoryId === 'tts') {
    const [station, step] = subfolder.split('/');
    if (step) return `${station} › ${step}`;
    return station;
  }
  return subfolder.replace(/\//g, ' › ');
}
