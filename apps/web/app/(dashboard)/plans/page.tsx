import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlan, listOffers } from '@/lib/tasks';
import { OfferCard } from '@/components/plans/OfferCard';
import { toLadderCardTask } from '@/lib/tasks/card';
import { PlanMap, type MapStation } from '@/components/plans/PlanMap';
import { buildMapStations } from '@/lib/journey/map-stations';
import { TaskLadderCard } from '@/components/plans/TaskLadderCard';
import { LevelHistory } from '@/components/plans/LevelHistory';
import { EmptyState } from '@/components/ui/EmptyState';
import { SosButton } from '@/components/ai/SosButton';
import { AlmogPlanSections } from '@/components/plans/AlmogPlanSections';
import { PlanSection } from '@/components/plans/PlanSection';

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
  const [plan, offers, { data: profile }, { data: stations }, { data: steps }, { data: progress }] = await Promise.all([
    getPlan(admin, user.id),
    listOffers(admin, user.id),
    supabase.from('profiles').select('full_name, gender').eq('id', user.id).maybeSingle(),
    supabase.from('journey_stations').select('id, title, sort_order, habit_key, track').order('sort_order'),
    supabase.from('journey_steps').select('id, station_id').eq('is_published', true),
    supabase.from('journey_progress').select('step_id, is_completed').eq('user_id', user.id),
  ]);

  const firstName = ((profile?.full_name ?? '') as string).trim().split(/\s+/)[0] || '';
  const completed = new Set((progress ?? []).filter((p) => p.is_completed).map((p) => p.step_id as string));
  const mapStations: MapStation[] = buildMapStations((stations ?? []) as never, (steps ?? []) as never, completed);

  const active = plan.filter((t) => t.status === 'accepted');
  const history = plan
    .flatMap((t) => t.history.map((h, i) => ({ id: `${t.id}-${i}`, taskTitle: t.level.title, kind: h.kind, fromLevel: h.from_level, toLevel: h.to_level, reason: h.reason, at: h.occurred_at })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 20);

  const g = (profile as { gender?: string | null } | null)?.gender;
  const here = g === 'female' ? 'את כאן' : g === 'male' ? 'אתה כאן' : 'הנקודה שלך';
  const currentIdx = Math.max(0, mapStations.findIndex((s) => s.state === 'current'));
  const doneStations = mapStations.filter((s) => s.state === 'done').length;
  const current = mapStations[currentIdx];
  // Calm default: the stretch around "you are here"; the full route opens on demand (no nested scroll box).
  const windowStart = Math.max(0, currentIdx - 1);
  const nearStations = mapStations.slice(windowStart, windowStart + 4);
  const bestStreak = active.reduce((m, t) => Math.max(m, toLadderCardTask(t).streakDays), 0);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-7 px-4 pb-28 pt-4">
      <header className="rounded-3xl bg-linear-to-br from-brand-700 to-primary-600 p-5 text-white shadow-[0_10px_30px_rgba(11,107,75,0.25)]">
        <p className="text-xs font-bold text-white/70">התוכנית האישית</p>
        <h1 className="mt-1 text-2xl font-black">{firstName ? `התוכנית של ${firstName}` : 'התוכנית שלך'}</h1>
        <p className="mt-1 text-sm text-white/85">אלמוג מתאים את הקצב. קל מדי או קשה מדי? אפשר להגיד לו בכל רגע.</p>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <PlanStat label="תחנה" value={mapStations.length ? `${Math.min(currentIdx + 1, mapStations.length)}/${mapStations.length}` : '–'} />
          <PlanStat label="משימות פעילות" value={String(active.length)} />
          <PlanStat label="רצף הכי ארוך" value={`${bestStreak} ימים`} />
        </dl>
      </header>

      <PlanSection n={1} id="plan-tasks" title="מה עושים עכשיו" hint="המשימות שבחרת, בקצב שמתאים לך">
        {offers.map((o) => (
          <OfferCard key={o.id} definitionId={o.definition_id} title={o.definition.title} emoji={o.definition.emoji} description={o.definition.description} />
        ))}
        {active.length ? (
          active.map((t) => <TaskLadderCard key={t.id} task={toLadderCardTask(t)} />)
        ) : (
          <EmptyState
            title="עוד אין משימות בתוכנית"
            description="כל שיעור במסע מציע משימה. כשבוחרים לקבל אותה, היא מופיעה כאן ואלמוג מלווה אותה."
            action={
              <Link href="/journey" className="font-bold text-primary-700 underline">
                למסע
              </Link>
            }
          />
        )}
        <SosButton firstName={firstName} focusTasks={active.map((t) => ({ id: t.id, title: t.level.title, emoji: t.definition.emoji ?? undefined }))} />
      </PlanSection>

      <AlmogPlanSections />

      {mapStations.length ? (
        <PlanSection
          n={3}
          id="plan-map"
          title="המסלול"
          hint={current ? `${here}: ${current.title} · ${doneStations} תחנות מאחור` : undefined}
        >
          <div className="rounded-3xl border border-primary-100 bg-background-card/80 p-2">
            <PlanMap stations={nearStations} startIndex={windowStart} />
          </div>
          {mapStations.length > nearStations.length ? (
            <details className="group rounded-3xl border border-primary-100 bg-background-card/80">
              <summary className="cursor-pointer list-none p-4 text-sm font-bold text-primary-800">
                <span className="group-open:hidden">לכל המסלול ({mapStations.length} תחנות)</span>
                <span className="hidden group-open:inline">לסגור את המסלול המלא</span>
              </summary>
              <div className="px-2 pb-2">
                <PlanMap stations={mapStations} />
              </div>
            </details>
          ) : null}
        </PlanSection>
      ) : null}

      <div className="flex items-center justify-center gap-4 text-sm font-semibold">
        <Link href="/progress" className="text-primary-700 underline">
          ההתקדמות שלי
        </Link>
        <Link href="/progress/history" className="text-primary-700 underline">
          היסטוריה מלאה
        </Link>
      </div>

      <LevelHistory items={history} />
    </main>
  );
}

function PlanStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/12 px-2 py-2">
      <dt className="text-[10px] font-semibold text-white/70">{label}</dt>
      <dd className="text-sm font-black">{value}</dd>
    </div>
  );
}

