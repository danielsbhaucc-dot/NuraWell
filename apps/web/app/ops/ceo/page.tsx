import { revalidatePath } from 'next/cache';
import { allowedChatIds } from '@/lib/ceo/channel';
import { sendMiniAppButton } from '@/lib/ceo/stepup-http';
import { ensureOpsAdminServer, opsActorId } from '@/lib/auth/ensure-ops-admin-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { decideAction } from '@/lib/ceo/actions';
import { CEO_NAME } from '@/lib/ceo/agent';
import { Card } from '@/components/ui';

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
    db.from('ceo_pending_actions').select('id, tool, summary, status, created_at, decided_at, result').neq('status', 'pending').order('created_at', { ascending: false }).limit(50),
  ]);
  return (
    <main className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-black text-primary-900">{CEO_NAME} · מנכ&quot;ל AI</h1>
        <a href="/ops/ceo/settings" className="rounded-xl bg-primary-100/40 px-3 py-1.5 text-sm font-semibold text-primary-900 hover:bg-primary-100/70">הגדרות</a>
        <a href="/ops/ceo/security" className="rounded-xl bg-primary-100/40 px-3 py-1.5 text-sm font-semibold text-primary-900 hover:bg-primary-100/70">🔐 אבטחה</a>
        <a href="/ops/ceo/prefs" className="rounded-xl bg-primary-100/40 px-3 py-1.5 text-sm font-semibold text-primary-900 hover:bg-primary-100/70">🕯️ הוראות ושקט</a>
        <a href="/ops/ceo/insights" className="rounded-xl bg-primary-100/40 px-3 py-1.5 text-sm font-semibold text-primary-900 hover:bg-primary-100/70">משימות ואיכות</a>
        <a href="/ops/ceo/dev-forwards" className="rounded-xl bg-primary-100/40 px-3 py-1.5 text-sm font-semibold text-primary-900 hover:bg-primary-100/70">🛠️ הועבר לאור</a>
      </div>
      <p className="text-sm text-primary-800/80">כל שינוי ש{CEO_NAME} מציע ממתין כאן ובטלגרם לאישור שלך. פג תוקף אחרי 24 שעות.</p>
      <h2 className="text-lg font-bold text-primary-900">ממתין לאישור ({pending?.length ?? 0})</h2>
      {!pending?.length ? <Card>אין פעולות ממתינות</Card> : null}
      {pending?.map((a) => (
        <Card key={a.id} className="flex flex-col gap-2">
          <div className="font-semibold text-primary-900">{a.summary}</div>
          <div className="text-xs text-primary-700">{fmt.format(new Date(a.created_at))} · <span dir="ltr" className="font-mono">{a.tool}</span></div>
          <form action={decide} className="flex gap-2">
            <input type="hidden" name="id" value={a.id} />
            <button name="approve" value="1" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white">אשר</button>
            <button name="approve" value="0" className="rounded-lg border border-primary-200 px-4 py-2 text-sm font-bold text-primary-800">בטל</button>
          </form>
        </Card>
      ))}
      <h2 className="text-lg font-bold text-primary-900">היסטוריה</h2>
      {history?.map((a) => (
        <Card key={a.id} className="flex items-center justify-between gap-2 text-sm">
          <span className="text-primary-900">{a.summary}</span>
          <span className="shrink-0 text-xs text-primary-700">{STATUS[a.status] ?? a.status} · {fmt.format(new Date(a.decided_at ?? a.created_at))}</span>
        </Card>
      ))}
    </main>
  );
}
