import { workflowPublicBaseUrl } from '@/lib/module-api/reminders/lib-workflows-resolve-workflow-public-url';

/**
 * Fire-and-forget: ask QStash to POST one of our own cron routes (signed → authorizeCronRequest
 * accepts it). Used by the daily master cron to guarantee the nightly memory chain runs even when
 * its own hourly schedule is missing (13.10.2026: no auto-close / rollup run had happened in prod).
 * Deduplicated per route+day so a retry or a parallel schedule never runs it twice.
 */
export async function kickCronRouteViaQstash(path: string, dedupeDay: string): Promise<{ ok: boolean; reason?: string }> {
  const token = process.env.QSTASH_TOKEN?.trim();
  if (!token) return { ok: false, reason: 'qstash_token_missing' };
  const base = workflowPublicBaseUrl();
  if (!base) return { ok: false, reason: 'public_base_url_missing' };
  const api = (process.env.QSTASH_URL?.trim() || 'https://qstash.upstash.io').replace(/\/$/, '');
  const destination = `${base.replace(/\/$/, '')}${path}`;
  try {
    const res = await fetch(`${api}/v2/publish/${encodeURIComponent(destination)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Upstash-Method': 'POST',
        'Upstash-Retries': '1',
        'Upstash-Deduplication-Id': `kick:${path.replace(/[^a-z0-9]+/gi, '-')}:${dedupeDay}`,
      },
    });
    return res.ok ? { ok: true } : { ok: false, reason: `qstash_${res.status}` };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
