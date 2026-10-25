/**
 * Generic QC interface. A product contributes QcCheck objects; the console never knows what they measure.
 * Every check is isolated: a throw or a timeout becomes a 'fail' result, never a crashed screen.
 */
export type QcStatus = 'ok' | 'warn' | 'fail';
export type QcResult = { status: QcStatus; value: number | null; unit?: string; detail: string };
export type QcContext = { productId: string; sinceMs: number; now: number };
export type QcCheck = {
  id: string;
  /** Hebrew label for the console. */
  label: string;
  /** Hebrew one-liner: what this measures and why it matters. */
  description: string;
  run: (ctx: QcContext) => Promise<QcResult>;
};
export type QcReport = { productId: string; generatedAt: string; overall: QcStatus; results: (QcResult & { id: string; label: string; description: string; ms: number })[] };

const RANK: Record<QcStatus, number> = { ok: 0, warn: 1, fail: 2 };

/** ok/warn/fail from a value and thresholds (value ≥ fail → fail, ≥ warn → warn). */
export function grade(value: number, warnAt: number, failAt: number): QcStatus {
  return value >= failAt ? 'fail' : value >= warnAt ? 'warn' : 'ok';
}

export function validateChecks(checks: readonly QcCheck[]): string[] {
  const errs: string[] = [];
  const seen = new Set<string>();
  for (const c of checks) {
    if (!/^[a-z][a-z0-9-]{1,40}$/.test(c.id)) errs.push(`bad id: ${c.id}`);
    if (seen.has(c.id)) errs.push(`duplicate id: ${c.id}`);
    seen.add(c.id);
    if (!c.label.trim()) errs.push(`missing label: ${c.id}`);
  }
  return errs;
}

export async function runChecks(checks: readonly QcCheck[], ctx: QcContext, opts: { timeoutMs?: number } = {}): Promise<QcReport> {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const results = await Promise.all(checks.map(async (c) => {
    const t0 = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const r = await Promise.race([
        c.run(ctx),
        new Promise<QcResult>((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), timeoutMs); }),
      ]);
      return { ...r, id: c.id, label: c.label, description: c.description, ms: Date.now() - t0 };
    } catch (e) {
      const detail = e instanceof Error && e.message === 'timeout' ? 'הבדיקה חרגה מזמן התגובה.' : 'הבדיקה נכשלה בהרצה.';
      return { status: 'fail' as const, value: null, detail, id: c.id, label: c.label, description: c.description, ms: Date.now() - t0 };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }));
  const overall = results.reduce<QcStatus>((acc, r) => (RANK[r.status] > RANK[acc] ? r.status : acc), 'ok');
  return { productId: ctx.productId, generatedAt: new Date(ctx.now).toISOString(), overall, results };
}
