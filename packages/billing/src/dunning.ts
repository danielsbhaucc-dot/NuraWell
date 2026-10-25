/** Retry schedule after a failed renewal. attempt is 1-based count of failures so far. */
export function nextRetryAt(firstFailureAt: Date, attempt: number, retryDays: number[]): Date | null {
  const d = retryDays[attempt - 1];
  return d == null ? null : new Date(firstFailureAt.getTime() + d * 86_400_000);
}
export function dunningExhausted(attempt: number, retryDays: number[]): boolean {
  return attempt > retryDays.length;
}
/** Stable dedupe key so each dunning notice goes out once per subscription per attempt. */
export function dunningDedupeKey(subscriptionId: string, attempt: number): string {
  return `dunning:${subscriptionId}:${attempt}`;
}
