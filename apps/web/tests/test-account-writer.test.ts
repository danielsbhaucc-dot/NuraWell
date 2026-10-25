import { describe, it, expect } from 'vitest';
import { testAccountWriterOverride, TEST_ACCOUNT_WRITER_SLUG } from '../lib/ai/test-account-writer';

describe('test account writer override', () => {
  it('forces the cheap lane for role=test', () => {
    const o = testAccountWriterOverride('test');
    expect(o?.slug).toBe(TEST_ACCOUNT_WRITER_SLUG);
    expect(o?.writer).toBe('llama4');
  });
  it('never touches real users or admins', () => {
    expect(testAccountWriterOverride('user')).toBeNull();
    expect(testAccountWriterOverride('admin')).toBeNull();
    expect(testAccountWriterOverride(null)).toBeNull();
  });
});
