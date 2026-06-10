import { describe, expect, it } from 'vitest';

import { rankMemoryHits, type RankableHit } from '../lib/ai/memory-ranking';
import { formatRagMemoryContextBlock } from '../lib/ai/format-rag-context';
import type { QueryHit } from '../lib/ai/upstash-vector-rest';

const NOW = new Date('2026-06-10T12:00:00.000Z');

function hit(
  id: string,
  score: number,
  text: string,
  opts: { category?: string; level?: 2 | 3 | 4; updatedAt?: string; seenCount?: number } = {}
): RankableHit {
  return {
    id,
    score,
    metadata: {
      userId: 'u1',
      text,
      category: opts.category ?? 'weakness',
      memoryLevel: opts.level ?? 2,
      isInsight: (opts.level ?? 2) >= 3,
      updatedAt: opts.updatedAt ?? NOW.toISOString(),
      lastSeenAt: opts.updatedAt ?? NOW.toISOString(),
      seenCount: opts.seenCount,
    },
  };
}

describe('memory-ranking', () => {
  it('relevance dominates: a highly-relevant L2 beats a barely-relevant L4', () => {
    const ranked = rankMemoryHits(
      [
        hit('a', 0.91, 'נופל באכילה בערב אחרי עבודה', { category: 'weakness', level: 2 }),
        hit('b', 0.34, 'הבין שהקושי קשור לבדידות לא לרעב', { category: 'insight', level: 4 }),
      ],
      { now: NOW, maxItems: 2 }
    );
    expect(ranked[0].id).toBe('a');
  });

  it('filters out noise below the relevance floor', () => {
    const ranked = rankMemoryHits(
      [
        hit('a', 0.8, 'דפוס רלוונטי', { level: 2 }),
        hit('noise', 0.1, 'זיכרון לא קשור בכלל', { level: 2 }),
      ],
      { now: NOW, maxItems: 5 }
    );
    expect(ranked.map((r) => r.id)).toEqual(['a']);
  });

  it('keeps deep level-4 insights even below the relevance floor', () => {
    const ranked = rankMemoryHits(
      [hit('deep', 0.05, 'שבירת גבול מהותית', { level: 4, category: 'breakthrough' })],
      { now: NOW, maxItems: 5 }
    );
    expect(ranked.map((r) => r.id)).toEqual(['deep']);
  });

  it('recency breaks ties between equally-relevant memories', () => {
    const fresh = hit('fresh', 0.7, 'זיכרון טרי', {
      level: 2,
      updatedAt: NOW.toISOString(),
    });
    const stale = hit('stale', 0.7, 'זיכרון ישן', {
      level: 2,
      updatedAt: '2025-01-01T00:00:00.000Z',
    });
    const ranked = rankMemoryHits([stale, fresh], { now: NOW, maxItems: 2 });
    expect(ranked[0].id).toBe('fresh');
  });

  it('reinforcement breaks ties when a memory has been seen repeatedly', () => {
    const repeated = hit('repeated', 0.7, 'דפוס שחזר כמה פעמים', {
      level: 2,
      seenCount: 5,
    });
    const once = hit('once', 0.7, 'דפוס חדש חד פעמי', {
      level: 2,
      seenCount: 1,
    });
    const ranked = rankMemoryHits([once, repeated], { now: NOW, maxItems: 2 });
    expect(ranked[0].id).toBe('repeated');
  });

  it('caps items per category to avoid one category crowding out the rest', () => {
    const ranked = rankMemoryHits(
      [
        hit('w1', 0.9, 'חולשה ראשונה', { category: 'weakness', level: 2 }),
        hit('w2', 0.89, 'חולשה שנייה', { category: 'weakness', level: 2 }),
        hit('w3', 0.88, 'חולשה שלישית', { category: 'weakness', level: 2 }),
        hit('s1', 0.5, 'הצלחה', { category: 'success', level: 2 }),
      ],
      { now: NOW, maxItems: 4, maxPerCategory: 2 }
    );
    const weaknesses = ranked.filter((r) => r.category === 'weakness');
    expect(weaknesses.length).toBe(2);
    expect(ranked.some((r) => r.category === 'success')).toBe(true);
  });

  it('dedupes identical text', () => {
    const ranked = rankMemoryHits(
      [
        hit('a', 0.9, 'אותו דבר בדיוק'),
        hit('b', 0.85, 'אותו דבר בדיוק'),
      ],
      { now: NOW, maxItems: 5 }
    );
    expect(ranked.length).toBe(1);
  });

  it('formatRagMemoryContextBlock returns empty when nothing passes the floor', () => {
    const block = formatRagMemoryContextBlock(
      [hit('noise', 0.05, 'רעש', { level: 2 }) as QueryHit],
      3,
      { now: NOW }
    );
    expect(block).toBe('');
  });

  it('formatRagMemoryContextBlock groups insights, recent and patterns', () => {
    const block = formatRagMemoryContextBlock(
      [
        hit('i', 0.6, 'תובנה עמוקה', { level: 4, category: 'breakthrough' }) as QueryHit,
        hit('p', 0.8, 'נכשל שוב בערב', { level: 2, category: 'failure' }) as QueryHit,
        hit('r', 0.8, 'השלים שבוע מים', { level: 2, category: 'success' }) as QueryHit,
      ],
      3,
      { now: NOW }
    );
    expect(block).toContain('תובנות / שבירה');
    expect(block).toContain('דפוסי קושי');
    expect(block).toContain('מוקד עדכני');
  });
});
