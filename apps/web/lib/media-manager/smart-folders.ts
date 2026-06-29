import type { MediaAsset } from '@/components/media-manager/types';

/** קטגוריה חכמה לסידור תיקיות במנהל הקבצים */
export type SmartFolderCategory = {
  id: string;
  label: string;
  icon: 'tts' | 'guides' | 'journey' | 'images' | 'audio' | 'files' | 'video' | 'general';
  /** תבנית prefix ל-folder או object_key */
  match: (asset: Pick<MediaAsset, 'folder' | 'object_key' | 'kind'>) => boolean;
};

export type FinderFolderEntry = {
  path: string;
  label: string;
  count: number;
  latestTs: number;
  icon?: SmartFolderCategory['icon'];
  categoryId?: string;
};

export type FolderLevelView = {
  folders: FinderFolderEntry[];
  files: MediaAsset[];
};

const SPECIFIC_CATEGORIES: SmartFolderCategory[] = [
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
];

const GENERIC_CATEGORY_BY_KIND: Record<MediaAsset['kind'], SmartFolderCategory> = {
  image: {
    id: 'images',
    label: 'תמונות כלליות',
    icon: 'images',
    match: (a) => a.kind === 'image',
  },
  audio: {
    id: 'audio',
    label: 'אודיו כללי',
    icon: 'audio',
    match: (a) => a.kind === 'audio',
  },
  file: {
    id: 'files',
    label: 'קבצים',
    icon: 'files',
    match: (a) => a.kind === 'file',
  },
  video: {
    id: 'video',
    label: 'וידאו',
    icon: 'video',
    match: (a) => a.kind === 'video',
  },
};

export const SMART_FOLDER_CATEGORIES: SmartFolderCategory[] = [
  ...SPECIFIC_CATEGORIES,
  ...Object.values(GENERIC_CATEGORY_BY_KIND),
];

const KNOWN_SEGMENT_TO_CATEGORY_ID: Record<string, string> = {
  tts: 'tts',
  transcript: 'tts',
  transcripts: 'tts',
  transcription: 'tts',
  questionnaire: 'tts',
  questionnaires: 'tts',
  survey: 'tts',
  quiz: 'tts',
  lesson: 'tts',
  lessons: 'tts',
  שיעור: 'tts',
  שיעורים: 'tts',
  guides: 'guides',
  guide: 'guides',
  journey: 'journey',
  station: 'journey',
  stations: 'journey',
  almog: 'almog',
  sos: 'tts',
};

const SKIP_PATH_SEGMENTS = new Set(['media', 'images', 'audio', 'files', 'video']);

function splitPath(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);
}

function stripStoragePrefix(parts: string[]): string[] {
  if (parts.length === 0) return parts;
  if (SKIP_PATH_SEGMENTS.has(parts[0].toLowerCase())) return parts.slice(1);
  return parts;
}

function inferPathParts(asset: MediaAsset): string[] {
  const fromFolder = stripStoragePrefix(splitPath(asset.folder));
  if (fromFolder.length > 0) return fromFolder;

  const keyParts = splitPath(asset.object_key);
  if (keyParts.length <= 1) return [];

  const withoutFilename = keyParts.slice(0, -1);
  return stripStoragePrefix(withoutFilename);
}

function humanizeSegment(segment: string): string {
  const clean = segment
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return 'כללי';
  return clean;
}

function categoryById(id: string): SmartFolderCategory | undefined {
  return SMART_FOLDER_CATEGORIES.find((cat) => cat.id === id);
}

function dynamicCategoryFromSegment(
  segment: string,
  kind: MediaAsset['kind']
): SmartFolderCategory {
  const id = `folder:${segment.toLowerCase()}`;
  const icon = inferDynamicIcon(segment, kind);
  return {
    id,
    label: humanizeSegment(segment),
    icon,
    match: (asset) => resolveSmartCategoryId(asset as MediaAsset) === id,
  };
}

const DYNAMIC_ICON_POOL: Array<SmartFolderCategory['icon']> = [
  'guides',
  'journey',
  'images',
  'audio',
  'files',
  'video',
  'tts',
];

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

function inferDynamicIcon(
  segment: string,
  kind: MediaAsset['kind']
): SmartFolderCategory['icon'] {
  const s = segment.toLowerCase();

  if (/tts|transcript|speech|voice|question|survey|quiz/i.test(s)) return 'tts';
  if (/guide|manual|doc|help|tutorial/i.test(s)) return 'guides';
  if (/journey|station|route|path|track/i.test(s)) return 'journey';
  if (/image|photo|gallery|cover|banner/i.test(s)) return 'images';
  if (/audio|music|voice|sound|podcast/i.test(s)) return 'audio';
  if (/video|clip|reel/i.test(s)) return 'video';
  if (/file|report|sheet|pdf|docx?|pptx?|xlsx?/i.test(s)) return 'files';

  const fallback = GENERIC_CATEGORY_BY_KIND[kind].icon;
  const idx = hashString(s) % DYNAMIC_ICON_POOL.length;
  return DYNAMIC_ICON_POOL[idx] ?? fallback;
}

