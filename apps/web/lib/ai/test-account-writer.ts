import type { V3Route } from './routing-v3';
/**
 * Cost guard (server-side, explicit): internal accounts never use the premium writers
 * (Terra / Claude / Grok). That covers profiles.role 'test' or 'admin', and any login
 * email on the reserved @test.com domain. They get the everyday lane (Luna,
 * $0.20/M input vs Terra $2/M, cheaper than gpt-5.4-mini at $0.75/M), which runs
 * the same prompt, tools and voice rules, so e2e still exercises the full pipeline.
 * Real users (role 'user', real email) are untouched and keep the normal router.
 */
export const TEST_ACCOUNT_WRITER_SLUG = 'openai/gpt-5.6-luna';

const INTERNAL_ROLES = new Set(['test', 'admin']);

export function isInternalTestRole(role: string | null | undefined): boolean {
  return typeof role === 'string' && INTERNAL_ROLES.has(role);
}

export function isInternalTestEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && /@test\.com$/i.test(email.trim());
}

export function testAccountWriterOverride(
  role: string | null | undefined,
  email?: string | null
): V3Route | null {
  if (!isInternalTestRole(role) && !isInternalTestEmail(email)) return null;
  return { writer: 'llama4', slug: TEST_ACCOUNT_WRITER_SLUG, lane: 'test_account_luna' };
}
