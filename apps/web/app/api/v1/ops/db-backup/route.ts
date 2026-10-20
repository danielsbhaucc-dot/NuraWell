import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeDbBackupRequest } from '@/lib/api/authorize-db-backup';
import { legalBucket, legalR2Client } from '@/lib/legal/evidence-storage';
import { createR2PutPresignedUrl } from '@/lib/storage/r2-presign';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PREFIX = 'backups/db/';
const RETENTION_DAYS = 30;
const NAME = /^nurawell-db-(\d{8}T\d{6}Z)\.dump\.age$/;
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('presign'), name: z.string().regex(NAME) }),
  z.object({ action: z.literal('finalize'), name: z.string().regex(NAME), sha256: z.string().regex(/^[0-9a-f]{64}$/), size: z.number().int().positive() }),
]);

function stampToMs(s: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  return m ? Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!) : NaN;
}

/**
 * Nightly encrypted DB backup sink (Bearer CRON_SECRET). The dump is age-encrypted in CI before
 * it leaves the runner; this route only hands out short-lived upload URLs for backups/db/ in the
 * EU legal bucket, then verifies size + SHA-256 server-side and prunes copies older than 30 days.
 */
export async function POST(request: Request) {
  const denied = await authorizeDbBackupRequest(request);
  if (denied) return denied;
  const bucket = legalBucket();
  if (!bucket) return NextResponse.json({ error: 'no_bucket' }, { status: 500 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const jurisdiction = process.env.R2_LEGAL_JURISDICTION?.trim() || null;
  const b = parsed.data;

  if (b.action === 'presign') {
    const mk = (key: string) => createR2PutPresignedUrl({ bucket, key, expiresSeconds: 900, jurisdiction });
    return NextResponse.json({ url: mk(PREFIX + b.name), sha_url: mk(`${PREFIX}${b.name}.sha256`) }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const { GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  const c = await legalR2Client();
  const obj = await c.send(new GetObjectCommand({ Bucket: bucket, Key: PREFIX + b.name }));
  if (Number(obj.ContentLength) !== b.size) return NextResponse.json({ error: 'size_mismatch' }, { status: 422 });
  const h = createHash('sha256');
  for await (const chunk of obj.Body as AsyncIterable<Uint8Array>) h.update(chunk);
  if (h.digest('hex') !== b.sha256) return NextResponse.json({ error: 'hash_mismatch' }, { status: 422 });

  const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
  const pruned: string[] = [];
  let token: string | undefined;
  do {
    const l = await c.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX, ContinuationToken: token }));
    for (const o of l.Contents ?? []) {
      const m = /nurawell-db-(\d{8}T\d{6}Z)\.dump\.age/.exec(o.Key ?? '');
      if (m && stampToMs(m[1]!) < cutoff && o.Key) {
        await c.send(new DeleteObjectCommand({ Bucket: bucket, Key: o.Key }));
        pruned.push(o.Key.slice(PREFIX.length));
      }
    }
    token = l.IsTruncated ? l.NextContinuationToken : undefined;
  } while (token);
  return NextResponse.json({ ok: true, verified: true, pruned });
}
