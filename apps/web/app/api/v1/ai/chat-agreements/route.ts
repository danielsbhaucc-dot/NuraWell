import { limitIp } from '@/lib/ceo/stepup-http';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api/json-request';
import { requireApiSession } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlan, israelDateKey } from '@/lib/tasks';
import { persistCommitmentExtraction, titlesAreSimilar } from '@/lib/ai/almog-commitments/persist';
import { resolveTaskProposal } from '@/lib/ai/chat-ui/task-proposals';

export const runtime = 'nodejs';

const schema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('habit'),
    title: z.string().trim().min(4).max(120),
    replaces: z.string().trim().max(160).nullable().optional(),
    sessionId: z.string().uuid().optional(),
    proposalId: z.string().uuid().optional(),
  }),
  z.object({ kind: z.literal('goal'), text: z.string().trim().min(4).max(160) }),
]);

/**
 * The user CONFIRMED (button in chat) something agreed with Almog → write it to the single sources:
 *  • habit / replacement habit → almog_assignments via the deduped commitments writer (DB trigger mirrors to the plan),
 *    skipped when the plan already has a near-identical task (same 0.72 rule as #115 / 000108).
 *  • goal → profiles.main_goal (shown at the top of "התוכנית שלך").
 * Level changes reuse /api/v1/tasks/level (ladder rules + task_events).
 */
export async function POST(request: Request) {
  const limited = await limitIp(request, 'ai-chat-agreements', 60);
  if (limited) return limited;
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const p = schema.safeParse(raw.value);
  if (!p.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const admin = createAdminClient();
  const userId = auth.user.id;

  if (p.data.kind === 'goal') {
    const { error } = await admin.from('profiles').update({ main_goal: p.data.text }).eq('id', userId);
    if (error) return NextResponse.json({ ok: false, error: 'update_failed' }, { status: 500 });
    return NextResponse.json({ ok: true, kind: 'goal' });
  }

  const { title, replaces, proposalId } = p.data;
  if (proposalId) await resolveTaskProposal(admin, userId, proposalId, 'confirmed').catch(() => undefined);
  const plan = await getPlan(admin, userId).catch(() => []);
  const existing = plan.find((t) => t.status === 'accepted' && titlesAreSimilar(title, t.level.title, 0.72));
  if (existing) return NextResponse.json({ ok: true, kind: 'habit', duplicate: true, existingTitle: existing.level.title });

  const res = await persistCommitmentExtraction({
    admin,
    userId,
    sessionId: p.data.sessionId ?? null,
    extraction: {
      reminders: [],
      tasks: [
        {
          title,
          reason: replaces ? `הרגל חלופי ל"${replaces}" — סוכם בצ׳אט עם אלמוג` : 'סוכם בצ׳אט עם אלמוג',
          detail: null,
          schedule: 'daily',
          due_at_iso: null,
          related_habit: null,
          confidence: 1,
        },
      ],
      focus: null,
      blockers: [],
      followups: [],
      blocker_updates: [],
    },
    sourceExcerpt: 'chat_card_confirm',
  });
  if (res.write_errors) return NextResponse.json({ ok: false, error: 'write_failed' }, { status: 500 });
  if (res.assignments_created === 0) return NextResponse.json({ ok: true, kind: 'habit', duplicate: true });
  const mirrored = await mirrorNewestChatHabitToPlan(admin, userId).catch(() => false);
  return NextResponse.json({ ok: true, kind: 'habit', duplicate: false, inPlan: mirrored });
}

/**
 * almog_assignments has no INSERT→plan trigger (000092 only back-filled), so mirror the confirmed habit into
 * task_definitions('almog:<id>') + user_task_assignments (accepted) + an 'accepted' task_event. Idempotent.
 */
async function mirrorNewestChatHabitToPlan(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<boolean> {
  const { data: a } = await admin
    .from('almog_assignments')
    .select('id, title, detail, schedule, related_step_id, given_at')
    .eq('user_id', userId)
    .eq('source_excerpt', 'chat_card_confirm')
    .order('given_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!a) return false;
  const key = `almog:${a.id}`;
  const { data: def } = await admin
    .from('task_definitions')
    .upsert(
      { stable_key: key, source: 'almog', source_ref: a.id, step_id: a.related_step_id ?? null, habit_key: key, title: a.title, description: a.detail ?? null, schedule: a.schedule ?? null, created_by: 'almog', updated_at: new Date().toISOString() },
      { onConflict: 'stable_key' }
    )
    .select('id')
    .single();
  if (!def?.id) return false;
  const nowIso = new Date().toISOString();
  const { data: existing } = await admin.from('user_task_assignments').select('id').eq('user_id', userId).eq('definition_id', def.id).maybeSingle();
  if (existing) return true;
  const { data: asg } = await admin
    .from('user_task_assignments')
    .insert({ user_id: userId, definition_id: def.id, status: 'accepted', is_main: false, accepted_at: nowIso, offered_at: nowIso, legacy_ref: a.id })
    .select('id')
    .single();
  if (!asg?.id) return false;
  await admin.from('task_events').insert({ user_id: userId, assignment_id: asg.id, definition_id: def.id, kind: 'accepted', date_key: israelDateKey(), source: 'chat' });
  return true;
}
