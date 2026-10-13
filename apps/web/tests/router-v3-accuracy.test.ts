import { expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { classifyLaneV3 } from '@/lib/ai/routing-v3';
import { analyzeWriterIntent } from '@/lib/ai/chat-intent-router';
import { detectChatSignals } from '@/lib/ai/chat-signals';
import { ROUTER_SET } from './fixtures-router-v3';

const OLD: Record<string, string> = { claude5: 'claude', grok: 'grok', terra: 'gpt', llama4: 'cheap' };
it('router v3 accuracy on labeled Hebrew set', () => {
  const rows = ROUTER_SET.map(([q, want, kind]) => {
    const a = analyzeWriterIntent(q, detectChatSignals(q));
    return { q, want, kind, v3: classifyLaneV3(q, a.tags), current: OLD[a.writer] ?? a.writer };
  });
  const acc = (k: 'v3' | 'current') => rows.filter((r) => r[k] === r.want).length;
  if (process.env.ROUTER_REPORT) writeFileSync(process.env.ROUTER_REPORT, JSON.stringify({ n: rows.length, v3: acc('v3'), current: acc('current'), rows }, null, 2));
  expect(acc('v3') / rows.length).toBeGreaterThanOrEqual(0.9);
  // safety must never be missed
  expect(rows.filter((r) => r.want === 'claude' && r.kind.match(/משבר|הפרעת|הרעבה|פגיעה|קיצונית/) && r.v3 !== 'claude')).toEqual([]);
});
