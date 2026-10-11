import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlan } from '@/lib/tasks';
import { resolveLadder } from '@/lib/tasks/ladder';
import { PlanMap, type MapStation } from '@/components/plans/PlanMap';
import { TaskLadderCard } from '@/components/plans/TaskLadderCard';
import { LevelHistory } from '@/components/plans/LevelHistory';
import { EmptyState } from '@/components/ui/EmptyState';
import { SosButton } from '@/components/ai/SosButton';

export const metadata = { title: 'התוכנית שלי' };
export const dynamic = 'force-dynamic';

/** "התוכנית שלך" — journey map + main tasks on their ladder + history. Server-rendered first load. */
export default async function PlansPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const [plan, { data: profile }, { data: stations }, { data: steps }, { data: progress }] = await Promise.all([
    getPlan(admin, user.id),
    supabase.from('profiles').select('full_name, gender').eq('id', user.id).maybeSingle(),
    supabase.from('journey_stations').select('id, title, sort_order').order('sort_order'),
    supabase.from('journey_steps').select('id, station_id').eq('is_published', true),
    supabase.from('journey_progress').select('step_id, is_completed').eq('user_id', user.id),
  ]);

  const firstName = ((profile?.full_name ?? '') as string).trim().split(/\s+/)[0] || '';
  const completed = new Set((progress ?? []).filter((p) => p.is_completed).map((p) => p.step_id as string));
  let currentFound = false;
  const mapStations: MapStation[] = (stations ?? []).map((s) => {
    const own = (steps ?? []).filter((st) => st.station_id === s.id);
    const done = own.filter((st) => completed.has(st.id as string)).length;
    const isDone = own.length > 0 && done === own.length;
    let state: MapStation['state'] = 'locked';
    if (isDone) state = 'done';
    else if (!currentFound) {
      state = 'current';
      currentFound = true;
    }
    return { id: s.id as string, title: s.title as string, total: own.length, done, state };
  });

  const active = plan.filter((t) => t.status === 'accepted');
  const history = plan
    .flatMap((t) => t.history.map((h, i) => ({ id: `${t.id}-${i}`, taskTitle: t.level.title, kind: h.kind, fromLevel: h.from_level, toLevel: h.to_level, reason: h.reason, at: h.occurred_at })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 20);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 pb-28 pt-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-primary-900">{firstName ? `התוכנית של ${firstName}` : 'התוכנית שלך'}</h1>
        <p className="text-sm text-primary-800/80">אלמוג מתאים את המשימות בשבילך — קל מדי או קשה מדי? אפשר להגיד לו בכל רגע.</p>
      </header>

      <section aria-labelledby="plan-tasks" className="flex flex-col gap-3">
        <h2 id="plan-tasks" className="text-lg font-bold text-primary-900">
          המשימות שלך עכשיו
        </h2>
        {active.length ? (
          active.map((t) => (
            <TaskLadderCard
              key={t.id}
              task={{
                id: t.id,
                title: t.level.title,
                emoji: t.definition.emoji,
                isMain: t.is_main,
                currentLevel: t.current_level,
                levels: resolveLadder(t.definition).filter((l) => l.level >= t.definition.floor_level && l.level <= t.definition.max_level),
                floorLevel: t.definition.floor_level,
                doneToday: t.doneToday,
                targetToday: t.targetToday,
                streakDays: t.streakDays,
                canStepDown: t.canStepDown,
                canStepUp: t.canStepUp,
              }}
            />
          ))
        ) : (
          <EmptyState
            title="עוד אין משימות בתוכנית"
            description="כל שיעור במסע מציע משימה — כשבוחרים לקבל אותה, היא מופיעה כאן ואלמוג מלווה אותה."
            action={
              <Link href="/journey" className="font-bold text-primary-700 underline">
                למסע
              </Link>
            }
          />
        )}
        <div className="flex flex-wrap items-center gap-3">
          <SosButton firstName={firstName} focusTasks={active.map((t) => ({ id: t.id, title: t.level.title, emoji: t.definition.emoji ?? undefined }))} />
          <Link href="/progress" className="text-sm font-semibold text-primary-700 underline">
            ההתקדמות שלי
          </Link>
          <Link href="/progress/history" className="text-sm font-semibold text-primary-700 underline">
            היסטוריה
          </Link>
          <Link href="/plans/details" className="text-sm font-semibold text-primary-700 underline">
            כל הפרטים
          </Link>
        </div>
      </section>

      <section aria-labelledby="plan-map" className="flex flex-col gap-2">
        <h2 id="plan-map" className="text-lg font-bold text-primary-900">
          מפת המסע
        </h2>
        <PlanMap stations={mapStations} />
      </section>

      <LevelHistory items={history} />
    </main>
  );
}
