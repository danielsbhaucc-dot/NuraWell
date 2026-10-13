import { NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/api/authorize-cron';
import { createAdminClient } from '@/lib/supabase/admin';
import { createTelegramChannel, resolveBotToken } from '@/lib/ceo/telegram';
import { israelHourNow, nextDigestAt, periodsFor, sendDigest } from '@/lib/ceo/digest';
import { readGideonSettings } from '@/lib/ceo/settings';
import { runNightlyTaskMerge } from '@/lib/almog/nightly-task-merge';
import { workflowPublicBaseUrl } from '@/lib/workflows/resolve-workflow-public-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Daily 21:00 IL QStash schedule. The digest hour is admin-configurable (/ops/ceo/settings):
 * if it isn't 21, this run publishes one delayed QStash message to itself (?scheduled=1) for the
 * next configured hour — no schedule change needed. Deduplicated per target time.
 */
async function scheduleDigestAt(notBefore: number): Promise<{ ok: boolean; reason?: string }> {
  const token = process.env.QSTASH_TOKEN?.trim();
  const base = workflowPublicBaseUrl();
  if (!token || !base) return { ok: false, reason: 'qstash_or_base_missing' };
  const api = (process.env.QSTASH_URL?.trim() || 'https://qstash.upstash.io').replace(/\/$/, '');
  const dest = `${base.replace(/\/$/, '')}/api/v1/ai/cron/ceo-digest?scheduled=1`;
  const r = await fetch(`${api}/v2/publish/${encodeURIComponent(dest)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Upstash-Method': 'POST',
      'Upstash-Not-Before': String(notBefore),
      'Upstash-Retries': '1',
      'Upstash-Deduplication-Id': `ceo-digest-${notBefore}`,
    },
  }).catch(() => null);
  return r?.ok ? { ok: true } : { ok: false, reason: `qstash_${r?.status ?? 'error'}` };
}

async function handle(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;
  const db = createAdminClient();
  const url = new URL(request.url);
  const forced = url.searchParams.get('period');
  const scheduled = url.searchParams.get('scheduled') === '1';
  const settings = await readGideonSettings(db);

  // Nightly "Almog checks" ride on the fixed 21:00 schedule only (not on the delayed digest run).
  const almogChecks = scheduled ? null : await runNightlyTaskMerge(db).catch((e) => ({ error: String(e).slice(0, 200) }));
  if (!(await resolveBotToken())) return NextResponse.json({ skipped: 'telegram not configured', almogChecks });
  if (!settings.digest_enabled && !forced) return NextResponse.json({ skipped: 'digest disabled', almogChecks });

  if (!forced && !scheduled && israelHourNow() !== settings.digest_hour) {
    const at = nextDigestAt(settings.digest_hour);
    return NextResponse.json({ deferred_to: new Date(at * 1000).toISOString(), schedule: await scheduleDigestAt(at), almogChecks });
  }

  const ch = createTelegramChannel();
  const out: Record<string, unknown> = { almogChecks };
  for (const p of periodsFor(new Date(), forced)) out[p] = await sendDigest(db, ch, p);
  return NextResponse.json({ ok: true, ...out });
}

export const GET = handle;
export const POST = handle;
