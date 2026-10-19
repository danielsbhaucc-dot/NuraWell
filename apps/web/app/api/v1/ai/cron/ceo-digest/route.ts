import { NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/api/authorize-cron';
import { createAdminClient } from '@/lib/supabase/admin';
import { createTelegramChannel, resolveBotToken } from '@/lib/ceo/telegram';
import { israelHourNow, nextDigestAt, periodsFor, sendDigest } from '@/lib/ceo/digest';
import { readGideonSettings } from '@/lib/ceo/settings';
import { runNightlyTaskMerge } from '@/lib/almog/nightly-task-merge';
import { flushOutbox, loadPrefsSafe, publishDelayed } from '@/lib/ceo/outbound';
import { quietState } from '@/lib/ceo/quiet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Daily 21:00 IL QStash schedule. The digest hour is admin-configurable (/ops/ceo/settings):
 * if it isn't 21, this run publishes one delayed QStash message to itself (?scheduled=1) for the
 * next configured hour — no schedule change needed. Deduplicated per target time.
 */
function scheduleDigestAt(notBefore: number) {
  return publishDelayed('/api/v1/ai/cron/ceo-digest?scheduled=1', notBefore, `ceo-digest-${notBefore}`);
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
  // audit trail so the nightly merge's last run is visible (it was only logged by the manual route)
  if (almogChecks) await db.from('ceo_audit_log').insert({ actor: 'cron', event: 'almog_checks', detail: almogChecks }).then(() => null, () => null);
  if (!(await resolveBotToken())) return NextResponse.json({ skipped: 'telegram not configured', almogChecks });
  if (!settings.digest_enabled && !forced) return NextResponse.json({ skipped: 'digest disabled', almogChecks });

  if (!forced && !scheduled && israelHourNow() !== settings.digest_hour) {
    const at = nextDigestAt(settings.digest_hour);
    return NextResponse.json({ deferred_to: new Date(at * 1000).toISOString(), schedule: await scheduleDigestAt(at), almogChecks });
  }

  const ch = createTelegramChannel();
  const out: Record<string, unknown> = { almogChecks };
  // anything held from an earlier quiet window goes out first (no-op while still quiet)
  out.outbox = await flushOutbox(db, (c, t, b) => ch.send(c, t, b, { kind: 'outbox' })).catch((e) => ({ error: String(e).slice(0, 120) }));
  // Shabbat / Yom Tov: the daily update is skipped (stale by tzeit; the next digest covers it).
  // Weekly/monthly are generated and the send gate holds them until after tzeit.
  const q = quietState(await loadPrefsSafe(db));
  for (const p of periodsFor(new Date(), forced)) {
    if (p === 'daily' && !forced && q.quiet && q.reasons.some((r) => r === 'shabbat' || r === 'yom_tov')) {
      out[p] = { skipped: 'shabbat' };
      await db.from('ceo_audit_log').insert({ actor: 'cron', event: 'digest_skipped_quiet', detail: { period: p, until: q.until.toISOString() } }).then(() => null, () => null);
      continue;
    }
    out[p] = await sendDigest(db, ch, p);
  }
  return NextResponse.json({ ok: true, ...out });
}

export const GET = handle;
export const POST = handle;
