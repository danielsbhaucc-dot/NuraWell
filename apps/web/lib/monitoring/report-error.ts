/**
 * Lightweight, dependency-free error/event reporting scaffold.
 *
 * Wire a provider by setting ONE of these server-side env vars:
 *   - MONITORING_WEBHOOK_URL  → POSTs a JSON payload (Slack/Discord/generic webhook)
 *   - SENTRY_DSN              → reserved hook; integrate `@sentry/nextjs` here later
 *
 * When neither is set this is a no-op (safe to call from anywhere). It never
 * throws and never blocks the caller — reporting failures are swallowed.
 */

import { scrubTelemetry } from '@/lib/security/scrub-sensitive';

export type Severity = 'info' | 'warning' | 'error' | 'fatal';

export interface ReportContext {
  /** Where the event originated, e.g. 'api/v1/ai/chat'. */
  source?: string;
  /** Authenticated user id, if any (never include PII like email/phone). */
  userId?: string;
  /** Arbitrary non-sensitive tags for filtering/alerting. */
  tags?: Record<string, string>;
}

interface MonitoringPayload {
  service: 'nurawell-web';
  environment: string;
  severity: Severity;
  message: string;
  source?: string;
  userId?: string;
  tags?: Record<string, string>;
  stack?: string;
  timestamp: string;
}

function toMessage(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  if (typeof error === 'string') {
    return { message: error };
  }
  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: 'Unknown non-serializable error' };
  }
}

/** Free default sink: public.error_events (service role, REST — works in node and edge). Never throws. */
async function storeInSupabase(payload: MonitoringPayload): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || process.env.NODE_ENV === 'test') return;
  if (payload.severity === 'info') return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    await fetch(`${url}/rest/v1/error_events`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        environment: payload.environment,
        severity: payload.severity,
        source: payload.source ?? null,
        route: payload.tags?.route ?? null,
        message: payload.message.slice(0, 1000),
        stack: payload.stack?.slice(0, 4000) ?? null,
        user_id: payload.userId && /^[0-9a-f-]{36}$/i.test(payload.userId) ? payload.userId : null,
        tags: payload.tags ?? {},
      }),
      signal: controller.signal,
    });
  } catch {
    /* best-effort */
  } finally {
    clearTimeout(timeout);
  }
}

async function deliver(raw: MonitoringPayload): Promise<void> {
  // Every sink below sees only scrubbed text (no emails/phones/keys/JWTs/ciphertext/DB row echoes).
  const payload: MonitoringPayload = {
    ...raw,
    message: scrubTelemetry(raw.message),
    stack: raw.stack ? scrubTelemetry(raw.stack) : undefined,
    tags: raw.tags ? Object.fromEntries(Object.entries(raw.tags).map(([k, v]) => [k, scrubTelemetry(v)])) : undefined,
  };
  await storeInSupabase(payload);
  const webhook = process.env.MONITORING_WEBHOOK_URL?.trim();
  if (webhook) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch {
      // Best-effort: never let monitoring break the request path.
    } finally {
      clearTimeout(timeout);
    }
    return;
  }

  // No provider configured: log to stderr so platform log drains still catch it.
  if (payload.severity === 'error' || payload.severity === 'fatal') {
    // eslint-disable-next-line no-console
    console.error(`[monitor:${payload.severity}] ${payload.source ?? ''} ${payload.message}`);
  }
}

/** Report a caught error. Fire-and-forget friendly. */
export async function reportError(
  error: unknown,
  context: ReportContext = {},
  severity: Severity = 'error',
): Promise<void> {
  const { message, stack } = toMessage(error);
  await deliver({
    service: 'nurawell-web',
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    severity,
    message,
    source: context.source,
    userId: context.userId,
    tags: context.tags,
    stack,
    timestamp: new Date().toISOString(),
  });
}

/** Report a non-error event (e.g. a security-relevant action). */
export async function reportEvent(
  message: string,
  context: ReportContext = {},
  severity: Severity = 'info',
): Promise<void> {
  await deliver({
    service: 'nurawell-web',
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    severity,
    message,
    source: context.source,
    userId: context.userId,
    tags: context.tags,
    timestamp: new Date().toISOString(),
  });
}
