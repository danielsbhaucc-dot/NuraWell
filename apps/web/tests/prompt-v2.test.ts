import { describe, it, expect } from 'vitest';
import { NURAWELL_CHAT_SYSTEM_PROMPT_V2, ALMOG_CHAT_FINAL_GUARDRAILS_V2 } from '@/lib/ai/prompts-v2';
import { NURAWELL_CHAT_SYSTEM_PROMPT, ALMOG_CHAT_FINAL_GUARDRAILS } from '@/lib/ai/prompts';
import { budgetHistoryV2, budgetContextSectionsV2 } from '@/lib/ai/context-budget-v2';

describe('prompt v2', () => {
  it('safety block first and overriding', () => {
    expect(NURAWELL_CHAT_SYSTEM_PROMPT_V2.startsWith('— בטיחות (גובר על כל כלל')).toBe(true);
    for (const k of ['קצב ירידה', 'מצב רפואי', 'הפרעת אכילה', 'ער״ן 1201', 'VAULT', 'vault']) expect(NURAWELL_CHAT_SYSTEM_PROMPT_V2).toContain(k);
  });
  it('slang allowed (Daniel), no anti-slang rule', () => {
    expect(NURAWELL_CHAT_SYSTEM_PROMPT_V2).not.toMatch(/סלנג[^\n]*כמעט לא/);
    expect(NURAWELL_CHAT_SYSTEM_PROMPT_V2).toContain('אחי');
  });
  it('smaller than v1', () => {
    expect((NURAWELL_CHAT_SYSTEM_PROMPT_V2 + ALMOG_CHAT_FINAL_GUARDRAILS_V2).length).toBeLessThan((NURAWELL_CHAT_SYSTEM_PROMPT + ALMOG_CHAT_FINAL_GUARDRAILS).length * 0.6);
  });
  it('history budget keeps last N, starts with user, caps long', () => {
    const msgs = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x'.repeat(i === 25 ? 5000 : 100) }));
    const out = budgetHistoryV2(msgs);
    expect(out.length).toBeLessThanOrEqual(12);
    expect(out[0]!.role).toBe('user');
    expect(out[out.length - 1]).toEqual(msgs[29]);
    expect(Math.max(...out.map((m) => m.content.length))).toBeLessThanOrEqual(1501);
  });
  it('context budget never cuts protected sections', () => {
    const safety = '[בטיחות — עדיפות עליונה] ' + 'א'.repeat(3000);
    const r = budgetContextSectionsV2([safety, 'זיכרון ארוך ' + 'ב'.repeat(9000), 'רגיל ' + 'ג'.repeat(9000)]);
    expect(r.sections[0]).toBe(safety);
    expect(r.after).toBeLessThan(r.before);
  });
});
