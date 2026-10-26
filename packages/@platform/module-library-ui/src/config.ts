// Secure defaults. Config is injected by the host product; modules never read env vars.
export interface ModuleLibraryUiConfig { enabled: boolean; allowedRoles: string[]; logPii: false; retentionDays: number }
export const defaultConfig: ModuleLibraryUiConfig = Object.freeze({ enabled: false, allowedRoles: ['admin'], logPii: false, retentionDays: 30 }) as ModuleLibraryUiConfig;
export function resolveConfig(input: Partial<ModuleLibraryUiConfig> = {}): ModuleLibraryUiConfig {
  const c = { ...defaultConfig, ...input, logPii: false as const };
  if (!Number.isInteger(c.retentionDays) || c.retentionDays < 1 || c.retentionDays > 3650) c.retentionDays = defaultConfig.retentionDays;
  return c;
}
