/**
 * Bunny Stream Pull Zone for NuraWell — HLS manifests on video.nurawell.ai
 * (see https://docs.bunny.net/docs/stream-video-storage-structure )
 */

export const NURAWELL_BUNNY_VIDEO_ORIGIN = 'https://video.nurawell.ai';

function pullOrigin(): string {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BUNNY_PULL_ORIGIN?.trim()) {
    return process.env.NEXT_PUBLIC_BUNNY_PULL_ORIGIN.replace(/\/$/, '');
  }
  return NURAWELL_BUNNY_VIDEO_ORIGIN;
}

const UUID_ONLY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bunnyStreamLibraryId(): string {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BUNNY_STREAM_LIBRARY_ID?.trim()) {
    return process.env.NEXT_PUBLIC_BUNNY_STREAM_LIBRARY_ID.trim();
  }
  // Fallback: hardcoded library ID for video.nurawell.ai
  return '654032';
}

/**
 * מכתובת Pull Zone (.../{videoUuid}/playlist.m3u8) — מחזיר את מזהה הווידאו.
 */
export function extractBunnyVideoUuidFromPlaylistUrl(hlsUrl: string): string | null {
  try {
    const u = new URL(hlsUrl);
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const last = parts[parts.length - 1]?.toLowerCase() ?? '';
    if (!last.endsWith('.m3u8')) return null;
    const vid = parts[parts.length - 2];
    return UUID_ONLY.test(vid) ? vid : null;
  } catch {
    return null;
  }
}

/**
 * כש־Bunny מפעילים "Block direct URL file access", fetch ל־m3u8 מהדפדפן מחזיר 403.
 * אם מוגדר מזהה ספריית Stream (מספר מהדשבורד), עוברים ל־embed iframe — עובד עם החסימה.
 */
export function getBunnyIframeEmbedFromPullZoneHls(hlsUrl: string | null): string | null {
  if (!hlsUrl) return null;
  const lib = bunnyStreamLibraryId();
  if (!lib) return null;
  const videoId = extractBunnyVideoUuidFromPlaylistUrl(hlsUrl);
  if (!videoId) return null;
  return `${lib}/${videoId}`;
}

/**
 * Accepts:
 * - Full URL: https://video.nurawell.ai/{id}/playlist.m3u8
 * - Protocol-relative: //video.nurawell.ai/...
 * - Path only: /{id}/playlist.m3u8 or {id}/playlist.m3u8
 */
export function resolveBunnyPullHlsUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('//')) return `https:${s}`;
  if (!s.toLowerCase().includes('.m3u8')) return null;
  // host/path without scheme, e.g. video.nurawell.ai/{id}/playlist.m3u8
  if (/^[a-z0-9][a-z0-9.-]*\//i.test(s)) {
    return `https://${s}`;
  }
  const origin = pullOrigin();
  if (s.startsWith('/')) return `${origin}${s}`;
  return `${origin}/${s}`;
}

/** Pure video GUID in pull zone → default manifest path on video.nurawell.ai */
export function nurawellPlaylistFromVideoId(videoId: string): string | null {
  const id = videoId.trim();
  if (!UUID_ONLY.test(id)) return null;
  return `${pullOrigin()}/${id}/playlist.m3u8`;
}

/**
 * Resolve HLS URL for journey/course fields: explicit m3u8 / URL, or UUID-only in externalId.
 */
export function getBunnyHlsSourceFromFields(
  externalId: string | null,
  externalUrl: string | null
): string | null {
  const candidates = [externalUrl?.trim(), externalId?.trim()].filter(Boolean) as string[];
  for (const c of candidates) {
    const resolved = resolveBunnyPullHlsUrl(c);
    if (resolved) return resolved;
  }
  const idOnly = externalId?.trim();
  if (idOnly && !externalUrl?.trim()) {
    const fromUuid = nurawellPlaylistFromVideoId(idOnly);
    if (fromUuid) return fromUuid;
  }
  return null;
}

/**
 * Resolves Bunny Stream iframe embed id (`{libraryId}/{videoId}`) for journey fields.
 * Covers: explicit `123/uuid`, pull-zone HLS → UUID, or UUID-only externalId + library id.
 */
/** From full iframe URL or path: .../embed/{libraryId}/{videoId} */
export function extractBunnyMediadeliveryEmbedId(raw: string | null | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  const m = s.match(/iframe\.mediadelivery\.net\/embed\/(\d+)\/([a-zA-Z0-9_-]+)/i);
  if (m) return `${m[1]}/${m[2]}`;
  return null;
}

export function resolveBunnyStreamEmbedId(externalId: string | null, externalUrl: string | null): string | null {
  const fromField =
    extractBunnyMediadeliveryEmbedId(externalUrl) || extractBunnyMediadeliveryEmbedId(externalId);
  if (fromField) return fromField;

  const id = externalId?.trim();
  if (!id || id === 'PLACEHOLDER_HEYGEN_VIDEO_ID') return null;
  if (/^\d+\/[a-zA-Z0-9_-]+$/.test(id)) return id;
  const hls = getBunnyHlsSourceFromFields(externalId, externalUrl);
  const fromHls = getBunnyIframeEmbedFromPullZoneHls(hls);
  if (fromHls) return fromHls;
  if (UUID_ONLY.test(id)) {
    const lib = bunnyStreamLibraryId();
    return lib ? `${lib}/${id}` : null;
  }
  return null;
}
