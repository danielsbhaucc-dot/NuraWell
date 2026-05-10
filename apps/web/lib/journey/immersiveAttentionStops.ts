export interface ImmersiveAttentionStop {
  id: string;
  time_seconds: number;
  question: string;
  feedback: string;
  options?: string[];
  correct_option_index?: number | null;
  feedback_correct?: string | null;
  feedback_incorrect?: string | null;
  auto_resume_seconds: number;
}

const IMMERSIVE_STOPS_PREFIX = 'NW_IMMERSIVE_STOPS_V1:';

/** מחלץ מערך JSON ברמה העליונה מתוך טקסט, בתוך מחרוזות מכבדים גרשיים ובריחה */
function sliceTopLevelJsonArray(text: string, openBracketIndex: number): string | null {
  if (text[openBracketIndex] !== '[') return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  const start = openBracketIndex;
  for (let i = openBracketIndex; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function extractImmersiveJsonArray(textContent: string): string | null {
  const text = textContent.startsWith('\uFEFF') ? textContent.slice(1) : textContent;
  const i = text.indexOf(IMMERSIVE_STOPS_PREFIX);
  if (i === -1) return null;
  const rawAfter = text.slice(i + IMMERSIVE_STOPS_PREFIX.length);
  const wsLen = rawAfter.match(/^\s*/)?.[0].length ?? 0;
  const rest = rawAfter.slice(wsLen);
  const bracketIdx = rest.indexOf('[');
  if (bracketIdx === -1) return null;
  const absoluteBracket = i + IMMERSIVE_STOPS_PREFIX.length + wsLen + bracketIdx;
  return sliceTopLevelJsonArray(text, absoluteBracket);
}

/**
 * גרסאות ישנות / ייבוא ידני: מערך JSON ללא קידומת NW_IMMERSIVE_STOPS_V1,
 * או טקסט לפני/אחרי הבלוק הרגיל שלא נסרק כראוי.
 */
function extractLegacyImmersiveJsonArray(textContent: string): string | null {
  const text = textContent.startsWith('\uFEFF') ? textContent.slice(1) : textContent;
  const trimmed = text.trim();
  if (trimmed.startsWith('[')) {
    const slice = sliceTopLevelJsonArray(trimmed, 0);
    if (slice) return slice;
  }
  const firstBracket = text.indexOf('[');
  if (firstBracket === -1) return null;
  const slice = sliceTopLevelJsonArray(text, firstBracket);
  if (!slice) return null;
  try {
    const parsed = JSON.parse(slice) as unknown;
    if (Array.isArray(parsed) && parsed.length && parsed.some((row) => row && typeof row === 'object' && 'time_seconds' in (row as object))) {
      return slice;
    }
  } catch {
    return null;
  }
  return null;
}

/** מסיר את בלוק עצירות הקשב מהמחרוזת (למשל טקסט נלווה שנשמר באותו שדה) */
export function stripImmersiveAttentionBlock(textContent: string | null | undefined): string {
  if (!textContent) return '';
  const text = textContent.startsWith('\uFEFF') ? textContent.slice(1) : textContent;
  const i = text.indexOf(IMMERSIVE_STOPS_PREFIX);
  if (i === -1) return text.trim();
  const rawAfter = text.slice(i + IMMERSIVE_STOPS_PREFIX.length);
  const wsLen = rawAfter.match(/^\s*/)?.[0].length ?? 0;
  const rest = rawAfter.slice(wsLen);
  const bracketIdx = rest.indexOf('[');
  if (bracketIdx === -1) {
    return (text.slice(0, i) + rawAfter).trim();
  }
  const absoluteBracket = i + IMMERSIVE_STOPS_PREFIX.length + wsLen + bracketIdx;
  const jsonSlice = sliceTopLevelJsonArray(text, absoluteBracket);
  if (!jsonSlice) return text.slice(0, i).trimEnd();
  const endBlock = absoluteBracket + jsonSlice.length;
  return (text.slice(0, i) + text.slice(endBlock)).replace(/\n{3,}/g, '\n\n').trim();
}

export function parseImmersiveAttentionStops(textContent: string | null | undefined): ImmersiveAttentionStop[] {
  if (!textContent) return [];
  const jsonSlice = extractImmersiveJsonArray(textContent) ?? extractLegacyImmersiveJsonArray(textContent);
  if (!jsonSlice) return [];
  try {
    const parsed = JSON.parse(jsonSlice) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(item => normalizeStop(item))
      .filter((item): item is ImmersiveAttentionStop => Boolean(item))
      .sort((a, b) => a.time_seconds - b.time_seconds);
  } catch {
    return [];
  }
}

export function serializeImmersiveAttentionStops(
  stops: ImmersiveAttentionStop[],
  existingTextContent?: string | null
): string | null {
  const normalized = stops
    .map(stop => normalizeStop(stop))
    .filter((item): item is ImmersiveAttentionStop => Boolean(item))
    .sort((a, b) => a.time_seconds - b.time_seconds);

  const remainder = stripImmersiveAttentionBlock(existingTextContent ?? '').trim();

  if (!normalized.length) {
    return remainder.length ? remainder : null;
  }

  const blob = `${IMMERSIVE_STOPS_PREFIX}${JSON.stringify(normalized)}`;
  if (!remainder.length) return blob;
  return `${remainder}\n\n${blob}`;
}

function normalizeStop(value: unknown): ImmersiveAttentionStop | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<ImmersiveAttentionStop>;
  const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const timeSeconds = Number(row.time_seconds);
  const question = typeof row.question === 'string' ? row.question.trim() : '';
  const feedback = typeof row.feedback === 'string' ? row.feedback.trim() : '';
  const options = Array.isArray(row.options)
    ? row.options.map(opt => (typeof opt === 'string' ? opt.trim() : '')).filter(Boolean)
    : [];
  const correctOptionIndex = row.correct_option_index === null || row.correct_option_index === undefined
    ? null
    : Number(row.correct_option_index);
  const feedbackCorrect = typeof row.feedback_correct === 'string' ? row.feedback_correct.trim() : null;
  const feedbackIncorrect = typeof row.feedback_incorrect === 'string' ? row.feedback_incorrect.trim() : null;
  const autoResumeSeconds = Number(row.auto_resume_seconds);

  if (!Number.isFinite(timeSeconds) || timeSeconds < 0) return null;
  if (!question) return null;
  if (!feedback && !feedbackCorrect && !feedbackIncorrect) return null;

  return {
    id,
    time_seconds: Math.round(timeSeconds),
    question,
    feedback,
    options: options.length ? options : undefined,
    correct_option_index: Number.isInteger(correctOptionIndex)
      && (correctOptionIndex as number) >= 0
      && (options.length ? (correctOptionIndex as number) < options.length : true)
      ? (correctOptionIndex as number)
      : null,
    feedback_correct: feedbackCorrect,
    feedback_incorrect: feedbackIncorrect,
    auto_resume_seconds: Number.isFinite(autoResumeSeconds) && autoResumeSeconds > 0 ? Math.round(autoResumeSeconds) : 10,
  };
}

export function parseClockToSeconds(value: string): number {
  const clean = value.trim();
  if (!clean) return 0;
  const parts = clean.split(':').map(part => Number(part.trim()));
  if (parts.some(part => Number.isNaN(part) || part < 0)) return 0;
  if (parts.length === 1) return Math.round(parts[0]);
  if (parts.length === 2) return Math.round(parts[0] * 60 + parts[1]);
  return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]);
}

export function formatSecondsAsClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
