import { revalidatePath } from 'next/cache';
import { ensureOpsAdminServer, opsActorId } from '@/lib/auth/ensure-ops-admin-server';
import { decideCapability } from '@/lib/ceo/dev-forward';
import { createAdminClient } from '@/lib/supabase/admin';
import { CEO_NAME } from '@/lib/ceo/agent';
import { Card } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'הועבר לאור' };

const fmt = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const STATUS: Record<string, string> = { proposed: 'ממתין לאישור שלך', new: '🆕 חדש, מחכה לאור', in_progress: '🔧 אור עובד על זה', done: '✅ טופל', rejected: '↩️ נדחה' };

async function decide(formData: FormData) {
  'use server';
  await ensureOpsAdminServer();
  const db = createAdminClient();
  const id = String(formData.get('id'));
  const approve = formData.get('approve') === '1';
  await decideCapability(db, id, approve);
  await db.from('admin_audit_log').insert({ actor_id: await opsActorId(), method: 'ACTION', path: '/ops/ceo/dev-forwards decide', detail: { id, approve } });
  revalidatePath('/ops/ceo/dev-forwards');
}

/** Ops: findings Gideon forwarded to Or (GitHub issues labeled from-gideon). */
export default async function DevForwardsPage() {
  await ensureOpsAdminServer();
  const db = createAdminClient();
  const { data } = await db.from('ceo_dev_forwards').select('id, created_at, source, status, title, issue_number, issue_url, or_notes, handled_at, kind, risk, approval').neq('status', 'draft').order('created_at', { ascending: false }).limit(100);
  const rows = (data ?? []) as { id: string; created_at: string; source: string; status: string; title: string | null; issue_number: number | null; issue_url: string | null; or_notes: string | null; handled_at: string | null; kind: string; risk: string; approval: string }[];
  return (
    <main className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-black text-primary-900">🛠️ הועבר לאור</h1>
        <a href="/ops/ceo" className="rounded-xl bg-primary-100/40 px-3 py-1.5 text-sm font-semibold text-primary-900">חזרה ל{CEO_NAME}</a>
      </div>
      <p className="text-sm text-primary-800/80">
        באגים, ממצאים טכניים ובקשות יכולת ש{CEO_NAME} העביר לאור אוטומטית. בקשות יכולת רגישות מחכות לאישור שלך כאן. אור אוסף אותם מכאן ומעדכן את ההתקדמות. בלי פרטים מזהים של משתמשים.
      </p>
      {!rows.length ? <Card>עוד לא הועבר כלום</Card> : null}
      {rows.map((r) => (
        <Card key={r.id} className="flex flex-col gap-1">
          <div className="font-semibold text-primary-900">{r.kind === 'capability_request' ? '🧩 ' : '🛠️ '}{r.title ?? 'ללא כותרת'}{r.risk === 'sensitive' ? ' · רגיש' : ''}</div>
          {r.approval === 'pending' ? (
            <form action={decide} className="flex gap-2">
              <input type="hidden" name="id" value={r.id} />
              <button name="approve" value="1" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white">אשר לאור לבנות</button>
              <button name="approve" value="0" className="rounded-lg border border-primary-200 px-4 py-2 text-sm font-bold text-primary-800">לא צריך</button>
            </form>
          ) : r.approval === 'approved' ? <div className="text-xs text-emerald-700">אושר על ידך</div> : null}
          <div className="text-xs text-primary-700">
            {fmt.format(new Date(r.created_at))} · {STATUS[r.status] ?? r.status}
            {r.issue_url ? (
              <>
                {' · '}
                <a href={r.issue_url} target="_blank" rel="noreferrer" className="underline" dir="ltr">#{r.issue_number}</a>
              </>
            ) : null}
            {r.handled_at ? ` · טופל ${fmt.format(new Date(r.handled_at))}` : null}
          </div>
          {r.or_notes ? <div className="text-sm text-primary-800">הערות אור: {r.or_notes}</div> : null}
        </Card>
      ))}
    </main>
  );
}
