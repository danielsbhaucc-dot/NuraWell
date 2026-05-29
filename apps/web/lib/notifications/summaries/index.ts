/**
 * Public API of the Periodic Summary Engine ("Memory Pyramid").
 *
 * הצרכנים (Next.js routes, Upstash Workflows, Ops panel) צריכים לייבא
 * רק מכאן — קבצים פנימיים יכולים להשתנות בלי לשבור consumer-ים.
 */

export {
  generateAndStorePeriodicSummary,
  dispatchSummaryReadyNotification,
  type GenerateSummaryInput,
  type GeneratedSummary,
} from './summary-generator';

export {
  type SummaryType,
  SUMMARY_TYPES,
  CHILD_TYPE,
  buildPeriodKey,
  buildDailyKey,
  buildWeeklyKey,
  buildMonthlyKey,
  buildQuarterlyKey,
  buildSemiAnnualKey,
  buildAnnualKey,
  parsePeriodKey,
  isValidPeriodKey,
  getChildPeriodKeys,
} from './period-keys';

export type {
  SummaryMetrics,
  DailyMetrics,
  AggregateMetrics,
} from './metrics';
