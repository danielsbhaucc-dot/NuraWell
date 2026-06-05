import { randomUUID } from 'node:crypto';
import { buildPublicUrlForUpload } from '@/lib/cdn/public-media';
import { getPublicCdnAudioUrl } from '@/lib/cdn/public-audio';
import type { GameItem, QuizQuestion, QuestionTtsMeta } from '@/lib/types/journey';
import { TTS_ELEVENLABS_CREDIT, TTS_MODEL_ID, TTS_VOICE_ID } from './constants';
import { synthesizeQuestionSpeech } from './elevenlabs';
import { buildJourneyTtsFolder, buildJourneyTtsObjectKey, type JourneyTtsKind } from './keys';
import { deleteTtsFromR2, uploadTtsMp3ToR2 } from './r2-upload';
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
    delete: () => { eq: (col: string, val: string) => Promise<{ error: { message: string } | null }> };
  };
};

export type SyncJourneyStepTtsParams = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  userId: string;
  step: {
    id: string;
    title?: string | null;
    station_id?: string | null;
    step_number: number;
    quiz_questions: QuizQuestion[];
    game_items: GameItem[];
  };
  stationTitle?: string | null;
  previousQuiz?: QuizQuestion[];
  previousGame?: GameItem[];
};

export type SyncJourneyStepTtsResult = {
  quiz_questions: QuizQuestion[];
  game_items: GameItem[];
  generated: number;
  skipped: number;
  deleted: number;
  errors: string[];
};

function collectTtsKeys(items: Array<{ id: string; tts?: QuestionTtsMeta | null }>): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of items) {
    const key = item.tts?.object_key?.trim();
    if (key) map.set(item.id, key);
  }
  return map;
}

function buildTtsUrl(objectKey: string, contentHash: string): string | null {
  return getPublicCdnAudioUrl(objectKey, contentHash);
}

