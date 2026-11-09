import { NextResponse } from 'next/server';
import { revokeBrowserParentSession } from '@/lib/central/parent-data-plane';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Clears the parent proof and revokes the server grant for this session, including other tabs. */
export async function POST() {
  await revokeBrowserParentSession();
  return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
}
