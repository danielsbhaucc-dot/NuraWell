import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkGrantChange, decide, isFounder, type Actor } from '@platform/iam';
import { CATALOG, MODULES } from './catalog';
import { checkToggle, dependentsOf } from '@platform/iam';
import { audit, centralModuleSource, ensureCentralSync, loadModuleStates } from './authorize';
import { setCentralModuleState } from '@platform/module-library-ui/server';
import { createCentralAdminClient } from '@/lib/supabase/admin';

export type GrantInput = { action: 'grant'; targetUserId: string; roleId: string; productId: string; expiresAt: string | null; reason: string }
  | { action: 'revoke'; grantId: string; reason: string };
export type AdminResult = { ok: true; id?: string } | { ok: false; status: number; error: string; reason?: string };
type Alert = (text: string) => Promise<void>;

const HE: Record<string, string> = {
  not_human: 'רק אדם יכול לשנות הרשאות.',
  step_up_required: 'נדרש אימות נוסף.',
  self_change: 'אי אפשר לשנות הרשאות לעצמך.',
  unknown_role: 'תפקיד לא מוכר.',
  platform_role_db_only: 'תפקידי פלטפורמה משתנים רק במיגרציה מאושרת.',
  unknown_product: 'מוצר לא מוכר.',
  expiry_required: 'הרשאה זמנית חייבת תאריך תפוגה.',
  expiry_out_of_range: 'תאריך התפוגה מחוץ לטווח המותר.',
  founder_only: 'רק המייסד יכול להעניק הרשאת בעלים.',
  no_iam_grant: 'אין לך הרשאה לנהל הרשאות במוצר הזה.',
  cannot_grant_wider_than_self: 'אי אפשר להעניק יותר ממה שיש לך.',
};

/**
 * Grant / revoke. App-side checkGrantChange (anti-escalation) then the DB trigger enforces the same rules again;
 * both are audited (DB trigger writes iam_audit_log) and owner-level changes alert the owner.
 */
export async function changeGrant(db: SupabaseClient, actor: Actor, input: GrantInput, o: { steppedUp: boolean; alert: Alert }): Promise<AdminResult> {
  let req;
  let existingId: string | null = null;
  if (input.action === 'revoke') {
    const { data, error } = await db.from('iam_grants').select('id, user_id, role_id, product_id, expires_at, revoked_at').eq('id', input.grantId).maybeSingle();
    const g = data as { id: string; user_id: string; role_id: string; product_id: string; expires_at: string | null; revoked_at: string | null } | null;
    if (error || !g) return { ok: false, status: 404, error: 'ההרשאה לא נמצאה.' };
    if (g.revoked_at) return { ok: false, status: 409, error: 'ההרשאה כבר בוטלה.' };
    existingId = g.id;
    req = { action: 'revoke' as const, targetUserId: g.user_id, roleId: g.role_id, productId: g.product_id, expiresAt: g.expires_at };
  } else {
    req = { action: 'grant' as const, targetUserId: input.targetUserId, roleId: input.roleId, productId: input.productId, expiresAt: input.expiresAt };
  }
  const chk = checkGrantChange(CATALOG, actor, req, { steppedUp: o.steppedUp });
  if (!chk.ok) {
    await audit(db, 'grant_denied', actor.userId, req.productId === '*' ? null : req.productId, req.targetUserId, { reason: chk.reason, role: req.roleId, action: req.action });
    return { ok: false, status: chk.reason === 'step_up_required' ? 403 : 403, error: HE[chk.reason] ?? 'הפעולה נדחתה.', reason: chk.reason };
  }
  let id: string | undefined;
  if (input.action === 'grant') {
    const { data, error } = await db.from('iam_grants').insert({
      user_id: req.targetUserId, role_id: req.roleId, product_id: req.productId, granted_by: actor.userId, expires_at: req.expiresAt, reason: input.reason.slice(0, 300),
    }).select('id').single();
    if (error) return { ok: false, status: 403, error: 'מסד הנתונים דחה את ההענקה.', reason: 'db_refused' };
    id = (data as { id: string }).id;
  } else {
    const { error } = await db.from('iam_grants').update({ revoked_at: new Date().toISOString(), revoked_by: actor.userId }).eq('id', existingId!).is('revoked_at', null);
    if (error) return { ok: false, status: 403, error: 'מסד הנתונים דחה את הביטול.', reason: 'db_refused' };
    id = existingId!;
  }
  const verb = input.action === 'grant' ? 'הוענקה' : 'בוטלה';
  await o.alert(`🛡️ הרשאה ${verb}: תפקיד ${req.roleId} במוצר ${req.productId} למשתמש ${req.targetUserId.slice(0, 8)}…${chk.ownerLevel ? ' (רמת בעלים)' : ''}.`).catch(() => undefined);
  return { ok: true, id };
}

