import { ensureOpsAdminServer } from '@/lib/auth/ensure-ops-admin-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CEO_NAME } from '@/lib/ceo/agent';
import { Card } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'הועבר לאור' };

const fmt = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const STATUS: Record<string, string> = { proposed: 'ממתין לאישור שלך', new: '🆕 חדש, מחכה לאור', in_progress: '🔧 אור עובד על זה', done: '✅ טופל', rejected: '↩️ נדחה' };

/** Ops: findings Gideon forwarded to Or (GitHub issues labeled from-gideon). */
export default async function DevForwardsPage() {
  await ensureOpsAdminServer();
  const db = createAdminClient();
  const { data } = await db.from('ceo_dev_forwards').select('id, created_at, source, status, title, issue_number, issue_url, or_notes, handled_at').neq('status', 'draft').order('created_at', { ascending: false }).limit(100);
  const rows = (data ?? []) as { id: string; created_at: string; source: string; status: string; title: string | null; issue_number: number | null; issue_url: string | null; or_notes: string | null; handled_at: string | null }[];
  return (
    <main className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-black text-primary-900">🛠️ הועבר לאור</h1>
        <a href="/ops/ceo" className="rounded-xl bg-primary-100/40 px-3 py-1.5 text-sm font-semibold text-primary-900">חזרה ל{CEO_NAME}</a>
      </div>
      <p className="text-sm text-primary-800/80">
        ממצאים טכניים ש{CEO_NAME} העביר לאור אחרי אישור שלך. אור אוסף אותם מכאן ומעדכן את ההתקדמות. בלי פרטים מזהים של משתמשים.
      </p>
      {!rows.length ? <Card>עוד לא הועבר כלום</Card> : null}
      {rows.map((r) => (
        <Card key={r.id} className="flex flex-col gap-1">
          <div className="font-semibold text-primary-900">{r.title ?? 'ללא כותרת'}</div>
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
