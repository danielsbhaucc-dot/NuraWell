/** Product-agnostic security monitor. A product passes its config; nothing here knows the product. */
export type Severity = 'low' | 'moderate' | 'high' | 'critical';
export type Finding = { fingerprint: string; kind: string; severity: Severity; title: string; detail?: string };
export type Dep = { name: string; version: string };

export type SecmonConfig = {
  /** Installed production packages (lockfile snapshot generated at build). */
  deps: Dep[];
  /** Packages/products the product cares about for KEV + GitHub advisories (npm names). */
  watchPackages: string[];
  /** Keywords matched against CISA KEV vendor/product (lowercase). */
  kevKeywords: string[];
  /** Public URLs whose security headers + TLS expiry are checked. */
  sites: string[];
  /** Heartbeat sources that must check in; hours before the dead-man switch fires. */
  heartbeats: { source: string; label: string; maxAgeHours: number }[];
  /** Days before TLS expiry that count as high. */
  tlsWarnDays?: number;
};

export const SEV_RANK: Record<Severity, number> = { low: 0, moderate: 1, high: 2, critical: 3 };
export const isAlertable = (s: Severity) => SEV_RANK[s] >= SEV_RANK.high;
