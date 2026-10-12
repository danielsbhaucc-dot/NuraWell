import { NextResponse } from 'next/server';
import { NURAWELL_CHAT_SYSTEM_PROMPT } from '@/lib/ai/prompts';
export const runtime = 'edge';
export const preferredRegion = 'fra1';
export const dynamic = 'force-dynamic';
async function one(sys: string) {
  const t = Date.now();
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'openai/gpt-5.6-terra', reasoning: { effort: 'none' }, max_tokens: 40, stream: true, messages: [{ role: 'system', content: sys }, { role: 'user', content: 'משפט אחד: היי' }] }) });
  const hdr = Date.now() - t;
  await r.text();
  return hdr;
}
export async function GET(req: Request) {
  if (req.headers.get('x-probe') !== 'ffe3faf08ce003eeb415bf2763817499') return NextResponse.json({}, { status: 404 });
  const big = NURAWELL_CHAT_SYSTEM_PROMPT + '\n' + 'הקשר: '.repeat(3000);
  return NextResponse.json({ small: await one('אתה אלמוג.'), big: [await one(big), await one(big), await one(big)] });
}
