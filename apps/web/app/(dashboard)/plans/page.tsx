import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlan, listOffers } from '@/lib/tasks';
import { OfferCard } from '@/components/plans/OfferCard';
import { PlanMap, type MapStation } from '@/components/plans/PlanMap';
import { buildMapStations } from '@/lib/journey/map-stations';
import { EmptyState } from '@/components/ui/EmptyState';
import { SosButton } from '@/components/ai/SosButton';
import { AlmogPlanSections } from '@/components/plans/AlmogPlanSections';
import { PlanSection } from '@/components/plans/PlanSection';
import { PlanHabitCard } from '@/components/plans/PlanHabitCard';
import { PlanAccordion } from '@/components/plans/PlanAccordion';
import { ProgressRing } from '@/components/plans/ProgressRing';
import { AlmogAvatarChip } from '@/components/journey/AlmogPresence';
import { almogChangeNote, almogPlanSummary, buildPlanHabit, formatPlanDate, planGoalLine, type Gender } from '@/lib/plans/plan-document';
import { mainObstacleLabelHe } from '@/lib/churn/reengagement-prompt-blocks';

export const metadata = { title: 'התוכנית שלי' };
export const dynamic = 'force-dynamic';

/**
 * "התוכנית שלך" — a written personal plan that Almog keeps up to date: goal, Almog's note, each habit with
 * current / next / fallback step and why it changed, the phases (stations) and the adjustment log.
 * Fully server-rendered from real data (ladder levels + level-change events); no AI call on render.
 */
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
    supabase.from('profiles').select('full_name, gender, main_goal, main_obstacle, main_obstacle_detail').eq('id', user.id).maybeSingle(),
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
  const lastUpdate = log[0]?.note.at ?? active.map((t) => t.accepted_at).filter(Boolean).sort().at(-1) ?? null;

  const currentIdx = Math.max(0, mapStations.findIndex((st) => st.state === 'current'));
  const principles = mapStations
    .slice(0, currentIdx + 1)
    .map((st) => ({ title: st.title, text: stationDesc.get(st.id) ?? '' }))
    .filter((p) => p.text)
    .slice(-3);

  const totalSteps = mapStations.reduce((n, st) => n + st.total, 0);
  const doneSteps = mapStations.reduce((n, st) => n + st.done, 0);
  const journeyPct = totalSteps ? (doneSteps / totalSteps) * 100 : 0;
  const currentPhase = mapStations[currentIdx] ?? null;
  const nextPhase = mapStations[currentIdx + 1] ?? null;
  const todayDone = habits.reduce((n, h) => n + Math.min(h.doneToday, h.targetToday), 0);
  const todayTarget = habits.reduce((n, h) => n + h.targetToday, 0);
  const g = (f: string, m: string, o: string) => (gender === 'female' ? f : gender === 'male' ? m : o);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-8 px-4 pb-28 pt-4">
      <header className="relative overflow-hidden rounded-[32px] border border-primary-100/80 bg-linear-to-br from-cream via-primary-50/70 to-[#d9f5e8] p-6 shadow-[0_18px_44px_rgba(6,78,59,0.12)]">
        <span aria-hidden className="pointer-events-none absolute -top-20 -left-16 size-56 rounded-full bg-primary-300/25 blur-3xl" />
        <span aria-hidden className="pointer-events-none absolute -bottom-24 -right-10 size-56 rounded-full bg-brand-700/10 blur-3xl" />
        <p className="relative text-[11px] font-bold tracking-[0.08em] text-primary-700">התוכנית האישית · אלמוג מעדכן אותה איתך</p>
        <h1 className="relative mt-1.5 text-[28px] font-black leading-[1.15] text-primary-900">{firstName ? `התוכנית של ${firstName}` : 'התוכנית שלך'}</h1>
        <div className="relative mt-5 flex items-center gap-5">
          <ProgressRing pct={journeyPct} label="מהמסע" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold text-primary-700">המטרה</p>
            <p className="text-[17px] font-extrabold leading-snug text-primary-900">{planGoalLine(prof.main_goal)}</p>
            {currentPhase ? (
              <p className="mt-2 text-[13px] text-primary-800/80">
                <span className="font-bold text-brand-700">שלב {currentIdx + 1} מתוך {mapStations.length}:</span> {currentPhase.title}
              </p>
            ) : null}
            {obstacle ? <p className="mt-1 text-[12px] text-primary-800/65">נבנתה סביב: {obstacle}</p> : null}
          </div>
        </div>
        <div className="relative mt-5 flex gap-3 rounded-2xl border border-primary-100/70 bg-background-card/70 p-3.5 backdrop-blur-md">
          <div className="size-10 shrink-0 self-start">
            <AlmogAvatarChip size={40} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-primary-700">מילה מאלמוג{lastUpdate ? ` · ${formatPlanDate(lastUpdate)}` : ''}</p>
            <p className="mt-0.5 text-[14px] leading-relaxed text-primary-900">{summary}</p>
          </div>
        </div>
      </header>

      {habits.length ? (
        <section aria-labelledby="plan-today" className="rounded-[28px] bg-linear-to-br from-brand-700 to-[#064e3b] p-5 text-cream shadow-[0_16px_36px_rgba(4,120,87,0.25)]">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="plan-today" className="text-lg font-black">הפוקוס של היום</h2>
            <span className="text-[12px] font-bold text-cream/80">{todayDone}/{todayTarget} בוצעו</span>
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {habits.map((h) => {
              const done = h.doneToday >= h.targetToday;
              return (
                <li key={h.id} className="flex items-center gap-3 rounded-2xl bg-cream/10 px-3 py-2.5 backdrop-blur-sm">
                  <span aria-hidden className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-black ${done ? 'bg-primary-300 text-brand-700' : 'border-2 border-cream/40'}`}>{done ? '✓' : ''}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold leading-snug">{h.currentStep}</span>
                    <span className="block text-[11px] text-cream/70">{h.emoji} {h.habitTitle}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[12px] text-cream/75">
            {todayDone >= todayTarget ? g('סגרת את היום. אני גאה בך.', 'סגרת את היום. אני גאה בך.', 'היום נסגר. כל הכבוד.') : g('צעד אחד קטן מספיק כדי לשמור על הרצף.', 'צעד אחד קטן מספיק כדי לשמור על הרצף.', 'צעד אחד קטן מספיק כדי לשמור על הרצף.')}
          </p>
        </section>
      ) : null}

      <PlanSection n={1} id="plan-habits" title="ההרגלים שלי" hint="איפה אני עכשיו בכל הרגל, ומה אלמוג שינה">
        {offers.map((o) => (
          <OfferCard key={o.id} definitionId={o.definition_id} title={o.definition.title} emoji={o.definition.emoji} description={o.definition.description} />
        ))}
        {habits.length ? (
          habits.map((h, i) => <PlanHabitCard key={h.id} habit={h} index={i + 1} canStepDown={active[i]!.canStepDown} canStepUp={active[i]!.canStepUp} />)
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
        <SosButton firstName={firstName} focusTasks={active.map((t) => ({ id: t.id, title: t.level.title, emoji: t.definition.emoji ?? undefined }))} />
      </PlanSection>

      <AlmogPlanSections n={2} gender={gender} />

      {currentPhase ? (
        <PlanSection n={3} id="plan-phases" title="השלב שלי במסע" hint="כל שלב מוסיף הרגל אחד ועיקרון אחד">
          <div className="rounded-3xl border border-primary-200 bg-primary-50/70 p-4">
            <p className="text-[11px] font-bold text-primary-700">עכשיו · {currentPhase.done}/{currentPhase.total} שיעורים</p>
            <p className="mt-0.5 text-[16px] font-extrabold text-primary-900">{currentPhase.title}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary-100" aria-hidden>
              <div className="h-full rounded-full bg-brand-700" style={{ width: `${currentPhase.total ? Math.round((currentPhase.done / currentPhase.total) * 100) : 0}%` }} />
            </div>
            {nextPhase ? <p className="mt-2.5 text-[12px] text-primary-800/75">אחר כך: {nextPhase.title}</p> : null}
          </div>
          {principles.length ? (
            <div className="rounded-3xl border border-primary-100 bg-cream/80 p-4">
              <p className="text-[11px] font-bold text-primary-700">העיקרון שמלווה אותי עכשיו</p>
              <p className="mt-1 line-clamp-4 text-[13px] leading-relaxed text-primary-900">
                <span className="font-bold">{principles.at(-1)!.title}: </span>
                {principles.at(-1)!.text}
              </p>
            </div>
          ) : null}
          {mapStations.length > 1 ? (
            <PlanAccordion title="המסלול המלא" meta={`${mapStations.length} שלבים · ${doneSteps}/${totalSteps} שיעורים`}>
              <PlanMap stations={mapStations} />
            </PlanAccordion>
          ) : null}
        </PlanSection>
      ) : null}

      {log.length ? (
        <PlanSection n={4} id="plan-log" title="מה אלמוג שינה בתוכנית" hint="כל התאמה, ולמה">
          <PlanAccordion title="היסטוריית ההתאמות" meta={`${log.length} התאמות · האחרונה ${formatPlanDate(log[0]!.note.at)}`}>
            <ol className="flex flex-col gap-2">
              {log.map((e) => (
                <LogRow key={e.id} habit={e.habit} at={e.note.at} text={e.note.text} quote={e.note.quote} />
              ))}
            </ol>
          </PlanAccordion>
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
    </main>
  );
}

function LogRow({ habit, at, text, quote }: { habit: string; at: string; text: string; quote: string | null }) {
  return (
    <li className="rounded-2xl border border-primary-100 bg-background-card px-3.5 py-2.5">
      <p className="text-[11px] font-bold text-primary-700">
        {formatPlanDate(at)} · {habit}
      </p>
      <p className="mt-0.5 text-[13px] leading-relaxed text-primary-900">{text}</p>
      {quote ? <p className="mt-0.5 text-xs italic text-primary-800/75">״{quote}״</p> : null}
    </li>
  );
}