async function upsertMediaAsset(params: {
  supabase: SupabaseAdmin;
  userId: string;
  objectKey: string;
  title: string;
  folder: string;
  sizeBytes: number;
  existingAssetId?: string;
}): Promise<string> {
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

  const assetId = (existing?.id as string | undefined) ?? params.existingAssetId ?? randomUUID();

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
      .eq('id', assetId);
    return assetId;
  }

  const { data: inserted, error } = await admin
    .from('media_assets')
    .insert({
      id: assetId,
      kind: 'audio',
      bucket: 'audio',
      object_key: params.objectKey,
      public_url: publicUrl,
      title: params.title,
      original_filename: `${params.objectKey.split('/').pop() ?? 'question.mp3'}`,
      mime_type: 'audio/mpeg',
      size_bytes: params.sizeBytes,
      folder: params.folder,
      source: 'other',
      credit: TTS_ELEVENLABS_CREDIT,
      created_by: params.userId,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return (inserted?.id as string) ?? assetId;
}

async function deleteMediaAssetByObjectKey(supabase: SupabaseAdmin, objectKey: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = supabase as any;
  await admin.from('media_assets').delete().eq('object_key', objectKey);
}

async function ensureItemTts(params: {
  supabase: SupabaseAdmin;
  userId: string;
  text: string;
  kind: JourneyTtsKind;
  questionId: string;
  stepId: string;
  stationId: string | null | undefined;
  stepNumber: number;
  stepTitle?: string | null;
  stationTitle?: string | null;
  labelPrefix: string;
  existingTts?: QuestionTtsMeta | null;
}): Promise<{ tts: QuestionTtsMeta | null; generated: boolean; skipped: boolean; error?: string }> {
  const normalized = normalizeTtsText(params.text);
  if (!normalized) {
    return { tts: null, generated: false, skipped: false };
  }

  const contentHash = computeTtsContentHash(normalized);
  const objectKey = buildJourneyTtsObjectKey({
    stationId: params.stationId,
    stepId: params.stepId,
    kind: params.kind,
    questionId: params.questionId,
  });

  if (
    params.existingTts?.content_hash === contentHash &&
    params.existingTts.object_key === objectKey &&
    params.existingTts.url &&
    params.existingTts.status === 'ready'
  ) {
    return { tts: params.existingTts, generated: false, skipped: true };
  }

  try {
    const buffer = await synthesizeQuestionSpeech(normalized);
    const { sizeBytes } = await uploadTtsMp3ToR2({ objectKey, buffer });
    const url = buildTtsUrl(objectKey, contentHash);
    if (!url) {
      throw new Error('לא ניתן לבנות URL ציבורי — בדוק NEXT_PUBLIC_CDN_URL');
    }

    const folder = buildJourneyTtsFolder({
      stationTitle: params.stationTitle,
      stepNumber: params.stepNumber,
      stepTitle: params.stepTitle,
    });
    const title = `${params.labelPrefix}: ${normalized.slice(0, 80)}${normalized.length > 80 ? '…' : ''}`;

    const mediaAssetId = await upsertMediaAsset({
      supabase: params.supabase,
      userId: params.userId,
      objectKey,
      title,
      folder,
      sizeBytes,
      existingAssetId: params.existingTts?.media_asset_id,
    });

    const tts: QuestionTtsMeta = {
      content_hash: contentHash,
      object_key: objectKey,
      url,
      media_asset_id: mediaAssetId,
      voice_id: TTS_VOICE_ID,
      model_id: TTS_MODEL_ID,
      size_bytes: sizeBytes,
      status: 'ready',
      generated_at: new Date().toISOString(),
    };

    return { tts, generated: true, skipped: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      tts: {
        content_hash: contentHash,
        object_key: objectKey,
        url: params.existingTts?.url ?? '',
        media_asset_id: params.existingTts?.media_asset_id,
        voice_id: TTS_VOICE_ID,
        model_id: TTS_MODEL_ID,
        status: 'error',
        error: msg,
        generated_at: params.existingTts?.generated_at,
      },
      generated: false,
      skipped: false,
      error: msg,
    };
  }
}

async function purgeOrphanTts(params: {
  supabase: SupabaseAdmin;
  orphanKeys: string[];
}): Promise<number> {
  let deleted = 0;
  for (const objectKey of params.orphanKeys) {
    try {
      await deleteTtsFromR2(objectKey);
      await deleteMediaAssetByObjectKey(params.supabase, objectKey);
      deleted += 1;
    } catch (e) {
      console.warn('[tts sync] orphan delete failed', { objectKey, error: e });
    }
  }
  return deleted;
}

export async function syncJourneyStepQuestionTts(
  params: SyncJourneyStepTtsParams
): Promise<SyncJourneyStepTtsResult> {
  const errors: string[] = [];
  let generated = 0;
  let skipped = 0;

  const prevQuizKeys = collectTtsKeys(params.previousQuiz ?? []);
  const prevGameKeys = collectTtsKeys(params.previousGame ?? []);

  const newQuizIds = new Set(params.step.quiz_questions.map((q) => q.id));
  const newGameIds = new Set(params.step.game_items.map((g) => g.id));

  const orphanKeys: string[] = [];
  for (const [id, key] of prevQuizKeys) {
    if (!newQuizIds.has(id)) orphanKeys.push(key);
  }
  for (const [id, key] of prevGameKeys) {
    if (!newGameIds.has(id)) orphanKeys.push(key);
  }

  const quiz_questions: QuizQuestion[] = [];
  for (const q of params.step.quiz_questions) {
    if (!q.id) {
      quiz_questions.push(q);
      continue;
    }
    const result = await ensureItemTts({
      supabase: params.supabase,
      userId: params.userId,
      text: q.question,
      kind: 'quiz',
      questionId: q.id,
      stepId: params.step.id,
      stationId: params.step.station_id,
      stepNumber: params.step.step_number,
      stepTitle: params.step.title,
      stationTitle: params.stationTitle,
      labelPrefix: 'הקראת שאלה',
      existingTts: q.tts,
    });
    if (result.error) errors.push(`שאלה ${q.id}: ${result.error}`);
    if (result.generated) generated += 1;
    if (result.skipped) skipped += 1;
    quiz_questions.push({ ...q, tts: result.tts ?? undefined });
  }

  const game_items: GameItem[] = [];
  for (const g of params.step.game_items) {
    if (!g.id) {
      game_items.push(g);
      continue;
    }
    const result = await ensureItemTts({
      supabase: params.supabase,
      userId: params.userId,
      text: g.statement,
      kind: 'game',
      questionId: g.id,
      stepId: params.step.id,
      stationId: params.step.station_id,
      stepNumber: params.step.step_number,
      stepTitle: params.step.title,
      stationTitle: params.stationTitle,
      labelPrefix: 'הקראת טענה',
      existingTts: g.tts,
    });
    if (result.error) errors.push(`טענה ${g.id}: ${result.error}`);
    if (result.generated) generated += 1;
    if (result.skipped) skipped += 1;
    game_items.push({ ...g, tts: result.tts ?? undefined });
  }

  // Empty-text items that had old TTS files
  for (const q of quiz_questions) {
    if (!normalizeTtsText(q.question) && q.tts?.object_key) {
      orphanKeys.push(q.tts.object_key);
      q.tts = undefined;
    }
  }
  for (const g of game_items) {
    if (!normalizeTtsText(g.statement) && g.tts?.object_key) {
      orphanKeys.push(g.tts.object_key);
      g.tts = undefined;
    }
  }

  const uniqueOrphans = [...new Set(orphanKeys)];
  const deleted = await purgeOrphanTts({ supabase: params.supabase, orphanKeys: uniqueOrphans });

  return { quiz_questions, game_items, generated, skipped, deleted, errors };
}
