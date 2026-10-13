import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api/json-request';
import { requireApiSession } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { VAULT_KINDS, encryptVault, newVaultRef, vaultChatNotice } from '@/lib/secure-vault/crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ kind: z.enum(VAULT_KINDS), value: z.string().trim().min(2).max(500) });
const noStore = { 'cache-control': 'no-store' };

/** Stores an encrypted value; responds with a reference + type-only chat notice. The value is never logged or returned. */
export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const p = schema.safeParse(raw.value);
  if (!p.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400, headers: noStore });
  const userId = auth.user.id;
  let enc;
  try {
    enc = encryptVault(p.data.value, userId);
  } catch {
    console.error('[secure-vault] encryption unavailable');
    return NextResponse.json({ error: 'vault_unavailable' }, { status: 503, headers: noStore });
  }
  const digits = p.data.value.replace(/\D/g, '');
  const last4 = ['card', 'bank'].includes(p.data.kind) && digits.length >= 8 ? digits.slice(-4) : null;
  const ref = newVaultRef();
  const { error } = await createAdminClient()
    .from('secure_vault_items')
    .insert({ user_id: userId, ref, kind: p.data.kind, ...enc, last4 });
  if (error) {
    console.error('[secure-vault] insert failed', { code: error.code });
    return NextResponse.json({ error: 'save_failed' }, { status: 500, headers: noStore });
  }
  return NextResponse.json({ ref, kind: p.data.kind, notice: vaultChatNotice(p.data.kind) }, { headers: noStore });
}
