import { ensureOpsAdminServer } from '@/lib/auth/ensure-ops-admin-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildBusinessMetrics } from '@/lib/admin/business-metrics';
import { Card } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'מדדים עסקיים' };

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-primary-700">{label}</span>
      <span className="text-2xl font-black text-primary-900">{value}</span>
      {hint ? <span className="text-xs text-primary-800/70">{hint}</span> : null}
    </Card>
  );
}

/** Admin business dashboard — real users only (admin + test accounts excluded). */
export default async function OpsBusinessPage() {
  await ensureOpsAdminServer();
  const m = await buildBusinessMetrics(createAdminClient());
  return (
    <main className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-black text-primary-900">מדדים עסקיים</h1>
      <p className="text-sm text-primary-800/80">משתמשים אמיתיים בלבד (ללא מנהלים וחשבונות בדיקה) · חלון {m.windowDays} ימים</p>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="משתמשים" value={m.realUsers} hint={`${m.newUsers} חדשים · ${m.onboarded} השלימו קליטה`} />
        <Stat label="פעילים 7 ימים" value={m.active7d} hint={`${m.active30d} פעילים ב-30 ימים`} />
        <Stat label="MRR" value={`₪${m.mrrIls}`} hint={`ARR ₪${m.arrIls}`} />
        <Stat label="מנויים" value={m.subscribersByTier.premium + m.subscribersByTier.pro} hint={`פרימיום ${m.subscribersByTier.premium} · פרו ${m.subscribersByTier.pro} · חינם ${m.subscribersByTier.free}`} />
        <Stat label="בניסיון" value={m.trialing} hint={`${m.trialConversions} המירו לתשלום`} />
        <Stat label="נטישה (30 יום)" value={`${m.churnRatePct}%`} hint={`${m.churned30d} ביטולים`} />
        <Stat label="עלות AI למשתמש" value={`$${m.aiCostUsdPerUser}`} hint={`$${m.aiCostUsdPerActiveUser} למשתמש פעיל · סה״כ $${m.aiCostUsdTotal}`} />
        <Stat label="מעורבות" value={m.engagementStatus.active ?? 0} hint={Object.entries(m.engagementStatus).map(([k, v]) => `${k}: ${v}`).join(' · ')} />
      </section>
    </main>
  );
}
