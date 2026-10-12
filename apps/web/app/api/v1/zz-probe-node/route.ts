import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  if (req.headers.get('x-probe') !== '9284938a3b7fb91c261049220f414a8e') return NextResponse.json({}, { status: 404 });
  const out: number[] = [];
  for (let i = 0; i < 2; i++) {
    const t = Date.now();
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'openai/gpt-5.6-terra', reasoning: { effort: 'none' }, max_tokens: 30, messages: [{ role: 'user', content: 'say hi' }] }) });
    await r.text();
    out.push(Date.now() - t);
  }
  const t2 = Date.now(); await fetch('https://openrouter.ai/api/v1/models?limit=1').then((r) => r.arrayBuffer()); out.push(Date.now() - t2);
  return NextResponse.json({ out });
}
