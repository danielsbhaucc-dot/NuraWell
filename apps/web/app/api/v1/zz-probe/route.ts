import { NextResponse } from 'next/server';
import { NURAWELL_CHAT_SYSTEM_PROMPT } from '@/lib/ai/prompts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
async function time(url: string, body: string, h: Record<string, string> = {}) {
  const t = Date.now();
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body });
  const hdr = Date.now() - t;
  await r.text();
  return { status: r.status, hdr };
}
export async function GET(req: Request) {
  if (req.headers.get('x-probe') !== 'ffe3faf08ce003eeb415bf2763817499') return NextResponse.json({}, { status: 404 });
  const big = NURAWELL_CHAT_SYSTEM_PROMPT + '\n' + 'הקשר: '.repeat(3000);
  const junk = 'x' + big; // invalid JSON -> OpenRouter answers 400 right after upload
  const auth = { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` };
  return NextResponse.json({
    bytes: Buffer.byteLength(big),
    or_small_junk: await time('https://openrouter.ai/api/v1/chat/completions', 'x', auth),
    or_big_junk: await time('https://openrouter.ai/api/v1/chat/completions', junk, auth),
    or_big_junk2: await time('https://openrouter.ai/api/v1/chat/completions', junk, auth),
    cf_up: await time('https://speed.cloudflare.com/__up', big),
    httpbin: await time('https://httpbin.org/post', big),
  });
}
