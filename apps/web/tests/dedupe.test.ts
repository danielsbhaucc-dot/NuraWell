import { describe, expect, it } from 'vitest';
import { normalizeForDedupe, insertNotification } from '../lib/notifications/deliver';
import { dedupeSameTask } from '../lib/tasks';

describe('dedupe', () => {
  it('normalizes like the DB (punctuation, emoji, spacing, case, trailing space)', () => {
    expect(normalizeForDedupe('גוף  זהה! 💧')).toBe(normalizeForDedupe('גוף זהה'));
    expect(normalizeForDedupe('שתיית 2 כוסות מים לפני הארוחה ')).toBe(normalizeForDedupe('שתיית 2 כוסות מים לפני הארוחה'));
    expect(normalizeForDedupe('Hello')).toBe('hello');
    expect(normalizeForDedupe('א')).not.toBe(normalizeForDedupe('ב'));
  });
  it('a DB unique violation is reported as deduped (duplicate rejected)', async () => {
    const admin = { from: () => ({ insert: async () => ({ data: null, error: { code: '23505', message: 'dup' } }) }) };
    const r = await insertNotification(admin as never, { user_id: 'u', type: 'system', title: 't', body: 'b' }, { idempotencyKey: 'k' });
    expect(r.deduped).toBe(true);
  });
  it('idempotency key is passed to the DB in metadata', async () => {
    let seen: Record<string, unknown> | null = null;
    const admin = { from: () => ({ insert: async (row: Record<string, unknown>) => ((seen = row), { data: null, error: null }) }) };
    await insertNotification(admin as never, { user_id: 'u', type: 'system', title: 't', body: 'b', metadata: { source: 's' } }, { idempotencyKey: 'abc' });
    expect((seen as unknown as { metadata: Record<string, unknown> }).metadata).toEqual({ source: 's', idempotency_key: 'abc' });
  });
  it('plan shows one card per habit even if legacy rows exist', () => {
    const mk = (id: string, source: string) => ({ id, status: 'accepted', is_main: false, definition: { title: 'מים', source } });
    expect(dedupeSameTask([mk('a', 'ai_daily'), mk('b', 'step')]).map((x) => x.id)).toEqual(['b']);
  });
});
