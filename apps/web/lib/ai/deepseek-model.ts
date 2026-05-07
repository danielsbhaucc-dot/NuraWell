/**
 * DeepSeek official API model for batch analysis (cron).
 * `deepseek-chat` is the general chat model (V3-class on api.deepseek.com).
 * Override with `DEEPSEEK_ANALYSIS_MODEL` if DeepSeek renames tiers.
 */
export function getDeepseekAnalysisModel(): string {
  const m = process.env.DEEPSEEK_ANALYSIS_MODEL?.trim();
  return m || 'deepseek-chat';
}