/** קטגוריה חכמה לפי נכס יחיד (כולל קטגוריות דינמיות אוטומטיות). */
export function resolveSmartCategoryId(asset: MediaAsset): string {
  const specific = SPECIFIC_CATEGORIES.find((c) => c.match(asset));
  if (specific) return specific.id;

  const root = inferPathParts(asset)[0]?.toLowerCase();
  if (root) {
    const known = KNOWN_SEGMENT_TO_CATEGORY_ID[root];
    if (known) return known;
    return `folder:${root}`;
  }

  return GENERIC_CATEGORY_BY_KIND[asset.kind].id;
}

/** בונה רשימת קטגוריות חכמה ודינמית עבור הפריטים הקיימים. */
export function buildSmartFolderCategories(assets: MediaAsset[]): SmartFolderCategory[] {
  const dynamic = new Map<string, SmartFolderCategory>();

  for (const asset of assets) {
    const id = resolveSmartCategoryId(asset);
    if (categoryById(id) || dynamic.has(id)) continue;
    if (!id.startsWith('folder:')) continue;

    const segment = id.slice('folder:'.length);
    dynamic.set(id, dynamicCategoryFromSegment(segment, asset.kind));
  }

  return [...SMART_FOLDER_CATEGORIES, ...Array.from(dynamic.values())];
}

/** מחזיר האם נכס שייך לקטגוריה נבחרת. */
export function matchesSmartCategory(asset: MediaAsset, categoryId: string): boolean {
  return resolveSmartCategoryId(asset) === categoryId;
}

/** מחזיר את הקטגוריה החכמה של נכס */
export function resolveSmartCategory(
  asset: Pick<MediaAsset, 'folder' | 'object_key' | 'kind'>
): SmartFolderCategory {
  const full = asset as MediaAsset;
  const id = resolveSmartCategoryId(full);
  return categoryById(id) ?? dynamicCategoryFromSegment(id.replace('folder:', ''), full.kind);
}

