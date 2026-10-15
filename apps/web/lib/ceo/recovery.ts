import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/** 8 one-time recovery codes (~60 bits each), shown once; stored as salted scrypt. */
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode(): string {
  const b = randomBytes(12);
  const s = Array.from(b, (x) => ALPHA[x % ALPHA.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}
const norm = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');
function derive(code: string, salt: Buffer) {
  return scryptSync(norm(code), salt, 32, { N: 16384, r: 8, p: 1 });
}
export function hashRecovery(code: string): string {
  const salt = randomBytes(16);
  return `s1:${salt.toString('base64url')}:${derive(code, salt).toString('base64url')}`;
}
export function matchRecovery(code: string, stored: string): boolean {
  const [v, salt, h] = stored.split(':');
  if (v !== 's1' || !salt || !h) return false;
  const a = derive(code, Buffer.from(salt, 'base64url'));
  const b = Buffer.from(h, 'base64url');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Replace all codes for the user; returns the plaintext codes (display once, never stored). */
export async function issueRecoveryCodes(db: SupabaseClient, userId: string): Promise<string[]> {
  const codes = Array.from({ length: 8 }, newCode);
  await db.from('admin_recovery_codes').delete().eq('user_id', userId);
  const { error } = await db.from('admin_recovery_codes').insert(codes.map((c) => ({ user_id: userId, code_hash: hashRecovery(c) })));
  if (error) throw new Error(error.message);
  return codes;
}

/** Consume a matching unused code (single use). */
export async function consumeRecoveryCode(db: SupabaseClient, userId: string, code: string): Promise<boolean> {
  if (norm(code).length !== 12) return false;
  const { data } = await db.from('admin_recovery_codes').select('id, code_hash').eq('user_id', userId).is('used_at', null);
  for (const r of (data ?? []) as { id: string; code_hash: string }[]) {
    if (matchRecovery(code, r.code_hash)) {
      const { data: upd } = await db.from('admin_recovery_codes').update({ used_at: new Date().toISOString() }).eq('id', r.id).is('used_at', null).select('id');
      return Boolean(upd?.length);
    }
  }
  return false;
}
