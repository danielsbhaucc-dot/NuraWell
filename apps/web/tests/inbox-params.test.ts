import { describe, expect, it } from 'vitest';
import {
  nextCursorFromRows,
  parseInboxSearchParams,
} from '../lib/notifications/inbox-params';

describe('parseInboxSearchParams', () => {
  it('defaults limit and inbox (non-archived)', () => {
    const p = parseInboxSearchParams(new URLSearchParams());
    expect(p.limit).toBe(50);
    expect(p.archived).toBe(false);
    expect(p.unreadOnly).toBe(false);
    expect(p.types).toBeNull();
    expect(p.cursor).toBeNull();
  });

  it('parses archived, unread, types, cursor, limit cap', () => {
    const qs = new URLSearchParams({
      archived: '1',
      unread_only: 'true',
      types: 'ai_message,streak',
      cursor: new Date('2026-01-15T12:00:00.000Z').toISOString(),
      limit: '999',
    });
    const p = parseInboxSearchParams(qs);
    expect(p.archived).toBe(true);
    expect(p.unreadOnly).toBe(true);
    expect(p.types).toEqual(['ai_message', 'streak']);
    expect(p.cursor).toBe('2026-01-15T12:00:00.000Z');
    expect(p.limit).toBe(100);
  });

  it('ignores invalid type tokens', () => {
    const p = parseInboxSearchParams(new URLSearchParams({ types: 'ai_message,invalid_x' }));
    expect(p.types).toEqual(['ai_message']);
  });
});

describe('nextCursorFromRows', () => {
  it('returns null when fewer rows than limit', () => {
    expect(nextCursorFromRows([{ created_at: 'a' }], 40)).toBeNull();
  });

  it('returns last created_at when full page', () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({
      created_at: `2026-05-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
    }));
    expect(nextCursorFromRows(rows, 40)).toBe(rows[39]?.created_at ?? null);
  });
});

describe('parseInboxSearchParams performance', () => {
  it('parses 50k typical queries quickly (pure CPU)', () => {
    const qs = new URLSearchParams({
      limit: '40',
      unread_only: '1',
      types: 'ai_message,streak',
    });
    const t0 = performance.now();
    const n = 50_000;
    for (let i = 0; i < n; i++) {
      parseInboxSearchParams(qs);
    }
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(800);
  });
});
