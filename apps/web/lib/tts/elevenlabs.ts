import {
  TTS_MODEL_ID,
  TTS_OUTPUT_FORMAT,
  TTS_VOICE_ID,
  TTS_VOICE_SETTINGS,
} from './constants';
import { prepareTtsPrompt } from './text';

export async function synthesizeQuestionSpeech(text: string): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('חסר ELEVENLABS_API_KEY — הוסף מפתח API מהמנוי שלך ב-ElevenLabs');
  }

  const prepared = prepareTtsPrompt(text);
  if (!prepared) {
    throw new Error('טקסט השאלה ריק');
  }

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${TTS_VOICE_ID}?output_format=${TTS_OUTPUT_FORMAT}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: prepared,
      model_id: TTS_MODEL_ID,
      voice_settings: TTS_VOICE_SETTINGS,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(
      `ElevenLabs TTS נכשל (${res.status}): ${errBody.slice(0, 240) || res.statusText}`
    );
  }

  return Buffer.from(await res.arrayBuffer());
}