/** מקבץ נכסים לפי תיקיית משנה בתוך קטגוריה */
export function groupBySubfolder(
  assets: MediaAsset[],
  categoryId: string
): { subfolder: string; label: string; items: MediaAsset[] }[] {
  const map = new Map<string, MediaAsset[]>();

  for (const asset of assets) {
    const sub = extractRelativeFolder(asset, categoryId);
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

function dropCategoryRoot(parts: string[], categoryId: string): string[] {
  if (parts.length === 0) return parts;

  if (categoryId.startsWith('folder:')) {
    const segment = categoryId.slice('folder:'.length).toLowerCase();
    if (parts[0]?.toLowerCase() === segment) return parts.slice(1);
  }

  if (categoryId === 'tts' && parts[0]?.toLowerCase() === 'tts') return parts.slice(1);
  if (categoryId === 'tts' && parts[0]?.toLowerCase() === 'journey') return parts.slice(1);
  if (categoryId === 'guides' && parts[0]?.toLowerCase() === 'guides') return parts.slice(1);
  if (categoryId === 'journey' && parts[0]?.toLowerCase() === 'journey') return parts.slice(1);

  return parts;
}

function extractRelativeFolder(asset: MediaAsset, categoryId: string): string {
  const parts = dropCategoryRoot(inferPathParts(asset), categoryId);
  if (parts.length === 0) return 'כללי';
  return parts.join('/');
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

/**
 * בונה תצוגת "תיקייה נוכחית":
 * - folders: תתי תיקיות של הרמה הנוכחית
 * - files: קבצים שנמצאים ישירות ברמה הנוכחית
 */
export function buildFolderLevelView(
  assets: MediaAsset[],
  categoryId: string,
  currentPath: string | null
): FolderLevelView {
  const folderMap = new Map<string, FinderFolderEntry>();
  const files: MediaAsset[] = [];
  const normalizedCurrentPath = currentPath?.trim().replace(/^\/+|\/+$/g, '') || null;

  for (const asset of assets) {
    const relative = extractRelativeFolder(asset, categoryId);
    const cleanRelative = relative.replace(/^\/+|\/+$/g, '');

    if (!normalizedCurrentPath) {
      if (!cleanRelative) {
        files.push(asset);
        continue;
      }
      const first = cleanRelative.split('/')[0];
      const existing = folderMap.get(first);
      if (existing) {
        existing.count += 1;
        existing.latestTs = Math.max(existing.latestTs, tsForAsset(asset));
      } else {
        folderMap.set(first, {
          path: first,
          label: humanizeSegment(first),
          count: 1,
          latestTs: tsForAsset(asset),
        });
      }
      continue;
    }

    if (!cleanRelative) continue;
    if (cleanRelative !== normalizedCurrentPath && !cleanRelative.startsWith(`${normalizedCurrentPath}/`)) {
      continue;
    }

    const remainder = cleanRelative === normalizedCurrentPath
      ? ''
      : cleanRelative.slice(normalizedCurrentPath.length + 1);

    if (!remainder) {
      files.push(asset);
      continue;
    }

    const next = remainder.split('/')[0];
    const path = `${normalizedCurrentPath}/${next}`;
    const existing = folderMap.get(path);
    if (existing) {
      existing.count += 1;
      existing.latestTs = Math.max(existing.latestTs, tsForAsset(asset));
    } else {
      folderMap.set(path, {
        path,
        label: humanizeSegment(next),
        count: 1,
        latestTs: tsForAsset(asset),
      });
    }
  }

  return {
    folders: Array.from(folderMap.values())
      .sort((a, b) => b.latestTs - a.latestTs || a.label.localeCompare(b.label, 'he')),
    files,
  };
}

function tsForAsset(asset: MediaAsset): number {
  const t = Date.parse(asset.updated_at ?? asset.created_at ?? '');
  return Number.isFinite(t) ? t : 0;
}

/** בונה תיקיות קטגוריה ברמת השורש (כשנכנסים ל"הכל"). */
export function buildRootCategoryFolders(
  assets: MediaAsset[],
  categories: SmartFolderCategory[]
): FinderFolderEntry[] {
  const map = new Map<string, FinderFolderEntry>();

  for (const asset of assets) {
    const categoryId = resolveSmartCategoryId(asset);
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) continue;

    const existing = map.get(categoryId);
    const ts = tsForAsset(asset);
    if (existing) {
      existing.count += 1;
      existing.latestTs = Math.max(existing.latestTs, ts);
    } else {
      map.set(categoryId, {
        path: categoryId,
        label: cat.label,
        count: 1,
        latestTs: ts,
        icon: cat.icon,
        categoryId,
      });
    }
  }

  return Array.from(map.values()).sort(
    (a, b) =>
      pinRankForCategory(a.path) - pinRankForCategory(b.path) ||
      b.latestTs - a.latestTs ||
      a.label.localeCompare(b.label, 'he')
  );
}

const PINNED_CATEGORY_IDS = ['tts', 'journey', 'guides', 'almog', 'images', 'audio', 'files', 'video'];

function pinRankForCategory(id: string): number {
  const idx = PINNED_CATEGORY_IDS.indexOf(id);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

/** מחזיר את נתיב האב של תת-תיקייה (null = שורש הקטגוריה). */
export function parentSubfolderPath(currentPath: string | null): string | null {
  if (!currentPath?.trim()) return null;
  const parts = currentPath.split('/').filter(Boolean);
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join('/');
}

export type FinderBreadcrumbSegment = {
  label: string;
  level: 'kind' | 'category' | 'subfolder';
  categoryId: string | null;
  subfolder: string | null;
};

/** מפתח ייחודי לשמירת תת-תיקייה לפי סוג מדיה + קטגוריה. */
export function navSubfolderScope(kind: string, categoryId: string): string {
  return `${kind}::${categoryId}`;
}

/** בונה פירורי לחם לניווט Finder (סגנון macOS — נתיב יחיד ללא כפילויות). */
export function buildFinderBreadcrumbs(
  kindLabel: string,
  categoryId: string | null,
  subfolder: string | null,
  categories: SmartFolderCategory[]
): FinderBreadcrumbSegment[] {
  const crumbs: FinderBreadcrumbSegment[] = [
    { label: kindLabel, level: 'kind', categoryId: null, subfolder: null },
  ];

  if (!categoryId) return crumbs;

  const cat = categories.find((c) => c.id === categoryId);
  crumbs.push({
    label: cat?.label ?? categoryId,
    level: 'category',
    categoryId,
    subfolder: null,
  });

  if (!subfolder?.trim()) return crumbs;

  const parts = subfolder.split('/').filter(Boolean);
  let path = '';
  for (const part of parts) {
    path = path ? `${path}/${part}` : part;
    crumbs.push({
      label: humanizeSegment(part),
      level: 'subfolder',
      categoryId,
      subfolder: path,
    });
  }

  return crumbs;
}
