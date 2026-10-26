import { describe, it, expect } from 'vitest';
import { testAccountWriterOverride, TEST_ACCOUNT_WRITER_SLUG } from '../lib/ai/test-account-writer';

describe('test account writer override', () => {
  it('forces the cheap lane for role=test and role=admin', () => {
    for (const role of ['test', 'admin']) {
      const o = testAccountWriterOverride(role);
      expect(o?.slug).toBe(TEST_ACCOUNT_WRITER_SLUG);
      expect(o?.writer).toBe('llama4');
    }
  });
  it('forces the cheap lane for @test.com emails even with role=user', () => {
    expect(testAccountWriterOverride('user', 'qa1@test.com')?.slug).toBe(TEST_ACCOUNT_WRITER_SLUG);
    expect(testAccountWriterOverride(null, ' QA@TEST.COM ')?.slug).toBe(TEST_ACCOUNT_WRITER_SLUG);
  });
  it('never touches real users', () => {
    expect(testAccountWriterOverride('user')).toBeNull();
    expect(testAccountWriterOverride('user', 'someone@gmail.com')).toBeNull();
    expect(testAccountWriterOverride('user', 'a@test.com.evil.io')).toBeNull();
    expect(testAccountWriterOverride(null)).toBeNull();
  });
});
