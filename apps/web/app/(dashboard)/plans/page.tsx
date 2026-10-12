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
  const phaseStart = Math.max(0, currentIdx - 1);
  const phases = mapStations.slice(phaseStart, phaseStart + 4);
  const principles = mapStations
    .slice(0, currentIdx + 1)
    .map((st) => ({ title: st.title, text: stationDesc.get(st.id) ?? '' }))
    .filter((p) => p.text)
    .slice(-3);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-7 px-4 pb-28 pt-4">
      <header className="relative overflow-hidden rounded-[28px] bg-linear-to-br from-[#033d2e] via-brand-700 to-primary-600 p-5 text-white shadow-[0_14px_36px_rgba(6,78,59,0.28)]">
        <span aria-hidden className="pointer-events-none absolute -top-16 -left-10 size-48 rounded-full bg-primary-300/20 blur-2xl" />
        <p className="relative text-[11px] font-bold tracking-wide text-white/70">תוכנית אישית · נכתבת ומתעדכנת על ידי אלמוג</p>
        <h1 className="relative mt-1 text-[26px] font-black leading-tight">{firstName ? `התוכנית של ${firstName}` : 'התוכנית שלך'}</h1>
        <p className="relative mt-2 text-sm font-semibold text-white/90">
          <span className="text-white/65">המטרה: </span>
          {planGoalLine(prof.main_goal)}
        </p>
        {obstacle ? (
          <p className="relative mt-1 text-sm text-white/85">
            <span className="text-white/65">נבנתה סביב: </span>
            {obstacle}
          </p>
        ) : null}
        <dl className="relative mt-4 grid grid-cols-3 gap-2 text-center">
          <CoverStat label="שלב" value={mapStations.length ? `${Math.min(currentIdx + 1, mapStations.length)} מתוך ${mapStations.length}` : 'התחלה'} />
          <CoverStat label="הרגלים פעילים" value={String(habits.length)} />
          <CoverStat label="עדכון אחרון" value={lastUpdate ? formatPlanDate(lastUpdate) : 'היום'} />
        </dl>
      </header>

      <section aria-label="הערה של אלמוג" className="flex gap-3 rounded-3xl border border-primary-100 bg-background-card p-4 shadow-[0_8px_24px_rgba(6,78,59,0.06)]">
        <div className="size-11 shrink-0 self-start">
          <AlmogAvatarChip size={44} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-primary-700">מילה מאלמוג</p>
          <p className="mt-0.5 text-[14px] leading-relaxed text-primary-900">{summary}</p>
        </div>
      </section>

      <PlanSection n={1} id="plan-habits" title="ההרגלים שלי" hint="לכל הרגל: איפה אני עכשיו, מה הלאה, ומה עושים ביום קשה">
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

      <AlmogPlanSections n={2} />

      {phases.length ? (
        <PlanSection n={3} id="plan-phases" title="שלבי התוכנית" hint="כל שלב מוסיף הרגל אחד ועיקרון אחד">
          <ol className="flex flex-col gap-2">
            {phases.map((st, k) => {
              const i = phaseStart + k;
              const cur = st.state === 'current';
              return (
                <li key={st.id} className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${cur ? 'border-primary-300 bg-primary-50/80' : 'border-primary-100 bg-background-card'} ${st.state === 'locked' ? 'opacity-70' : ''}`}>
                  <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${st.state === 'done' ? 'bg-brand-700 text-white' : cur ? 'bg-cream text-brand-700 ring-2 ring-brand-700' : 'bg-primary-100 text-primary-700'}`}>
                    {st.state === 'done' ? '✓' : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-primary-900">{st.title}</p>
                    <p className="text-[11px] text-primary-800/70">
                      {st.state === 'done' ? 'הושלם' : cur ? `השלב הנוכחי · ${st.done}/${st.total} שיעורים` : 'בהמשך הדרך'}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
          {principles.length ? (
            <div className="rounded-2xl border border-primary-100 bg-cream/80 p-3.5">
              <p className="text-[11px] font-bold text-primary-700">העקרונות שלמדנו עד עכשיו</p>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {principles.map((p) => (
                  <li key={p.title} className="line-clamp-3 text-[13px] leading-relaxed text-primary-900">
                    <span className="font-bold">{p.title}: </span>
                    {p.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {mapStations.length > phases.length ? (
            <details className="group rounded-3xl border border-primary-100 bg-background-card">
              <summary className="cursor-pointer list-none p-4 text-sm font-bold text-primary-800">
                <span className="group-open:hidden">למפת המסע המלאה ({mapStations.length} שלבים)</span>
                <span className="hidden group-open:inline">לסגור את המפה</span>
              </summary>
              <div className="px-2 pb-2">
                <PlanMap stations={mapStations} />
              </div>
            </details>
          ) : null}
        </PlanSection>
      ) : null}

      {log.length ? (
        <PlanSection n={4} id="plan-log" title="יומן ההתאמות" hint="כל שינוי שעשיתי בתוכנית, ולמה">
          <ol className="flex flex-col gap-2">
            {log.slice(0, 3).map((e) => (
              <LogRow key={e.id} habit={e.habit} at={e.note.at} text={e.note.text} quote={e.note.quote} />
            ))}
          </ol>
          {log.length > 3 ? (
            <details className="group">
              <summary className="cursor-pointer list-none text-sm font-bold text-primary-700">
                <span className="group-open:hidden">עוד {log.length - 3} התאמות</span>
                <span className="hidden group-open:inline">פחות</span>
              </summary>
              <ol className="mt-2 flex flex-col gap-2">
                {log.slice(3).map((e) => (
                  <LogRow key={e.id} habit={e.habit} at={e.note.at} text={e.note.text} quote={e.note.quote} />
                ))}
              </ol>
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
    </main>
  );
}

function CoverStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/12 px-2 py-2 backdrop-blur-sm">
      <dt className="text-[10px] font-semibold text-white/70">{label}</dt>
      <dd className="text-[13px] font-black">{value}</dd>
    </div>
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
