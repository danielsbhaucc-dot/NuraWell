export interface ImmersiveAttentionStop {
  id: string;
  time_seconds: number;
  question: string;
  feedback: string;
  auto_resume_seconds: number;
}

const IMMERSIVE_STOPS_PREFIX = 'NW_IMMERSIVE_STOPS_V1:';

export function parseImmersiveAttentionStops(textContent: string | null | undefined): ImmersiveAttentionStop[] {
  if (!textContent || !textContent.startsWith(IMMERSIVE_STOPS_PREFIX)) return [];
  const raw = textContent.slice(IMMERSIVE_STOPS_PREFIX.length).trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(item => normalizeStop(item))
      .filter((item): item is ImmersiveAttentionStop => Boolean(item))
      .sort((a, b) => a.time_seconds - b.time_seconds);
  } catch {
    return [];
  }
}

export function serializeImmersiveAttentionStops(stops: ImmersiveAttentionStop[]): string | null {
  const normalized = stops
    .map(stop => normalizeStop(stop))
    .filter((item): item is ImmersiveAttentionStop => Boolean(item))
    .sort((a, b) => a.time_seconds - b.time_seconds);
  if (!normalized.length) return null;
  return `${IMMERSIVE_STOPS_PREFIX}${JSON.stringify(normalized)}`;
}

function normalizeStop(value: unknown): ImmersiveAttentionStop | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<ImmersiveAttentionStop>;
  const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const timeSeconds = Number(row.time_seconds);
  const question = typeof row.question === 'string' ? row.question.trim() : '';
  const feedback = typeof row.feedback === 'string' ? row.feedback.trim() : '';
  const autoResumeSeconds = Number(row.auto_resume_seconds);

  if (!Number.isFinite(timeSeconds) || timeSeconds < 0) return null;
  if (!question) return null;
  if (!feedback) return null;

  return {
    id,
    time_seconds: Math.round(timeSeconds),
    question,
    feedback,
    auto_resume_seconds: Number.isFinite(autoResumeSeconds) && autoResumeSeconds > 0 ? Math.round(autoResumeSeconds) : 6,
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
