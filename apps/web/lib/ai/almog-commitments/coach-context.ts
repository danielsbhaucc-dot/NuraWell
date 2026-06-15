/**
 * אריזת הקשר Pre-LLM לזרימת "המאמן הבלתי-נראה".
 * שולף את כל המטא-דאטה הנסתר מה-DB ומארז אותו בצורה נקייה
 * כדי שה-LLM לא יצטרך לנחש היסטוריה (פחות טוקנים, פחות hallucination).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchInterventionMemory,
  type ActiveTaskRef,
  type InterventionMemoryRow,
} from './intervention-engine';
import { normalizeStrategyType, type StrategyType } from './friction';
import type { BlockerCoachState } from './types';

export interface BlockerContextRow {
  id: string;
  user_id: string;
  description: string;
  strategy: string | null;
  category: string | null;
  attempt_count: number;
  status: string;
  related_assignment_id: string | null;
  metadata: Record<string, unknown> | null;
}

export interface CoachContextPack {
  blocker: BlockerContextRow;
  memory: InterventionMemoryRow[];
  failedStrategyTypes: StrategyType[];
  activeTasks: ActiveTaskRef[];
  taskByRef: Map<string, string>;
  originalTaskTitle: string | null;
  /** coach state שמור (אם קיים וטרי) */
  cachedCoach: BlockerCoachState | null;
}

const COACH_TTL_MS = 30 * 60_000; // 30 דקות — אחרי זה מרעננים

function readCachedCoach(metadata: Record<string, unknown> | null): BlockerCoachState | null {
  if (!metadata || typeof metadata.coach !== 'object' || !metadata.coach) return null;
  const c = metadata.coach as BlockerCoachState;
  if (!c.empathy || !c.proposal?.micro_step) return null;
  const age = Date.now() - new Date(c.generated_at).getTime();
  if (age > COACH_TTL_MS) return null;
  return c;
}

async function getFailedStrategyTypes(
  admin: SupabaseClient,
  userId: string,
  blockerId: string
): Promise<StrategyType[]> {
  const { data } = await admin
    .from('almog_interventions')
    .select('strategy_type')
    .eq('user_id', userId)
    .eq('blocker_id', blockerId)
    .eq('outcome', 'not_helped');
  return ((data ?? []) as { strategy_type: string }[]).map((r) =>
    normalizeStrategyType(r.strategy_type)
  );
}

async function getLinkableActiveTasks(
  admin: SupabaseClient,
  userId: string
): Promise<{ id: string; title: string }[]> {
  const { data } = await admin
    .from('almog_assignments')
    .select('id, title, relation')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('given_at', { ascending: false })
    .limit(8);
  return ((data ?? []) as { id: string; title: string; relation: string | null }[])
    .filter((a) => !a.relation || a.relation === 'standalone')
    .slice(0, 6)
    .map((a) => ({ id: a.id, title: a.title }));
}

async function getOriginalTaskTitle(
  admin: SupabaseClient,
  userId: string,
  assignmentId: string | null
): Promise<string | null> {
  if (!assignmentId) return null;
  const { data } = await admin
    .from('almog_assignments')
    .select('title')
    .eq('id', assignmentId)
    .eq('user_id', userId)
    .maybeSingle();
  return (data as { title: string } | null)?.title ?? null;
}

/**
 * אורז את כל ההקשר הנדרש לפני קריאת LLM.
 * אם יש coach state טרי ב-metadata — מחזיר אותו ב-cachedCoach (חוסך טוקנים).
 */
export async function packCoachContext(
  admin: SupabaseClient,
  userId: string,
  blocker: BlockerContextRow
): Promise<CoachContextPack> {
  const [memory, failedTypes, linkable, originalTitle] = await Promise.all([
    fetchInterventionMemory(admin, userId),
    getFailedStrategyTypes(admin, userId, blocker.id),
    getLinkableActiveTasks(admin, userId),
    getOriginalTaskTitle(admin, userId, blocker.related_assignment_id),
  ]);

  const taskByRef = new Map(linkable.map((t, i) => [`T${i + 1}`, t.id]));
  const activeTasks = linkable.map((t, i) => ({ ref: `T${i + 1}`, title: t.title }));
  const cachedCoach = readCachedCoach(blocker.metadata);

  return {
    blocker,
    memory,
    failedStrategyTypes: failedTypes,
    activeTasks,
    taskByRef,
    originalTaskTitle: originalTitle,
    cachedCoach,
  };
}
