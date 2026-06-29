import { randomUUID } from 'node:crypto';
import { buildPublicUrlForUpload } from '@/lib/cdn/public-media';
import { getPublicCdnAudioUrl } from '@/lib/cdn/public-audio';
import { TTS_MODEL_ID, TTS_VOICE_ID } from './constants';
import { synthesizeQuestionSpeech } from './elevenlabs';
import { uploadTtsMp3ToR2 } from './r2-upload';
import { normalizeTtsText, computeTtsContentHash } from './text';

export type SyncChallengeIntroTtsResult = {
  url: string | null;
  error?: string;
};

export async function syncChallengeIntroTts(text: string): Promise<SyncChallengeIntroTtsResult> {
  const normalized = normalizeTtsText(text);
  if (!normalized) {
    return { url: null, error: 'טקst ריק' };
  }

  try {
    const buffer = await synthesizeQuestionSpeech(normalized);
    const contentHash = computeTtsContentHash(normalized);
    const objectKey = `tts/challenge/intro/${randomUUID()}.mp3`;

    await uploadTtsMp3ToR2({ objectKey, buffer });

    const url =
      buildPublicUrlForUpload({ kind: 'audio', objectKey }) ??
      getPublicCdnAudioUrl(objectKey, contentHash);

    return { url: url ?? null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { url: null, error: msg };
  }
}

export { TTS_MODEL_ID, TTS_VOICE_ID };
