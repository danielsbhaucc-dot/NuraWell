import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeDbBackupRequest } from '@/lib/api/authorize-db-backup';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordHeartbeat } from '@/lib/platform/secmon';
import { SECMON_HEARTBEAT_SOURCES } from '@/lib/ops/secmon-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ source: z.string().max(64), ok: z.boolean().default(true), detail: z.string().max(300).optional() });

/** Heartbeat from an external security run (GitHub workflow, Grok Bot routine). Bearer secret; known sources only. */
export async function POST(request: Request) {
  const denied = await authorizeDbBackupRequest(request);
  if (denied) return denied;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success || !SECMON_HEARTBEAT_SOURCES.has(p.data.source)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  await recordHeartbeat(createAdminClient(), p.data.source, p.data.ok, p.data.detail);
  return NextResponse.json({ ok: true });
}
