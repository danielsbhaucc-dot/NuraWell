import { describe, expect, it } from 'vitest';
import { isTrivialChat, parseCombined } from '../lib/ai/chat-sessions/close-digest';

const t = (role: 'user' | 'assistant', content: string) => ({ role, content, created_at: '2026-10-14T08:00:00Z' });

describe('close digest', () => {
  it('skips empty and tiny chats', () => {
    expect(isTrivialChat([])).toBe(true);
    expect(isTrivialChat([t('user', 'היי'), t('assistant', 'היי! מה נשמע?')])).toBe(true);
    expect(isTrivialChat([t('user', 'א'.repeat(120)), t('assistant', 'ok')])).toBe(false);
    expect(isTrivialChat([t('user', 'היי'), t('assistant', 'היי'), t('user', 'תודה')])).toBe(false);
  });
  it('parses combined output', () => {
    const r = parseCombined('{"summary":["קושי עם ארוחת ערב"],"facts":[{"category":"goal","text":"רוצה לשתות יותר מים","level":3}],"title":"מים וארוחת ערב"}', true);
    expect(r?.summary).toMatch(/^• \[\d{4}-\d{2}-\d{2}\] קושי/);
    expect(r?.title).toBe('מים וארוחת ערב');
    expect(parseCombined('nope', false)).toBeNull();
  });
});
