import { revalidatePath } from 'next/cache';
import { allowedChatIds } from '@/lib/ceo/channel';
import { sendMiniAppButton } from '@/lib/ceo/stepup-http';
import { ensureOpsAdminServer, opsActorId } from '@/lib/auth/ensure-ops-admin-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { decideAction } from '@/lib/ceo/actions';
import { CEO_NAME } from '@/lib/ceo/agent';
import { Bot, ListChecks, Moon, Settings, ShieldCheck, Wrench } from 'lucide-react';
import { OpsPageHeader } from '@/components/admin/OpsPageHeader';
import { OpsGroup, OpsRow } from '@/components/admin/ios/OpsGroup';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'מנכ"ל AI' };

const fmt = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const STATUS: Record<string, string> = { pending: 'ממתין', approved: 'אושר', rejected: 'בוטל', expired: 'פג תוקף', failed: 'נכשל', done: 'בוצע' };

async function decide(formData: FormData) {
  'use server';
  await ensureOpsAdminServer();
  const db = createAdminClient();
  const r = await decideAction(db, String(formData.get('id')), formData.get('approve') === '1', 'admin:panel');
  await db.from('admin_audit_log').insert({ actor_id: await opsActorId(), method: 'ACTION', path: '/ops/ceo decide', detail: { id: String(formData.get('id')), approve: formData.get('approve') === '1' } });
  if (r.stepupUrl) {
    // Face ID happens only inside Telegram: send the one-time Mini App button there.
    const chat = [...allowedChatIds()][0];
    if (chat) await sendMiniAppButton(chat, `🔐 ${r.text || 'פעולה רגישה'}\nאשר עם Face ID:`, r.stepupUrl);
  }
  revalidatePath('/ops/ceo');
}

/** Admin: AI CEO pending approvals + history (same approval path as Telegram). */
export default async function OpsCeoPage() {
  await ensureOpsAdminServer();
  const db = createAdminClient();
  const now = new Date().toISOString();
  const [{ data: pending }, { data: history }] = await Promise.all([
    db.from('ceo_pending_actions').select('id, tool, summary, created_at, expires_at').eq('status', 'pending').gt('expires_at', now).order('created_at', { ascending: false }).limit(50),
    db.from('ceo_pending_actions').select('id, tool, summary, status, created_at, decided_at').neq('status', 'pending').order('created_at', { ascending: false }).limit(50),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <OpsPageHeader icon={Bot} tone="violet" eyebrow="מנכ״ל AI" title={CEO_NAME} description={`כל שינוי ש${CEO_NAME} מציע ממתין כאן ובטלגרם לאישור שלך. פג תוקף אחרי 24 שעות.`} />

      <OpsGroup>
        <OpsRow href="/ops/ceo/settings" icon={Settings} tone="slate" title="הגדרות" />
        <OpsRow href="/ops/ceo/security" icon={ShieldCheck} tone="emerald" title="אבטחה" desc="Face ID, נעילה ושחרור" />
        <OpsRow href="/ops/ceo/prefs" icon={Moon} tone="amber" title="הוראות ושקט" desc="בקשות קבועות ושבת" />
        <OpsRow href="/ops/ceo/insights" icon={ListChecks} tone="sky" title="משימות ואיכות" />
        <OpsRow href="/ops/ceo/dev-forwards" icon={Wrench} tone="rose" title="הועבר לאורי" />
      </OpsGroup>

      <OpsGroup title={`ממתין לאישור (${pending?.length ?? 0})`}>
        {!pending?.length ? <p className="px-4 py-3.5 text-[15px] text-slate-500">אין פעולות ממתינות</p> : null}
        {pending?.map((a) => (
          <div key={a.id} className="flex flex-col gap-2 px-4 py-3">
            <p className="line-clamp-3 break-words text-[15px] font-semibold text-slate-900">{a.summary}</p>
            <p className="text-xs text-slate-500">{fmt.format(new Date(a.created_at))} · <span dir="ltr" className="font-mono">{a.tool}</span></p>
            <form action={decide} className="flex gap-2">
              <input type="hidden" name="id" value={a.id} />
              <button name="approve" value="1" className="min-h-10 rounded-full bg-emerald-600 px-5 text-sm font-bold text-gc">אשר</button>
              <button name="approve" value="0" className="min-h-10 rounded-full bg-slate-100 px-5 text-sm font-bold text-slate-700">בטל</button>
            </form>
          </div>
        ))}
      </OpsGroup>

      <OpsGroup title="היסטוריה">
        {!history?.length ? <p className="px-4 py-3.5 text-[15px] text-slate-500">עוד אין היסטוריה</p> : null}
        {history?.map((a) => (
          <div key={a.id} className="flex min-w-0 items-start justify-between gap-3 px-4 py-3 text-sm">
            <span className="line-clamp-2 min-w-0 break-words text-slate-900 [overflow-wrap:anywhere]">{a.summary}</span>
            <span className="shrink-0 text-xs text-slate-500">{STATUS[a.status] ?? a.status} · {fmt.format(new Date(a.decided_at ?? a.created_at))}</span>
          </div>
        ))}
      </OpsGroup>
    </div>
  );
}
