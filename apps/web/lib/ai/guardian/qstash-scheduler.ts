import { workflowPublicBaseUrl } from '../../workflows/resolve-workflow-public-url';
import type { RiskWindow } from '../risk-window';

export type GuardianTriggerPayload = {
  userId: string;
  window: RiskWindow;
  windowStartIso: string;
  triggerAtIso: string;
  leadMin: number;
  source: 'habit_checkpoints_morning';
};

export type GuardianScheduleResult =
  | { ok: true; messageId: string | null; triggerAtIso: string }
  | { ok: false; reason: string };

function qstashApiBaseUrl(): string {
  const raw = process.env.QSTASH_URL?.trim();
  if (!raw) return 'https://qstash.upstash.io';
  return raw.replace(/\/$/, '');
}

export async function scheduleGuardianTrigger(payload: GuardianTriggerPayload): Promise<GuardianScheduleResult> {
  const token = process.env.QSTASH_TOKEN?.trim();
  if (!token) return { ok: false, reason: 'qstash_token_missing' };

  const notBeforeSeconds = Math.floor(new Date(payload.triggerAtIso).getTime() / 1000);
  if (!Number.isFinite(notBeforeSeconds) || notBeforeSeconds <= Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: 'trigger_time_not_future' };
  }

  const destination = `${workflowPublicBaseUrl()}/api/v1/ai/guardian/trigger`;
  const dedupeId = `guardian:${payload.userId}:${payload.triggerAtIso}`;
  const res = await fetch(`${qstashApiBaseUrl()}/v2/publish/${encodeURIComponent(destination)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Upstash-Method': 'POST',
      'Upstash-Not-Before': String(notBeforeSeconds),
      'Upstash-Retries': '2',
      'Upstash-Deduplication-Id': dedupeId,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, reason: `qstash_publish_failed:${res.status}:${text.slice(0, 120)}` };
  }

  const json = (await res.json().catch(() => null)) as { messageId?: string } | null;
  return { ok: true, messageId: json?.messageId ?? null, triggerAtIso: payload.triggerAtIso };
}
