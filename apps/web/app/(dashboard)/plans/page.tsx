import { decProfileResult } from '@/lib/crypto/pii-fields';
import { summarizeJourneyProgress } from '@/lib/module-api/journey/lib-journey-journey-progress-summary';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlan, listOffers } from '@/lib/module-api/journey/lib-tasks';
import { OfferCard } from '@/components/plans/OfferCard';
import { PlanMap, type MapStation } from '@/components/plans/PlanMap';
import { buildMapStations } from '@/lib/module-api/journey/lib-journey-map-stations';
import { EmptyState } from '@/components/ui/EmptyState';
import { SosButton } from '@/lib/module-api/agent/components-ai-SosButton';
import { AlmogPlanSections, SectionHead } from '@/components/plans/AlmogPlanSections';
import { PlanAccordion } from '@/components/plans/PlanAccordion';
import { PlanProgressRing } from '@/components/plans/PlanProgressRing';
import { PlanTaskFocus } from '@/components/plans/PlanTaskFocus';
import { PlanHabitCard } from '@/components/plans/PlanHabitCard';
import { AlmogAvatarChip } from '@/lib/module-api/journey/components-journey-AlmogPresence';
import { almogChangeNote, almogPlanSummary, buildPlanHabit, formatPlanDate, planGoalLine, type Gender } from '@/lib/plans/plan-document';
import { mainObstacleLabelHe } from '@/lib/module-api/reminders/lib-churn-reengagement-prompt-blocks';
import { PatternInsightsCard } from '@/lib/module-api/agent/components-insights-PatternInsightsCard';

export const metadata = { title: 'התוכנית שלי' };
export const dynamic = 'force-dynamic';

/**
 * "התוכנית שלך" — a written personal plan Almog keeps up to date. First view: hero (goal + why, progress ring,
 * current phase, one "today" focus), then the habits. Dense parts (route, reminders, change log, fallbacks) live
 * in collapsed accordions. Fully server-rendered from real data; no AI call on render. ?task=<id> highlights a task.
 */
