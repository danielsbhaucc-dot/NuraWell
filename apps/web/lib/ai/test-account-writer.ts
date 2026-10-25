import type { V3Route } from './routing-v3';
/**
 * Cost guard: internal test accounts (profiles.role = 'test', e.g. the prod e2e user)
 * never use the premium writers (Terra / Claude / Grok). They get the everyday lane
 * (Luna), which supports the same tools and voice rules, so e2e still exercises the
 * full pipeline. Real users (role 'user') are untouched.
 */
export const TEST_ACCOUNT_WRITER_SLUG = 'openai/gpt-5.6-luna';

export function isInternalTestRole(role: string | null | undefined): boolean {
  return role === 'test';
}

export function testAccountWriterOverride(role: string | null | undefined): V3Route | null {
  if (!isInternalTestRole(role)) return null;
  return { writer: 'llama4', slug: TEST_ACCOUNT_WRITER_SLUG, lane: 'test_account_luna' };
}
