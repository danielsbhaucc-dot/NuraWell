import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchUserGuideSummaries } from '../guides/fetch-user-guides';
import { grantGuideAccess } from '../guides/grant-access';
import { revokeGuideAccess } from '../guides/revoke-access';
import { runGuideCompanionLlm, type GuideCatalogEntry } from '../guides/guide-companion-llm';
import { detectGuideSeasonTag, isGuideSeasonallyActive, seasonInactiveReason } from '../guides/seasonal';
import type { AiUserContext } from '../ai/memory';

export interface GuideCompanionSnapshot {
  date: string;
  almog_note: string;
  next_pick: { courseId: string; courseTitle: string; reason: string } | null;
  available_picks: Array<{ courseId: string; courseTitle: string; reason: string }>;
  model: string | null;
}

function todayJerusalem(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = any;

interface CatalogLesson {
  lesson_type?: string | null;
  duration_minutes?: number | null;
  is_published?: boolean | null;
}

async function fetchGuideCatalog(admin: AdminDb): Promise<GuideCatalogEntry[]> {
  const { data: courses } = await admin
    .from('courses')
    .select('id, title, description, lessons(lesson_type, duration_minutes, is_published)')
    .eq('is_published', true)
    .order('sort_order');

  const now = new Date();
  return (courses ?? []).map((c: {
    id: string;
    title: string;
    description: string | null;
    lessons: CatalogLesson[];
  }) => {
    const lessons = (c.lessons ?? []).filter((l) => l.is_published !== false);
    const types = [...new Set(lessons.map((l) => l.lesson_type).filter(Boolean))] as string[];
    const tag = detectGuideSeasonTag(c.title, c.description);
    return {
      id: c.id,
      title: c.title,
      description: c.description,
      lessonCount: lessons.length,
      totalMinutes: lessons.reduce((s, l) => s + (l.duration_minutes ?? 15), 0),
      contentTypes: types,
      seasonTag: tag,
      seasonallyActive: isGuideSeasonallyActive(tag, now),
    };
  });
}

function titleById(catalog: GuideCatalogEntry[], id: string): string {
  return catalog.find((c) => c.id === id)?.title ?? 'מדריך';
}

/** סריקה יומית למשתמש — סגירה עונתית, פתיחה מומלצת, מטמון ל-UI. */
export async function runGuideCompanionForUser(
  admin: AdminDb,
  userId: string,
  profile: {
    full_name: string | null;
    gender: 'male' | 'female' | null;
    ai_context: AiUserContext | null;
  }
): Promise<{ updated: boolean; opened: number; closed: number }> {
  const today = todayJerusalem();
  const ctx = profile.ai_context ?? {};
  if (ctx.guide_companion?.date === today) {
    return { updated: false, opened: 0, closed: 0 };
  }

  const catalog = await fetchGuideCatalog(admin);
  const activeGuides = await fetchUserGuideSummaries(admin, userId);
  const firstName = profile.full_name?.trim().split(/\s+/)[0] || 'חבר';
  const struggles = ctx.struggles ?? [];

  let opened = 0;
  let closed = 0;

  // סגירה עונתית אוטומטית (לפני LLM)
  for (const guide of activeGuides) {
    const entry = catalog.find((c) => c.id === guide.courseId);
    if (!entry || entry.seasonallyActive) continue;
    const tag = detectGuideSeasonTag(entry.title, entry.description);
    const result = await revokeGuideAccess({
      supabase: admin,
      userId,
      courseId: guide.courseId,
      reason: seasonInactiveReason(tag),
    });
    if (result.revoked) closed++;
  }

  const llmResult = await runGuideCompanionLlm({
    firstName,
    gender: profile.gender,
    struggles,
    activeGuides: await fetchUserGuideSummaries(admin, userId),
    catalog,
    todayIso: today,
  });

  const refuseOverload =
    llmResult?.refuse_new ||
    ctx.fatigue_signal === true ||
    (ctx.daily_availability?.date === today && ctx.daily_availability?.level === 'low') ||
    activeGuides.length >= 4;

  if (llmResult && !refuseOverload) {
    for (const item of llmResult.open_guides) {
      if (!catalog.some((c) => c.id === item.course_id)) continue;
      const entry = catalog.find((c) => c.id === item.course_id)!;
      if (!entry.seasonallyActive) continue;
      const grant = await grantGuideAccess({
        supabase: admin,
        userId,
        courseId: item.course_id,
        accessType: 'trial',
        grantedBy: 'ai',
        grantedReason: item.reason || 'המלצת אלמוג יומית',
        trialDays: 14,
      });
      if (grant.granted) opened++;
    }
  }

  if (llmResult) {
    for (const item of llmResult.close_guides) {
      const result = await revokeGuideAccess({
        supabase: admin,
        userId,
        courseId: item.course_id,
        reason: item.reason || 'לא רלוונטי יותר',
      });
      if (result.revoked) closed++;
    }
  }

  const refreshedActive = await fetchUserGuideSummaries(admin, userId);
  const nextPick = llmResult?.next_pick?.course_id
    ? {
        courseId: llmResult.next_pick.course_id,
        courseTitle: titleById(catalog, llmResult.next_pick.course_id),
        reason: llmResult.next_pick.reason,
      }
    : refreshedActive[0]
      ? {
          courseId: refreshedActive[0].courseId,
          courseTitle: refreshedActive[0].courseTitle,
          reason: refreshedActive[0].currentChapterTitle
            ? `להמשיך בפרק "${refreshedActive[0].currentChapterTitle}"`
            : 'להתחיל את המדריך',
        }
      : null;

  const availablePicks = (llmResult?.open_guides ?? [])
    .filter((g) => catalog.some((c) => c.id === g.course_id))
    .map((g) => ({
      courseId: g.course_id,
      courseTitle: titleById(catalog, g.course_id),
      reason: g.reason,
    }));

  let almogNote = llmResult?.almog_note?.trim() ?? '';
  if (!almogNote) {
    if (nextPick) {
      almogNote =
        profile.gender === 'female'
          ? `${firstName}, הייתי ממליצה להמשיך ב"${nextPick.courseTitle}" — ${nextPick.reason}`
          : `${firstName}, הייתי ממליץ להמשיך ב"${nextPick.courseTitle}" — ${nextPick.reason}`;
    } else {
      almogNote =
        profile.gender === 'female'
          ? `${firstName}, כשתרצי — אני כאן לעזור לך לבחור מדריך שמתאים לרגע שלך.`
          : `${firstName}, כשתרצה — אני כאן לעזור לך לבחור מדריך שמתאים לרגע שלך.`;
    }
  }

  const snapshot: GuideCompanionSnapshot = {
    date: today,
    almog_note: almogNote,
    next_pick: nextPick,
    available_picks: availablePicks,
    model: llmResult ? 'llama-4' : null,
  };

  const merged: AiUserContext = {
    ...ctx,
    guide_companion: snapshot,
  };

  const { error } = await admin.from('profiles').update({ ai_context: merged }).eq('id', userId);
  if (error) throw new Error(error.message);

  return { updated: true, opened, closed };
}

/** אצווה ל-cron master — משתמשים פעילים עם onboarding. */
export async function runGuideCompanionBatch(admin: AdminDb): Promise<{
  processed: number;
  opened: number;
  closed: number;
  skipped: number;
  errors: string[];
}> {
  const maxUsers = Math.min(40, Math.max(5, Number(process.env.CRON_MAX_GUIDE_COMPANION) || 20));
  const today = todayJerusalem();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id, full_name, gender, ai_context, last_active_at')
    .eq('onboarding_completed', true)
    .gte('last_active_at', thirtyDaysAgo)
    .limit(maxUsers * 3);

  if (error) throw new Error(error.message);

  let processed = 0;
  let opened = 0;
  let closed = 0;
  let skipped = 0;
  const errors: string[] = [];

  const rows = (profiles ?? []) as Array<{
    id: string;
    full_name: string | null;
    gender: 'male' | 'female' | null;
    ai_context: AiUserContext | null;
    last_active_at: string | null;
  }>;

  for (const profile of rows) {
    if (processed >= maxUsers) break;
    if (profile.ai_context?.guide_companion?.date === today) {
      skipped++;
      continue;
    }
    try {
      const result = await runGuideCompanionForUser(admin, profile.id, profile);
      if (result.updated) processed++;
      opened += result.opened;
      closed += result.closed;
    } catch (e) {
      errors.push(`${profile.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { processed, opened, closed, skipped, errors };
}
