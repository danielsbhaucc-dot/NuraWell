// Public API of the "agent" module (re-export only; other modules import this, not the internal file).
export { AUDIO_BITRATE_LADDER, AUDIO_UPLOAD_SIZE_LIMIT, AudioTranscodeUnsupportedError, transcodeToMp3, transcodeUnderLimit } from '@/lib/audio/transcode-client';
export type { TranscodeOptions, TranscodeResult } from '@/lib/audio/transcode-client';