export default async function PlansPage({ searchParams }: { searchParams: Promise<{ task?: string | string[] }> }) {
  const sp = await searchParams;
  const focusTaskId = typeof sp.task === 'string' && /^[\w-]{1,64}$/.test(sp.task) ? sp.task : null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const [plan, offers, { data: profile }, { data: stations }, { data: steps }, { data: progress }] = await Promise.all([
    getPlan(admin, user.id),
    listOffers(admin, user.id),
    supabase.from('profiles').select('full_name, gender, main_goal, main_obstacle, main_obstacle_detail').eq('id', user.id).maybeSingle().then(decProfileResult(user.id)),
    supabase.from('journey_stations').select('id, title, sort_order, habit_key, track, description').order('sort_order'),
    supabase.from('journey_steps').select('id, station_id').eq('is_published', true),
    supabase.from('journey_progress').select('step_id, is_completed').eq('user_id', user.id),
  ]);

  const prof = (profile ?? {}) as { full_name?: string | null; gender?: string | null; main_goal?: string | null; main_obstacle?: string | null; main_obstacle_detail?: string | null };
  const firstName = (prof.full_name ?? '').trim().split(/\s+/)[0] || '';
  const gender: Gender = prof.gender === 'female' ? 'female' : prof.gender === 'male' ? 'male' : 'other';
  const completed = new Set((progress ?? []).filter((p) => p.is_completed).map((p) => p.step_id as string));
  const mapStations: MapStation[] = buildMapStations((stations ?? []) as never, (steps ?? []) as never, completed);
  const stationDesc = new Map(((stations ?? []) as { id: string; description?: string | null }[]).map((st) => [st.id, (st.description ?? '').trim()]));

  const active = plan.filter((t) => t.status === 'accepted');
  const habits = active.map((t) => buildPlanHabit(t, gender));
  const summary = almogPlanSummary(habits, gender, firstName);
  const obstacle = mainObstacleLabelHe(prof.main_obstacle, prof.main_obstacle_detail);
  const log = plan
    .flatMap((t) => t.history.filter((h) => h.kind === 'level_change').map((h) => ({ id: `${t.id}-${h.occurred_at}`, habit: t.definition.title, note: almogChangeNote(h, gender) })))
    .sort((a, b) => b.note.at.localeCompare(a.note.at))
    .slice(0, 12);

  const currentIdx = Math.max(0, mapStations.findIndex((st) => st.state === 'current'));
  const curStation = mapStations[currentIdx] ?? null;
  const journeySummary = summarizeJourneyProgress(
    ((steps ?? []) as { id: string }[]).map((st) => st.id),
    (progress ?? []) as { step_id: string; is_completed: boolean | null }[]
  );
  const pct = journeySummary.pct;
  const principles = mapStations
    .slice(0, currentIdx + 1)
    .map((st) => ({ title: st.title, text: stationDesc.get(st.id) ?? '' }))
    .filter((p) => p.text)
    .slice(-3);

  const focusIdx = (() => {
    const pending = habits.findIndex((h) => h.doneToday < h.targetToday);
    const main = habits.findIndex((h) => h.isMain && h.doneToday < h.targetToday);
    return main >= 0 ? main : pending;
  })();
  const today = focusIdx >= 0 ? habits[focusIdx]! : null;
  const allDone = habits.length > 0 && !today;
  const you = (f: string, m: string, n: string) => (gender === 'female' ? f : gender === 'male' ? m : n);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 bg-cream px-4 pb-28 pt-4">
      <PlanTaskFocus taskId={focusTaskId} />

      <header className="relative overflow-hidden rounded-[30px] bg-linear-to-br from-[#022c22] via-[#04503a] to-brand-700 p-5 text-cream shadow-[0_18px_44px_rgba(2,44,34,0.32)]">
        <span aria-hidden className="pointer-events-none absolute -top-20 -left-16 size-56 rounded-full bg-primary-300/20 blur-3xl" />
        <span aria-hidden className="pointer-events-none absolute -bottom-24 -right-10 size-56 rounded-full bg-primary-500/15 blur-3xl" />
        <p className="relative text-[11px] font-bold tracking-[0.12em] text-primary-100/75">תוכנית אישית · אלמוג כותב ומעדכן</p>
        <div className="relative mt-2 flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-[27px] font-black leading-[1.15]">{firstName ? `התוכנית של ${firstName}` : 'התוכנית שלך'}</h1>
            <p className="mt-2 text-[14px] font-semibold leading-snug text-cream/95">{planGoalLine(prof.main_goal)}</p>
            {obstacle ? <p className="mt-1.5 text-[13px] leading-snug text-primary-100/80">למה ככה: התוכנית בנויה סביב {obstacle}</p> : null}
          </div>
          <PlanProgressRing pct={pct} label="מהמסע" />
        </div>
        {curStation ? (
          <div className="relative mt-4 flex items-center gap-3 rounded-2xl bg-hero-row px-3.5 py-2.5 border border-hero-row-line shadow-lg">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-300 text-xs font-black text-[#022c22]">{currentIdx + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-primary-100/70">השלב הנוכחי · {currentIdx + 1} מתוך {mapStations.length}</p>
              <p className="truncate text-[14px] font-bold">{curStation.title}</p>
            </div>
            <span className="shrink-0 text-xs font-semibold text-primary-100/80">{curStation.done}/{curStation.total} שיעורים</span>
          </div>
        ) : null}

        <div className="relative mt-3 rounded-[22px] bg-hero-card border border-hero-card-line p-4 text-brand shadow-xl">
          <p className="text-[11px] font-bold tracking-[0.08em] text-primary-700">{allDone ? 'היום' : 'הפוקוס של היום'}</p>
          {today ? (
            <a href={`#task-${today.id}`} className="mt-1 flex items-center gap-3">
              <span className="text-3xl" aria-hidden>{today.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] font-extrabold leading-snug">{today.currentStep}</span>
                <span className="mt-0.5 block text-xs text-primary-800/70">
                  {today.doneToday}/{today.targetToday} היום{today.streakDays > 0 ? ` · ${today.streakDays} ${today.streakDays === 1 ? 'יום' : 'ימים'} ברצף` : ''}
                </span>
              </span>
              <span aria-hidden className="text-lg text-primary-700">←</span>
            </a>
          ) : (
            <p className="mt-1 text-[15px] font-bold leading-snug">
              {allDone ? you('סגרת את כל ההרגלים של היום. כל הכבוד, את בדרך הנכונה.', 'סגרת את כל ההרגלים של היום. כל הכבוד, אתה בדרך הנכונה.', 'כל ההרגלים של היום הושלמו. כל הכבוד.') : 'השיעור הבא במסע יפתח את ההרגל הראשון שלך.'}
            </p>
          )}
        </div>
      </header>

      <section aria-label="מילה מאלמוג" className="flex gap-3 px-1">
        <div className="size-10 shrink-0">
          <AlmogAvatarChip size={40} />
        </div>
        <p className="min-w-0 text-[14px] leading-[1.7] text-primary-900/90">
          <span className="font-bold text-primary-700">אלמוג: </span>
          {summary}
        </p>
      </section>

      <section aria-labelledby="plan-habits" className="flex flex-col gap-3">
        <SectionHead id="plan-habits" kicker={`${habits.length} ${habits.length === 1 ? 'הרגל פעיל' : 'הרגלים פעילים'}`} title="ההרגלים שלי" />
        {offers.map((o) => (
          <OfferCard key={o.id} definitionId={o.definition_id} title={o.definition.title} emoji={o.definition.emoji} description={o.definition.description} />
        ))}
        {habits.length ? (
          habits.map((h, i) => <PlanHabitCard key={h.id} habit={h} canStepDown={active[i]!.canStepDown} canStepUp={active[i]!.canStepUp} highlighted={focusTaskId === h.id} />)
        ) : (
          <EmptyState
            title="עוד אין הרגלים בתוכנית"
            description="כל שיעור במסע מציע הרגל אחד קטן. כשבוחרים אותו, הוא נכנס לכאן ואני בונה סביבו את הצעדים."
            action={
              <Link href="/journey" className="font-bold text-primary-700 underline">
                לשיעור הבא
              </Link>
            }
          />
        )}
        {habits.length ? <SosButton firstName={firstName} focusTasks={active.map((t) => ({ id: t.id, title: t.level.title, emoji: t.definition.emoji ?? undefined }))} /> : null}
      </section>

      <AlmogPlanSections />

      <section aria-label="עוד בתוכנית" className="flex flex-col gap-2.5">
        {mapStations.length ? (
          <PlanAccordion icon="🗺️" title="המסלול המלא" meta={`${mapStations.length} שלבים · ${journeySummary.done}/${journeySummary.total} צעדים`}>
            {principles.length ? (
              <div className="rounded-2xl bg-cream p-3.5">
                <p className="text-[11px] font-bold text-primary-700">העקרונות שלמדנו עד עכשיו</p>
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {principles.map((p) => (
                    <li key={p.title} className="text-[13px] leading-relaxed text-primary-900">
                      <span className="font-bold">{p.title}: </span>
                      {p.text}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <PlanMap stations={mapStations} />
          </PlanAccordion>
        ) : null}
        {log.length ? (
          <PlanAccordion icon="📝" title="השינויים שאלמוג עשה" meta={`${log.length} התאמות · אחרונה ${formatPlanDate(log[0]!.note.at)}`}>
            <ol className="flex flex-col gap-2">
              {log.map((e) => (
                <li key={e.id} className="rounded-xl bg-cream px-3 py-2.5">
                  <p className="text-[11px] font-bold text-primary-700">
                    {e.note.direction === 'down' ? '↓' : e.note.direction === 'up' ? '↑' : '•'} {formatPlanDate(e.note.at)} · {e.habit}
                  </p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-primary-900">{e.note.text}</p>
                  {e.note.quote ? <p className="mt-0.5 text-xs italic text-primary-800/75">״{e.note.quote}״</p> : null}
                </li>
              ))}
            </ol>
          </PlanAccordion>
        ) : null}
      </section>

      <PatternInsightsCard userId={user.id} max={2} />

      <div className="flex items-center justify-center gap-5 text-sm font-semibold">
        <Link href="/progress" className="text-primary-700 underline-offset-4 hover:underline">
          ההתקדמות שלי
        </Link>
        <Link href="/progress/history" className="text-primary-700 underline-offset-4 hover:underline">
          היסטוריה מלאה
        </Link>
      </div>
    </main>
  );
}
