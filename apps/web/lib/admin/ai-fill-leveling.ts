import type { JourneyTaskLevelingConfig } from '@/lib/types/journey';

function str(value: unknown, max = 8000): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

const METRIC_KINDS = [
  'quantity',
  'time_before_event',
  'time_after_event',
  'time_of_day',
  'frequency',
  'duration',
  'custom',
] as const;

const METRIC_UNITS = ['cups', 'minutes', 'hours', 'times', 'days', 'custom'] as const;

const METRIC_DIRECTIONS = ['higher_is_harder', 'lower_is_harder', 'custom'] as const;

/** מנרמל leveling מ-LLM — דורש לפחות 2 רמות תקינות, אחרת null. */
export function normalizeTaskLeveling(
  value: unknown,
  genId: () => string
): JourneyTaskLevelingConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const levelsRaw = Array.isArray(obj.levels) ? obj.levels : [];

  const levels = levelsRaw
    .slice(0, 12)
    .map((lvl, idx) => {
      const row = lvl && typeof lvl === 'object' ? (lvl as Record<string, unknown>) : {};
      const label = str(row.label, 500);
      if (!label) return null;

      let metric: JourneyTaskLevelingConfig['levels'][number]['metric'];
      if (row.metric && typeof row.metric === 'object' && !Array.isArray(row.metric)) {
        const m = row.metric as Record<string, unknown>;
        const kindRaw = str(m.kind, 32);
        const kind = METRIC_KINDS.includes(kindRaw as (typeof METRIC_KINDS)[number])
          ? (kindRaw as (typeof METRIC_KINDS)[number])
          : 'custom';
        const unitRaw = str(m.unit, 32);
        const unit = METRIC_UNITS.includes(unitRaw as (typeof METRIC_UNITS)[number])
          ? (unitRaw as (typeof METRIC_UNITS)[number])
          : 'custom';
        const dirRaw = str(m.direction, 32);
        const direction = METRIC_DIRECTIONS.includes(
          dirRaw as (typeof METRIC_DIRECTIONS)[number]
        )
          ? (dirRaw as (typeof METRIC_DIRECTIONS)[number])
          : 'custom';
        const val = m.value;
        metric = {
          kind,
          value:
            typeof val === 'number' || typeof val === 'string' || val === null ? val : null,
          unit,
          direction,
        };
      }

      const id = str(row.id, 120) || genId();
      return {
        id,
        label,
        description: str(row.description, 2000),
        emoji: str(row.emoji, 32) || undefined,
        order: clampInt(row.order, 0, 99, idx),
        is_recommended: row.is_recommended === true,
        is_minimum_viable: row.is_minimum_viable === true,
        metric,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .sort((a, b) => a.order - b.order);

  if (levels.length < 2) return null;

  const levelIds = new Set(levels.map((l) => l.id));
  let startLevelId = str(obj.start_level_id, 120) || null;
  let recommendedLevelId = str(obj.recommended_level_id, 120) || null;

  if (startLevelId && !levelIds.has(startLevelId)) {
    startLevelId = levels.find((l) => !l.is_recommended)?.id ?? levels[0]!.id;
  }
  if (recommendedLevelId && !levelIds.has(recommendedLevelId)) {
    recommendedLevelId =
      levels.find((l) => l.is_recommended)?.id ?? levels[levels.length - 1]!.id;
  }
  if (!startLevelId) {
    startLevelId = levels.find((l) => !l.is_recommended && l.order === 1)?.id ?? levels[0]!.id;
  }
  if (!recommendedLevelId) {
    recommendedLevelId =
      levels.find((l) => l.is_recommended)?.id ?? levels[levels.length - 1]!.id;
  }

  return {
    levels,
    start_level_id: startLevelId,
    recommended_level_id: recommendedLevelId,
    level_up_after_success_days: clampInt(obj.level_up_after_success_days, 1, 90, 7),
    allow_user_downgrade: obj.allow_user_downgrade !== false,
    allow_user_upgrade: obj.allow_user_upgrade !== false,
    ai_rationale: str(obj.ai_rationale, 4000) || null,
  };
}
