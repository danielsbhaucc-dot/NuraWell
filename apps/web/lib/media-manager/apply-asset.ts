import type { MediaAsset } from '@/components/media-manager/types';
import type { StationCoverCredit } from '@/lib/media/stock-image-attribution';

/** העתקת תמונה מספריית מדיה לאווטאר אלמוג */
export async function applyAlmogAvatarFromAsset(asset: MediaAsset): Promise<Response> {
  return fetch('/api/v1/admin/almog-avatar', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_object_key: asset.object_key }),
  });
}

export async function applyMentorAvatarFromAsset(
  mentorId: string,
  asset: MediaAsset
): Promise<Response> {
  return fetch(`/api/v1/admin/mentors/${mentorId}/avatar`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_object_key: asset.object_key }),
  });
}

export async function applyStationCoverFromAsset(params: {
  stationId: string;
  asset: MediaAsset;
  credit?: StationCoverCredit | null;
}): Promise<Response> {
  const credit =
    params.credit ??
    (params.asset.credit?.photographer && params.asset.credit?.page_url
      ? {
          source: (params.asset.source === 'pexels' ? 'pexels' : 'pixabay') as 'pixabay' | 'pexels',
          photographer: params.asset.credit.photographer ?? params.asset.credit.author ?? '',
          page_url: params.asset.credit.page_url ?? '',
          photographer_url: params.asset.credit.photographer_url,
          provider_url:
            params.asset.credit.provider_url ??
            (params.asset.source === 'pexels'
              ? 'https://www.pexels.com/'
              : 'https://pixabay.com/'),
        }
      : null);

  return fetch('/api/v1/admin/journey-stations/cover', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      station_id: params.stationId,
      source_object_key: params.asset.object_key,
      credit: credit ?? undefined,
    }),
  });
}

export async function applyLoginBackgroundFromAsset(asset: MediaAsset): Promise<Response> {
  return fetch('/api/v1/admin/login-background', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_object_key: asset.object_key, credit: asset.credit }),
  });
}

export async function applyRegisterBackgroundFromAsset(asset: MediaAsset): Promise<Response> {
  return fetch('/api/v1/admin/register-background', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_object_key: asset.object_key, credit: asset.credit }),
  });
}
