/** קטגוריות TTS ל-SOS — נתיב R2 ותיקיית מנהל מדיה מסודרים לפי מקור. */
export type SosTtsCategory = 'task_title' | 'intervention_message' | 'micro_step';

const SOS_TTS_FOLDER_LABEL: Record<SosTtsCategory, string> = {
  task_title: 'משימה',
  intervention_message: 'הודעה',
  micro_step: 'צעד',
};

const SOS_TTS_TITLE_PREFIX: Record<SosTtsCategory, string> = {
  task_title: 'SOS — הקראת משימה',
  intervention_message: 'SOS — הקראת הודעה',
  micro_step: 'SOS — הקראת צעד',
};

/** אחד לכל hash תוכן — דחיסה מקסימלית, בלי כפילויות. */
export function buildSosTtsObjectKey(category: SosTtsCategory, contentHash: string): string {
  return `tts/sos/${category}/${contentHash}.mp3`;
}

export function buildSosTtsFolder(category: SosTtsCategory): string {
  return `tts/SOS/${SOS_TTS_FOLDER_LABEL[category]}`;
}

export function buildSosTtsMediaTitle(category: SosTtsCategory, text: string): string {
  const snippet = text.slice(0, 80);
  return `${SOS_TTS_TITLE_PREFIX[category]}: ${snippet}${text.length > 80 ? '…' : ''}`;
}

export function isSosTtsCategory(value: string): value is SosTtsCategory {
  return value === 'task_title' || value === 'intervention_message' || value === 'micro_step';
}
