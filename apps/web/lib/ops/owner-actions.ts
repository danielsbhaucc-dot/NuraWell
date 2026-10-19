/**
 * Owner-initiated security actions (Gideon tools). Each step audited; result reports `verified`
 * only after re-reading the DB. Never touches the account itself or any user data.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { audit, revokeDevice } from './device-trust';

export async function ownerAdminId(db: SupabaseClient): Promise<string> {
  const { data } = await db.from('profiles').select('id').eq('role', 'admin').limit(2);
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length !== 1) throw new Error('expected exactly one super admin');
  return ids[0];
}

async function activeSessions(db: SupabaseClient, uid: string): Promise<number | null> {
  const { data, error } = await db.rpc('ops_count_user_sessions', { p_user: uid });
  return error ? null : Number(data ?? 0);
}

export async function signOutEverywhere(db: SupabaseClient) {
  const uid = await ownerAdminId(db);
  await audit(db, uid, 'owner_signout_requested', { via: 'gideon' });
  const { data: n, error } = await db.rpc('ops_revoke_user_sessions', { p_user: uid });
  if (error) { await audit(db, uid, 'owner_signout_failed', { error: error.message.slice(0, 120) }); throw new Error('revoke failed'); }
  const left = await activeSessions(db, uid);
  const verified = left === 0;
  await audit(db, uid, verified ? 'ops_sessions_revoked' : 'owner_signout_unverified', { count: Number(n ?? 0), via: 'gideon' });
  return { verified, sessionsRevoked: Number(n ?? 0), sessionsLeft: left };
}

export async function forgetDevice(db: SupabaseClient, deviceId: string) {
  const uid = await ownerAdminId(db);
  await audit(db, uid, 'owner_forget_device_requested', { via: 'gideon' });
  const ok = await revokeDevice(db, uid, deviceId, 'gideon');
  const { data } = await db.from('ops_trusted_devices').select('id').eq('id', deviceId).is('revoked_at', null);
  const verified = ok && !(data ?? []).length;
  if (!verified) await audit(db, uid, 'owner_forget_device_failed', { reason: ok ? 'still_active' : 'not_found' });
  return { verified, note: ok ? undefined : 'המכשיר לא נמצא או כבר הוסר' };
}

export async function forgetAllDevices(db: SupabaseClient) {
  const uid = await ownerAdminId(db);
  await audit(db, uid, 'owner_forget_all_requested', { via: 'gideon' });
  const now = new Date().toISOString();
  const { data: rev } = await db.from('ops_trusted_devices').update({ revoked_at: now }).eq('user_id', uid).is('revoked_at', null).select('id');
  const out = await signOutEverywhere(db);
  const { data: left } = await db.from('ops_trusted_devices').select('id').eq('user_id', uid).is('revoked_at', null);
  const verified = !(left ?? []).length && out.verified;
  await audit(db, uid, verified ? 'ops_devices_all_revoked' : 'owner_forget_all_unverified', { devices: (rev ?? []).length, via: 'gideon' });
  return { verified, devicesForgotten: (rev ?? []).length, sessionsRevoked: out.sessionsRevoked };
}
