import { randomUUID } from 'node:crypto';
import { HeadObjectCommand } from '@aws-sdk/client-s3';

import { buildPublicUrlForUpload } from '@/lib/cdn/public-media';
import { getPublicCdnAudioUrl } from '@/lib/cdn/public-audio';
import { getR2Client, r2AudioBucketName } from '@/lib/storage/r2-almog';

import { TTS_ELEVENLABS_CREDIT, TTS_MODEL_ID, TTS_VOICE_ID } from './constants';
import { synthesizeQuestionSpeech } from './elevenlabs';
import {
  buildSosTtsFolder,
  buildSosTtsMediaTitle,
  buildSosTtsObjectKey,
  type SosTtsCategory,
} from './sos-keys';
import { uploadTtsMp3ToR2 } from './r2-upload';
import { computeTtsContentHash, normalizeTtsText } from './text';

type SupabaseAdmin = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      };
    };
    insert: (row: Record<string, unknown>) => {
      select: (cols: string) => { single: () => Promise<{ data: Record<string, unknown>; error: { message: string } | null }> };
    };
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};

async function r2AudioExists(objectKey: string): Promise<boolean> {
  const bucket = r2AudioBucketName();
  if (!bucket) return false;
  try {
    await getR2Client().send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
    return true;
  } catch {
    return false;
  }
}

function buildTtsUrl(objectKey: string, contentHash: string): string | null {
  return getPublicCdnAudioUrl(objectKey, contentHash);
}

async function upsertSosMediaAsset(params: {
  supabase: SupabaseAdmin;
  userId: string;
  objectKey: string;
  title: string;
  folder: string;
  sizeBytes: number;
}): Promise<void> {
  const publicUrl =
    buildPublicUrlForUpload({ kind: 'audio', objectKey: params.objectKey }) ??
    buildTtsUrl(params.objectKey, '1') ??
    '';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = params.supabase as any;

  const { data: existing } = await admin
    .from('media_assets')
    .select('id')
    .eq('object_key', params.objectKey)
    .maybeSingle();

  if (existing?.id) {
    await admin
      .from('media_assets')
      .update({
        title: params.title,
        folder: params.folder,
        public_url: publicUrl,
        size_bytes: params.sizeBytes,
        mime_type: 'audio/mpeg',
        updated_at: new Date().toISOString(),
        credit: TTS_ELEVENLABS_CREDIT,
      })
      .eq('id', existing.id as string);
    return;
  }

  await admin.from('media_assets').insert({
    id: randomUUID(),
    kind: 'audio',
    bucket: 'audio',
    object_key: params.objectKey,
    public_url: publicUrl,
    title: params.title,
    original_filename: `${params.objectKey.split('/').pop() ?? 'sos.mp3'}`,
    mime_type: 'audio/mpeg',
    size_bytes: params.sizeBytes,
    folder: params.folder,
    source: 'other',
    credit: TTS_ELEVENLABS_CREDIT,
    created_by: params.userId,
  });
}

export type EnsureSosTtsResult = {
  ok: true;
  url: string;
  cached: boolean;
  content_hash: string;
  object_key: string;
  voice_id: string;
  model_id: string;
};

/** יצירה/שימוש חוזר ב-ElevenLabs + R2 — אותה שרשרת כמו בשיעורים. */
export async function ensureSosTts(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  userId: string;
  text: string;
  category: SosTtsCategory;
}): Promise<EnsureSosTtsResult> {
  const normalized = normalizeTtsText(params.text);
  if (!normalized) {
    throw new Error('טקסט ריק');
  }

  const contentHash = computeTtsContentHash(normalized);
  const objectKey = buildSosTtsObjectKey(params.category, contentHash);
  const url = buildTtsUrl(objectKey, contentHash);
  if (!url) {
    throw new Error('לא ניתן לבנות URL ציבורי — בדוק NEXT_PUBLIC_CDN_URL');
  }

  const cached = await r2AudioExists(objectKey);
  if (!cached) {
    const buffer = await synthesizeQuestionSpeech(normalized);
    const { sizeBytes } = await uploadTtsMp3ToR2({ objectKey, buffer });
    await upsertSosMediaAsset({
      supabase: params.supabase,
      userId: params.userId,
      objectKey,
      title: buildSosTtsMediaTitle(params.category, normalized),
      folder: buildSosTtsFolder(params.category),
      sizeBytes,
    });
  }

  return {
    ok: true,
    url,
    cached,
    content_hash: contentHash,
    object_key: objectKey,
    voice_id: TTS_VOICE_ID,
    model_id: TTS_MODEL_ID,
  };
}
