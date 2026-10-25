import { describe, it, expect, beforeEach, vi } from 'vitest';
// Next.js provides globalThis.AsyncLocalStorage at runtime; mirror that here (before usage-meter loads).
vi.hoisted(async () => {
  const { AsyncLocalStorage } = await import('node:async_hooks');
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = AsyncLocalStorage;
});
import { meteredFetch, withAiUsage } from '@/lib/ai/usage-meter';
import { _setPiiSeedLoader, _setPiiDirectoryLoader } from '@/lib/ai/privacy/outbound-pii-guard';

const UID = '11111111-2222-4333-8444-555555555555';
const RAW = ['נועה', 'ברקוביץ', '052-1234567', 'noa.b@example.com', '0521234567'];
const URL_ = 'https://openrouter.ai/api/v1/chat/completions';

function capture(reply: (body: any) => Response) {
  const sent: string[] = [];
  const base: typeof fetch = async (_i, init) => {
    sent.push(String(init?.body));
    return reply(JSON.parse(String(init?.body)));
  };
  return { sent, base };
}
const sse = (chunks: string[]) =>
  new Response(
    new ReadableStream({
      start(c) {
        for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch));
        c.close();
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } }
  );
const ev = (content: string, extra = '') => `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content } , ...(extra ? { finish_reason: extra } : {}) }] })}\n\n`;

beforeEach(() => {
  _setPiiSeedLoader(async () => ({ full_name: 'נועה ברקוביץ', phone: '052-1234567', email: 'noa.b@example.com' }));
  _setPiiDirectoryLoader(async () => ['נועה ברקוביץ', 'נועה', 'אבי לוי', 'אבי']);
});

describe('central outbound PII guard (meteredFetch)', () => {
  it('no raw PII leaves; JSON reply restored', async () => {
    let pseudo = '';
    const { sent, base } = capture((b) => {
      pseudo = b.messages[1].content.split(',')[0].replace('היי ', '');
      return new Response(JSON.stringify({ choices: [{ message: { content: `שלום ${pseudo}, כתבתי ל-[[USER_EMAIL]]` } }] }), {
        headers: { 'content-type': 'application/json' },
      });
    });
    const res = await meteredFetch(base, { userId: UID, feature: 't' })(URL_, {
      method: 'POST',
      body: JSON.stringify({
        model: 'x',
        messages: [
          { role: 'system', content: 'המשתמשת: נועה ברקוביץ, טלפון 052-1234567, מייל noa.b@example.com' },
          { role: 'user', content: 'היי נועה, תנועה זה חשוב. התקשרו ל-0521234567 ות.ז 123456782' },
        ],
      }),
    });
    for (const r of RAW) expect(sent[0].replace(/תנועה/g, '')).not.toContain(r);
    expect(sent[0]).not.toContain('123456782');
    expect(sent[0]).toContain('תנועה'); // whole-word only
    const j = await res.json();
    expect(j.choices[0].message.content).toBe('שלום נועה, כתבתי ל-noa.b@example.com');
  });

  it('SSE: placeholders/pseudonyms split across chunks and across network packets are restored', async () => {
    let p = '';
    const { sent, base } = capture((b) => {
      p = b.messages[0].content; // pseudonym of נועה
      const s = ev(`שלום ${p.slice(0, 1)}`) + ev(`${p.slice(1)}! המייל [[USER_`) + ev('EMAIL]] נשמר', 'stop') + 'data: [DONE]\n\n';
      // also cut the raw byte stream in odd places (mid-line)
      return sse([s.slice(0, 17), s.slice(17, 60), s.slice(60, 61), s.slice(61)]);
    });
    const res = await meteredFetch(base, { userId: UID })(URL_, {
      method: 'POST',
      body: JSON.stringify({ model: 'x', stream: true, messages: [{ role: 'user', content: 'נועה' }] }),
    });
    expect(sent[0]).not.toContain('נועה');
    const text = await res.text();
    const out = text
      .split('\n')
      .filter((l) => l.startsWith('data: {'))
      .map((l) => JSON.parse(l.slice(6)).choices[0].delta?.content ?? '')
      .join('');
    expect(out).toBe('שלום נועה! המייל noa.b@example.com נשמר');
    expect(text).toContain('[DONE]');
  });

  it('unattributed background job: directory shields every known name', async () => {
    const { sent, base } = capture(() => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })));
    await meteredFetch(base, { feature: 'cron' })(URL_, {
      method: 'POST',
      body: JSON.stringify({ model: 'x', messages: [{ role: 'user', content: 'סכם: אבי לוי דיבר עם נועה' }] }),
    });
    expect(sent[0]).not.toMatch(/אבי|לוי|נועה/);
  });

  it('ALS userId (withAiUsage) is used; embeddings input shielded', async () => {
    const { sent, base } = capture(() => new Response(JSON.stringify({ data: [] })));
    await withAiUsage({ userId: UID }, () =>
      meteredFetch(base)('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        body: JSON.stringify({ model: 'e', input: ['נועה ברקוביץ אוהבת ריצה'] }),
      })
    );
    expect(sent[0]).not.toMatch(/נועה|ברקוביץ/);
    expect(sent[0]).toContain('[[USER_FULL_NAME]]'); // user seed, not directory
  });
});

describe('per-user scope (withAiUser) inside a cron context', () => {
  it('uses only that user’s seed, stable tokens, nested inside enterAiUsage-like scope', async () => {
    const { withAiUser } = await import('@/lib/ai/usage-meter');
    const seen: string[] = [];
    _setPiiSeedLoader(async (id) => (id === UID ? { full_name: 'נועה ברקוביץ' } : { full_name: 'אבי לוי' }));
    const { sent, base } = capture(() => new Response(JSON.stringify({ choices: [{ message: { content: '[[USER_FIRST_NAME]] ✓' } }] })));
    await withAiUsage({ feature: 'notify:master' }, () =>
      withAiUser(UID, 'test', async () => {
        const r = await meteredFetch(base)(URL_, { method: 'POST', body: JSON.stringify({ model: 'x', messages: [{ role: 'user', content: 'נועה ברקוביץ ונועה' }] }) });
        seen.push((await r.json()).choices[0].message.content);
      })
    );
    expect(sent[0]).toContain('[[USER_FULL_NAME]] ו[[USER_FIRST_NAME]]');
    expect(seen[0]).toBe('נועה ✓');
  });
});

describe('seed lookup failure falls back to the name directory', () => {
  it('masks the first name in a notification prompt even when the profile lookup returns nothing', async () => {
    _setPiiSeedLoader(async () => null);
    _setPiiDirectoryLoader(async () => ['דניאל רחמן', 'דניאל']);
    const { sent, base } = capture((b) =>
      new Response(JSON.stringify({ choices: [{ message: { content: `בוקר טוב ${String(b.messages[0].content).match(/\[\[[A-Z_0-9]+\]\]/)![0]} ☀️` } }] }), {
        headers: { 'content-type': 'application/json' },
      })
    );
    const f = meteredFetch(base, { userId: '22222222-2222-4333-8444-555555555555', feature: 'test' });
    const res = await f(URL_, {
      method: 'POST',
      body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'שם המשתמש: דניאל. כתוב בוקר טוב.' }] }),
    });
    expect(sent[0]).not.toContain('דניאל');
    const j = await res.json();
    expect(j.choices[0].message.content).toBe('בוקר טוב דניאל ☀️');
  });
});
