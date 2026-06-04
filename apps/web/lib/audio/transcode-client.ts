'use client';

/**
 * דחיסת אודיו בצד-לקוח: פענוח דרך Web Audio API והמרה ל-MP3 (lamejs).
 * מטרה: איכות גבוהה במשקל נמוך, ופורמט שמתנגן בכל דפדפן (כולל iOS Safari).
 * המקודד (lamejs) מיובא דינמית כדי לא להכביד על שאר האפליקציה.
 */

export interface TranscodeResult {
  /** קובץ ה-MP3 הדחוס */
  blob: Blob;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  originalBytes: number;
  optimizedBytes: number;
}

export interface TranscodeOptions {
  /** ביטרייט יעד (kbps). ברירת מחדל 128 — איזון איכות/משקל למוזיקת רקע. */
  kbps?: number;
  /** דחיסה למונו (חוסך ~חצי משקל). ברירת מחדל: שמירה על סטריאו. */
  forceMono?: boolean;
  onProgress?: (fraction: number) => void;
}

export class AudioTranscodeUnsupportedError extends Error {
  constructor() {
    super('AUDIO_TRANSCODE_UNSUPPORTED');
    this.name = 'AudioTranscodeUnsupportedError';
  }
}

function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** ערבוב שני ערוצים למונו (ממוצע). */
function downmixToMono(buffer: AudioBuffer): Int16Array {
  const len = buffer.length;
  const ch = buffer.numberOfChannels;
  const out = new Int16Array(len);
  const channels: Float32Array[] = [];
  for (let c = 0; c < ch; c++) channels.push(buffer.getChannelData(c));
  for (let i = 0; i < len; i++) {
    let sum = 0;
    for (let c = 0; c < ch; c++) sum += channels[c][i];
    const s = Math.max(-1, Math.min(1, sum / ch));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export async function transcodeToMp3(
  file: File,
  options: TranscodeOptions = {}
): Promise<TranscodeResult> {
  const kbps = options.kbps ?? 128;

  const Ctx =
    typeof window !== 'undefined'
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
  if (!Ctx) throw new AudioTranscodeUnsupportedError();

  const arrayBuffer = await file.arrayBuffer();
  const ctx = new Ctx();

  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  } catch {
    await ctx.close().catch(() => {});
    throw new AudioTranscodeUnsupportedError();
  }

  const sampleRate = audioBuffer.sampleRate;
  const durationSeconds = audioBuffer.duration;
  const sourceChannels = audioBuffer.numberOfChannels;
  const channels = options.forceMono || sourceChannels < 2 ? 1 : 2;

  const { Mp3Encoder } = await import('./vendor/lamejs.js');
  const encoder = new Mp3Encoder(channels, sampleRate, kbps);

  let left: Int16Array;
  let right: Int16Array | undefined;
  if (channels === 1) {
    left = sourceChannels > 1 ? downmixToMono(audioBuffer) : floatToInt16(audioBuffer.getChannelData(0));
  } else {
    left = floatToInt16(audioBuffer.getChannelData(0));
    right = floatToInt16(audioBuffer.getChannelData(1));
  }

  const blockSize = 1152;
  const total = left.length;
  const mp3Chunks: BlobPart[] = [];

  for (let i = 0; i < total; i += blockSize) {
    const l = left.subarray(i, i + blockSize);
    const r = right ? right.subarray(i, i + blockSize) : undefined;
    const chunk = right ? encoder.encodeBuffer(l, r) : encoder.encodeBuffer(l);
    if (chunk.length > 0) mp3Chunks.push(new Uint8Array(chunk));
    if (options.onProgress && i % (blockSize * 80) === 0) {
      options.onProgress(Math.min(0.98, total > 0 ? i / total : 0));
    }
  }

  const tail = encoder.flush();
  if (tail.length > 0) mp3Chunks.push(new Uint8Array(tail));

  await ctx.close().catch(() => {});
  options.onProgress?.(1);

  const blob = new Blob(mp3Chunks, { type: 'audio/mpeg' });
  return {
    blob,
    durationSeconds,
    sampleRate,
    channels,
    originalBytes: file.size,
    optimizedBytes: blob.size,
  };
}
