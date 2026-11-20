import 'server-only';
import { licenseReasonFor, profileRole, purchaseUrl } from './license-gate';
import { buildSubscriptionView, LIC_ID, type SubscriptionView } from './my-subscription';

/** Server read of the member's parent-licensed subscription. Never throws. */
export async function loadMySubscription(user: { id: string; app_metadata?: Record<string, unknown> | null }, env: Record<string, string | undefined> = process.env): Promise<SubscriptionView> {
  const raw = user.app_metadata?.pl_lic;
  const lic = typeof raw === 'string' && LIC_ID.test(raw) ? raw : null;
  const [role, reason] = await Promise.all([
    profileRole(user.id),
    lic ? licenseReasonFor(lic, env) : Promise.resolve<string | null>(null),
  ]);
  return buildSubscriptionView({ reason, hasLicense: !!lic, isStaff: role === 'admin', purchaseUrl: purchaseUrl(env) });
}
