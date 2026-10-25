import { createAdminClient } from '../../lib/supabase/admin';
import { hasPlaceholderCorruption } from '../../lib/ai/safety/memory-text-guard';

type Row = { id: string; metadata: { user_line?: string; tip?: string; evidence_dates?: string[] } | null };

/**
 * "Almog noticed" — up to `max` active behaviour patterns from the nightly batch, in the user's
 * own words (2nd person) + one small step. Server component; renders nothing when there is none.
 * userId must come from the authenticated session of the page.
 */
export async function PatternInsightsCard({ userId, max = 2, compact = false }: { userId: string; max?: number; compact?: boolean }) {
  let rows: Row[] = [];
  try {
    const { data } = await createAdminClient()
      .from('user_insights')
      .select('id, metadata')
      .eq('user_id', userId)
      .eq('status', 'ACTIVE')
      .like('dedupe_key', 'pattern:%')
      .order('last_seen_at', { ascending: false })
      .limit(max);
    rows = ((data ?? []) as Row[]).filter((r) => r.metadata?.user_line && !hasPlaceholderCorruption(r.metadata.user_line));
  } catch {
    return null;
  }
  if (rows.length === 0) return null;

  return (
    <section dir="rtl" aria-label="דברים שאלמוג שם לב אליהם" className="rounded-2xl bg-glass/80 backdrop-blur-md p-4 shadow-sm ring-1 ring-primary-900/10">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-primary-950">
        <span aria-hidden>🌱</span> אלמוג שם לב
      </h2>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.id} className="text-[14px] leading-relaxed text-primary-950/90">
            <p>{r.metadata!.user_line}</p>
            {!compact && r.metadata!.tip ? (
              <p className="mt-0.5 text-[13px] text-primary-800/80">
                <span className="font-semibold">צעד קטן: </span>
                {r.metadata!.tip}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
