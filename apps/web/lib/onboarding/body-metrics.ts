/** טווחים משותפים ללקוח, שרת וסיכום הרשמה */
export const BODY_METRICS = {
  weightMin: 30,
  weightMax: 400,
  heightMin: 100,
  heightMax: 250,
} as const;

export function parseMetric(raw: string): number | null {
  const t = raw.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function isValidWeightKg(n: number): boolean {
  return n >= BODY_METRICS.weightMin && n <= BODY_METRICS.weightMax;
}

export function isValidHeightCm(n: number): boolean {
  return n >= BODY_METRICS.heightMin && n <= BODY_METRICS.heightMax;
}

export type BodyMetricsInput = {
  currentWeight: string;
  targetWeight: string;
  height: string;
};

export type BodyMetricsField = 'current_weight' | 'target_weight' | 'height';

export type BodyMetricsValidationError = {
  field: BodyMetricsField;
  code: 'missing' | 'range';
};

export function validateBodyMetrics(input: BodyMetricsInput): BodyMetricsValidationError | null {
  const cw = parseMetric(input.currentWeight);
  if (cw === null || !isValidWeightKg(cw)) {
    return { field: 'current_weight', code: cw === null ? 'missing' : 'range' };
  }

  const tw = parseMetric(input.targetWeight);
  if (tw === null || !isValidWeightKg(tw)) {
    return { field: 'target_weight', code: tw === null ? 'missing' : 'range' };
  }

  if (input.height.trim()) {
    const h = parseMetric(input.height);
    if (h === null || !isValidHeightCm(h)) {
      return { field: 'height', code: 'range' };
    }
  }

  return null;
}
