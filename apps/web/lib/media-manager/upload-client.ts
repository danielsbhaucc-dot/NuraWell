import {
  encodeImageToWebpBlob,
  isWebpEncodeUnsupportedError,
} from '@/lib/client/encodeAlmogAvatarWebp';
import {
  AudioTranscodeUnsupportedError,
  transcodeToMp3,
  type TranscodeResult,
} from '@/lib/audio/transcode-client';
import type { FileSubtype, MediaCredit, MediaKind, MediaSource } from '@/lib/validation/media-asset';
import { inferFileSubtype } from '@/lib/media/file-subtype';

export type UploadPhase = 'idle' | 'transcoding' | 'uploading' | 'completing' | 'done' | 'error';

export type UploadProgress = {
  phase: UploadPhase;
  percent: number;
  message?: string;
};

export function putWithProgress(
  url: string,
  body: Blob,
  contentType: string,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`PUT_FAILED_${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('PUT_NETWORK'));
    xhr.send(body);
  });
}

export async function compressImageFile(file: File): Promise<{ blob: Blob; originalBytes: number }> {
  try {
    const blob = await encodeImageToWebpBlob(file, 1280, 0.82);
    return { blob, originalBytes: file.size };
  } catch (e) {
    if (isWebpEncodeUnsupportedError(e)) {
      throw new Error('WEBP_UNSUPPORTED');
    }
    throw new Error('ENCODE_FAILED');
  }
}

export async function compressAudioFile(
  file: File,
  onTranscodeProgress: (pct: number) => void
): Promise<{ blob: Blob; originalBytes: number; durationSeconds?: number }> {
  let transcoded: TranscodeResult;
  try {
    let last: TranscodeResult | null = null;
    for (const kbps of [128, 96, 64]) {
      const res = await transcodeToMp3(file, {
        kbps,
        onProgress: (f) => onTranscodeProgress(Math.round(f * 100)),
      });
      last = res;
      if (res.blob.size <= 25 * 1024 * 1024) break;
    }
    transcoded = last as TranscodeResult;
  } catch (e) {
    if (e instanceof AudioTranscodeUnsupportedError) throw new Error('AUDIO_UNSUPPORTED');
    throw new Error('AUDIO_ENCODE_FAILED');
  }
  return {
    blob: transcoded.blob,
    originalBytes: file.size,
    durationSeconds: transcoded.durationSeconds,
  };
}

export async function uploadMediaAsset(params: {
  kind: Exclude<MediaKind, 'video'>;
  file: File;
  title?: string;
  source?: MediaSource;
  credit?: MediaCredit;
  folder?: string;
  fileSubtype?: FileSubtype;
  onProgress: (p: UploadProgress) => void;
}): Promise<Record<string, unknown>> {
  const { kind, file, onProgress } = params;
  let body: Blob = file;
  let contentType = file.type || 'application/octet-stream';
  let originalBytes = file.size;
  let durationSeconds: number | undefined;
  let width: number | undefined;
  let height: number | undefined;

  if (kind === 'image') {
    onProgress({ phase: 'transcoding', percent: 0, message: 'דוחס תמונה…' });
    const compressed = await compressImageFile(file);
    body = compressed.blob;
    contentType = 'image/webp';
    originalBytes = compressed.originalBytes;
    onProgress({ phase: 'transcoding', percent: 100 });
  } else if (kind === 'audio') {
    onProgress({ phase: 'transcoding', percent: 0, message: 'דוחס אודיו…' });
    const compressed = await compressAudioFile(file, (pct) =>
      onProgress({ phase: 'transcoding', percent: pct, message: 'דוחס אודיו…' })
    );
    body = compressed.blob;
    contentType = 'audio/mpeg';
    originalBytes = compressed.originalBytes;
    durationSeconds = compressed.durationSeconds;
  }

  onProgress({ phase: 'uploading', percent: 0, message: 'מכין העלאה…' });

  const presignRes = await fetch('/api/v1/admin/media/presign', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind,
      content_type: contentType,
      original_filename: file.name,
      file_subtype: params.fileSubtype ?? (kind === 'file' ? inferFileSubtype(file.name, file.type) : undefined),
    }),
  });
  const presign = (await presignRes.json()) as {
    asset_id?: string;
    object_key?: string;
    upload_url?: string;
    file_subtype?: FileSubtype | null;
    error?: string;
  };
  if (!presignRes.ok || !presign.upload_url || !presign.asset_id || !presign.object_key) {
    throw new Error(presign.error || 'PRESIGN_FAILED');
  }

  await putWithProgress(presign.upload_url, body, contentType, (pct) =>
    onProgress({ phase: 'uploading', percent: pct, message: 'מעלה…' })
  );

  onProgress({ phase: 'completing', percent: 100, message: 'שומר…' });

  const completeRes = await fetch('/api/v1/admin/media/complete', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      asset_id: presign.asset_id,
      object_key: presign.object_key,
      kind,
      mime_type: contentType,
      title: params.title ?? file.name.replace(/\.[^.]+$/, ''),
      original_filename: file.name,
      size_bytes: body.size,
      original_bytes: originalBytes,
      duration_seconds: durationSeconds ?? null,
      width,
      height,
      folder: params.folder,
      file_subtype: presign.file_subtype ?? params.fileSubtype,
      source: params.source ?? 'upload',
      credit: params.credit ?? {},
    }),
  });
  const complete = (await completeRes.json()) as Record<string, unknown> & { error?: string };
  if (!completeRes.ok) throw new Error(complete.error || 'COMPLETE_FAILED');

  onProgress({ phase: 'done', percent: 100, message: 'הושלם' });
  return complete;
}

export async function importStockImageAsAsset(params: {
  downloadUrl: string;
  title: string;
  source: 'pixabay' | 'pexels';
  credit: MediaCredit;
  onProgress: (p: UploadProgress) => void;
}): Promise<Record<string, unknown>> {
  params.onProgress({ phase: 'transcoding', percent: 5, message: 'מוריד תמונה…' });
  const proxyRes = await fetch(
    `/api/v1/admin/stock-images/proxy?url=${encodeURIComponent(params.downloadUrl)}`,
    { credentials: 'include' }
  );
  if (!proxyRes.ok) throw new Error('STOCK_FETCH_FAILED');
  const blob = await proxyRes.blob();
  const file = new File([blob], 'stock-source', {
    type: blob.type.startsWith('image/') ? blob.type : 'image/jpeg',
  });
  return uploadMediaAsset({
    kind: 'image',
    file,
    title: params.title,
    source: params.source,
    credit: { ...params.credit, requires_attribution: true },
    onProgress: params.onProgress,
  });
}
