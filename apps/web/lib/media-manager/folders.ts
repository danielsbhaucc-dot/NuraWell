function cleanSegment(segment: string): string {
  return segment
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/^[-.\s]+|[-.\s]+$/g, '');
}

/** בונה נתיב תיקייה אחיד למנהל המדיה עם ניקוי תווים ואורך מקסימלי של 120 תווים. */
export function buildUploadFolderPath(parts: Array<string | null | undefined>, fallback = 'כללי'): string {
  const normalized = parts
    .map((part) => cleanSegment(part ?? ''))
    .filter(Boolean);

  const raw = (normalized.length > 0 ? normalized : [fallback]).join('/');
  if (raw.length <= 120) return raw;

  return raw.slice(0, 120).replace(/[/. -]+$/g, '') || fallback;
}

/** נתיב מסודר להעלאות מדיה מתוך עורך צעד: journey/{station}/צעד {number} — {title}. */
export function buildJourneyStepUploadFolder(params: {
  stationTitle?: string | null;
  stepNumber: number;
  stepTitle?: string | null;
}): string {
  const stepLabel = params.stepTitle?.trim()
    ? `צעד ${params.stepNumber} — ${params.stepTitle.trim()}`
    : `צעד ${params.stepNumber}`;

  return buildUploadFolderPath(['journey', params.stationTitle ?? 'ללא תחנה', stepLabel]);
}

/** נתיב מסודר לתמונות תחנה: journey/{station}/תמונות תחנה. */
export function buildJourneyStationUploadFolder(stationTitle: string): string {
  return buildUploadFolderPath(['journey', stationTitle, 'תמונות תחנה']);
}
