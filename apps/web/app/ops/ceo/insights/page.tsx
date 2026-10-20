import { revalidatePath } from 'next/cache';
import { ensureOpsAdminServer, opsActorId } from '@/lib/auth/ensure-ops-admin-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TOOL_BY_NAME } from '@/lib/ceo/tools';
import { setOwnerTask } from '@/lib/ceo/owner-tasks';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'גדעון · משימות ובקרת איכות' };

type Task = { id: string; title: string; detail?: string; priority?: string; due_date?: string | null };
type Sample = { chat: { userGender: string | null; text: string; at: string }[]; notifications: { userGender: string | null; title: string; body: string; at: string }[] };

async function taskAction(formData: FormData) {
  'use server';
  await ensureOpsAdminServer();
  const db = createAdminClient();
  const id = String(formData.get('id'));
  const kind = String(formData.get('kind'));
  await setOwnerTask(db, id, kind === 'done' ? { status: 'done' } : { snoozeDays: kind === 'week' ? 7 : 1 });
  await db.from('admin_audit_log').insert({ actor_id: await opsActorId(), method: 'ACTION', path: `/ops/ceo/insights task:${kind}`, detail: { id } });
  revalidatePath('/ops/ceo/insights');
}

/** Ops parity with Gideon's read tools: Daniel's open tasks + Almog quality sample. */
export default async function Page() {
  await ensureOpsAdminServer();
  const db = createAdminClient();
  const tasksTool = TOOL_BY_NAME.get('owner_tasks_list');
  const sampleTool = TOOL_BY_NAME.get('almog_quality_sample');
  const tasks = ((await tasksTool?.run(db, {})) ?? []) as Task[];
  const sample = ((await sampleTool?.run(db, { days: 1, limit: 12 })) ?? { chat: [], notifications: [] }) as Sample;
  return (
    <div dir="rtl" className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-2xl font-bold">גדעון · משימות ובקרת איכות</h1>
      <section className="rounded-3xl border bg-gc p-5">
        <h2 className="text-lg font-bold">משימות פתוחות שלי</h2>
        {tasks.length ? (
          <ul className="mt-3 space-y-2">
            {tasks.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                <span>{t.priority === 'high' ? '🔴 ' : ''}{t.title}{t.due_date ? ` · עד ${t.due_date}` : ''}</span>
                <form action={taskAction} className="flex gap-1">
                  <input type="hidden" name="id" value={t.id} />
                  <button name="kind" value="done" className="rounded-lg bg-emerald-700 px-2 py-1 text-xs text-gc">✅ בוצע</button>
                  <button name="kind" value="day" className="rounded-lg border px-2 py-1 text-xs">מחר</button>
                  <button name="kind" value="week" className="rounded-lg border px-2 py-1 text-xs">שבוע</button>
                </form>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-sm text-slate-500">אין משימות פתוחות.</p>}
      </section>
      <section className="rounded-3xl border bg-gc p-5">
        <h2 className="text-lg font-bold">דגימת הודעות של אלמוג (24 שעות)</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {sample.chat.map((c) => <li key={`c${c.at}${c.text.slice(0, 24)}`} className="rounded-xl bg-slate-50 px-3 py-2">💬 {c.text}</li>)}
          {sample.notifications.map((n) => <li key={`n${n.at}${n.title}`} className="rounded-xl bg-slate-50 px-3 py-2">🔔 <b>{n.title}</b> {n.body}</li>)}
          {!sample.chat.length && !sample.notifications.length ? <li className="text-slate-500">אין הודעות ב-24 השעות האחרונות.</li> : null}
        </ul>
      </section>
    </div>
  );
}
