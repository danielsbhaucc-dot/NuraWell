import { describe, it, expect } from 'vitest';
import { _callerFromStack } from '../lib/ai/usage-meter';

describe('usage meter untagged fallback', () => {
  it('names the first app caller, skipping the meter and SDKs', () => {
    const stack = [
      'Error',
      '    at untaggedFeature (/var/task/apps/web/lib/ai/usage-meter.ts:120:5)',
      '    at OpenAI.fetch (/var/task/node_modules/openai/core.js:1:1)',
      '    at buildBrief (/var/task/apps/web/lib/ai/dashboard-brief-llm.ts:40:3)',
    ].join('\n');
    expect(_callerFromStack(stack)).toBe('lib/ai/dashboard-brief-llm.ts');
  });
  it('falls back to unknown', () => {
    expect(_callerFromStack(undefined)).toBe('unknown');
  });
});
