export type Tier = 'internal' | 'shareable' | 'sellable';
export type Category = 'security' | 'privacy' | 'platform' | 'feature' | 'ui' | 'ops';
export type StorePage = {
  name: string; summary: string; descriptionHe: string; audience: string[]; useCases: string[]; features: string[]; dataTouched: string[]; permissions: string[];
  security: string[]; whereDataLives: string; installConfig: string; compatibility: string; limitations: string[]; support: string; iamModule?: string;
};
/** One entry of registry.generated.json (built from module.json + docs by `node scripts/modules/index.mjs`). */
export type RegistryModule = {
  id: string; package: string; version: string; distribution: Tier; category: Category; toggleable: boolean; description: string;
  requires: { modules: Record<string, string> }; env: string[]; migrations: string[]; conformance: string[]; tests?: string[]; dataPolicy?: string;
  frozen?: string[]; store: StorePage; sale?: { modes: ('bundle' | 'source')[]; serverCore?: string[] };
  dir: string; usedBy: string[]; readme: string; changelog: string; configSchema: { properties?: Record<string, { type?: string; default?: unknown; description?: string; description_he?: string; const?: unknown; minimum?: number; maximum?: number }> } | null; files: string[];
};
export type ProductRow = { id: string; name: string; color: string; panelHref: string | null; enabled: string[] };
/** Aggregates only. null = source unavailable (never a guessed number). */
export type ProductSummary = { productId: string; users: number | null; aiCost30dUsd: number | null; errors7d: number | null; securityOpen: number | null; tasksOpen: number | null };
export type HubSection = 'overview' | 'library' | 'costs' | 'security' | 'legal' | 'licenses';
export type LicenseRow = { lid: string; moduleId: string; licensee: string; mode: 'bundle' | 'source'; domains: string[]; issuedAt: string; expiresAt: string | null; state: 'active' | 'suspended_until' | 'suspended_until_payment' | 'revoked_permanent'; until: string | null };
