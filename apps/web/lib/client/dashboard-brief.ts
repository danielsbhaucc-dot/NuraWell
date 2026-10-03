/**
 * SSOT ל-dashboard-brief — dedupe בין DashboardBriefCard ל-DynamicMentorWidgetClient.
 */

export type DashboardBrief = {
  headline: string;
  body: string;
  cta_label?: string;
  cta_action?: string;
  cta_prompt?: string | null;
  mood?: string;
};

type BriefResponse = {
  brief?: DashboardBrief;
  cached?: boolean;
  error?: string;
};

const CACHE_TTL_MS = 8_000;
let cached: { at: number; data: DashboardBrief | null } | null = null;
let inflight: Promise<DashboardBrief | null> | null = null;

export function invalidateDashboardBriefCache(): void {
  cached = null;
  inflight = null;
}

export async function fetchDashboardBrief(opts?: {
  refresh?: boolean;
}): Promise<DashboardBrief | null> {
  const refresh = Boolean(opts?.refresh);
  if (!refresh && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }
  if (!refresh && inflight) return inflight;

  const run = (async () => {
    try {
      const res = await fetch(`/api/v1/ai/dashboard-brief${refresh ? '?refresh=1' : ''}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      if (!res.ok) {
        cached = { at: Date.now(), data: null };
        return null;
      }
      const json = (await res.json()) as BriefResponse;
      const brief = json.brief ?? null;
      cached = { at: Date.now(), data: brief };
      return brief;
    } catch {
      cached = { at: Date.now(), data: null };
      return null;
    } finally {
      inflight = null;
    }
  })();

  inflight = run;
  return run;
}