/** Module toggle: needs modules.manage (step-up) on that product; core modules can't be disabled; DB trigger re-checks + audits. */
export async function toggleModule(db: SupabaseClient, actor: Actor, productId: string, moduleId: string, enabled: boolean, o: { steppedUp: boolean; alert: Alert }): Promise<AdminResult> {
  const d = decide(CATALOG, actor, productId, 'modules.manage', { steppedUp: o.steppedUp });
  if (!d.allow) {
    await audit(db, 'module_denied', actor.userId, productId, moduleId, { reason: d.reason, enabled });
    return { ok: false, status: 403, error: d.reason === 'step_up_required' ? 'נדרש אימות נוסף.' : 'אין לך הרשאה לנהל מודולים במוצר הזה.', reason: d.reason };
  }
  const m = MODULES.find((x) => x.id === moduleId);
  if (!m) return { ok: false, status: 404, error: 'מודול לא מוכר.' };
  if (m.core && !enabled) return { ok: false, status: 409, error: 'מודול אבטחה ליבה לא ניתן לכיבוי.', reason: 'core_module' };
  // WordPress-style dependency rule: can't turn a module off while an enabled module needs it.
  // (Enabling with a dependency off is refused by central itself: 'dependency_disabled'.) Only looked up when someone depends on it.
  if (!enabled && dependentsOf(MODULES, moduleId).length > 0) {
    const chk = checkToggle(MODULES, await loadModuleStates(db, productId, { fresh: true }), productId, moduleId, false);
    if (!chk.ok && chk.reason === 'has_dependents') return { ok: false, status: 409, error: `קודם צריך לכבות את הרכיבים שתלויים בו: ${chk.modules.join(', ')}.`, reason: 'has_dependents' };
  }
  const src = centralModuleSource(productId);
  if (src) {
    // Central is the single source of truth: write there only (audited centrally). If central is down, nothing is written.
    await ensureCentralSync(db, productId, actor.userId);
    const r = await setCentralModuleState(createCentralAdminClient(), { actorId: actor.userId, productId, moduleId, enabled });
    if (!r.ok) {
      await audit(db, 'module_central_refused', actor.userId, productId, moduleId, { reason: r.reason, enabled });
      return r.reason === 'dependency_disabled'
        ? { ok: false, status: 409, error: 'מודול שהוא תלוי בו כבוי. צריך להפעיל אותו קודם.', reason: 'db_refused' }
        : { ok: false, status: 503, error: 'השרת המרכזי לא זמין כרגע, השינוי לא נשמר. נסו שוב בעוד כמה דקות.', reason: 'central_unavailable' };
    }
    src.invalidate();
    await audit(db, 'module_central', actor.userId, productId, moduleId, { enabled });
  } else {
    const { error } = await db.from('iam_product_modules').upsert({ product_id: productId, module_id: moduleId, enabled, updated_by: actor.userId });
    if (error) return { ok: false, status: 409, error: 'מסד הנתונים דחה את השינוי (ייתכן שתלות כבויה).', reason: 'db_refused' };
  }
  await o.alert(`🧩 מודול ${moduleId} ${enabled ? 'הופעל' : 'כובה'} במוצר ${productId}.`).catch(() => undefined);
  return { ok: true };
}

export { isFounder };
