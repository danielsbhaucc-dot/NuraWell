import { requireApiSession } from '../../../../../../lib/api/route-guards';
import { isUpstashVectorConfigured } from '../../../../../../lib/ai/upstash-vector-rest';

export const runtime = 'edge';

async function upstashPing(): Promise<{ ok: boolean; error?: string }> {
  if (!isUpstashVectorConfigured()) {
    return { ok: false, error: 'not_configured' };
  }
  try {
    const url = process.env.UPSTASH_VECTOR_REST_URL!.trim().replace(/\/+$/, '');
    const token = process.env.UPSTASH_VECTOR_REST_TOKEN!.trim();
    const res = await fetch(`${url}/list-namespaces`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return { ok: false, error: await res.text() };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * בדיקת תצורה + נגישות Upstash (בלי חילוץ AI).
 */
export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const openrouterKey = Boolean(process.env.OPENROUTER_API_KEY?.trim());
  const upstashEnv = isUpstashVectorConfigured();

  let upstashReachable = false;
  let upstashError: string | undefined;
  if (upstashEnv) {
    const ping = await upstashPing();
    upstashReachable = ping.ok;
    if (!ping.ok && ping.error) {
      upstashError = ping.error;
    }
  }

  const fullyOk = openrouterKey && upstashEnv && upstashReachable;

  return Response.json({
    ok: fullyOk,
    openrouter_key_configured: openrouterKey,
    upstash_env_configured: upstashEnv,
    upstash_reachable: upstashReachable,
    upstash_error: upstashError,
  });
}
