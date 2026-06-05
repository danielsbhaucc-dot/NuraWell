/** Liam — Energetic, Social Media Creator (premade, multilingual). */
export const TTS_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID?.trim() || 'TX3LPaxmHKxFdv7VOQHJ';

/** Hebrew requires Eleven v3 (paid API credits from your subscription). */
export const TTS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID?.trim() || 'eleven_v3';

/** Smallest widely-supported MP3 preset for speech (~32kbps @ 22kHz). */
export const TTS_OUTPUT_FORMAT = 'mp3_22050_32';

/** Energetic, encouraging delivery for quiz/game prompts. */
export const TTS_VOICE_SETTINGS = {
  stability: 0.42,
  similarity_boost: 0.78,
  style: 0.62,
  use_speaker_boost: true,
} as const;

export const TTS_ELEVENLABS_CREDIT = {
  source: 'ElevenLabs',
  author: 'Liam (Voice)',
  license: 'Commercial — generated under paid ElevenLabs subscription',
  provider_url: 'https://elevenlabs.io',
  requires_attribution: false,
} as const;
