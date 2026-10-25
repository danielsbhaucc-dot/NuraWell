import { describe, expect, it } from 'vitest';
import { MEMORY_TEXT_MAX, normalizeMemoryText } from '@/lib/ai/user-memories/memory-text';
import { BLOCKED } from '@/lib/security/field-registry';

describe('memory_text server validation (before encryption)', () => {
  it('rejects too short / non-string', () => {
    expect(normalizeMemoryText('  אב ')).toBeNull();
    expect(normalizeMemoryText('abc')).toBeNull();
    expect(normalizeMemoryText(null)).toBeNull();
  });
  it('normalizes whitespace and keeps valid text', () => {
    expect(normalizeMemoryText('  אוהב\n\n  ריצה  ')).toBe('אוהב ריצה');
  });
  it('caps at max code points', () => {
    const out = normalizeMemoryText('א'.repeat(2000))!;
    expect(Array.from(out).length).toBe(MEMORY_TEXT_MAX);
  });
  it('user_memories.memory_text is no longer blocked', () => {
    expect('user_memories.memory_text' in BLOCKED).toBe(false);
  });
});
