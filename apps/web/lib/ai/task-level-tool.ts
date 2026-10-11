import 'server-only';
import { tool } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { changeTaskLevel, getPlan } from '@/lib/tasks';

/**
 * Almog chat tool: when the user says a task is too hard / too easy, Almog steps the MAIN task
 * one ladder level (floor/max enforced in lib/tasks/ladder.ts) and records the reason.
 */
export function buildTaskLevelTools(params: { admin: SupabaseClient; userId: string }) {
  return {
    adjust_task_level: tool({
      description:
        'Make one of the user\'s plan tasks easier or harder by ONE level when they clearly say it is too hard ("קשה לי") or too easy ("קל לי"). Never use speculatively. Returns the new task text.',
      inputSchema: z.object({
        task_hint: z.string().min(2).max(120).describe('Which task (words from its title, in Hebrew)'),
        direction: z.enum(['easier', 'harder']),
        reason: z.string().min(3).max(300).describe('Short reason in Hebrew, from the user\'s words'),
      }),
      execute: async ({ task_hint, direction, reason }) => {
        const plan = await getPlan(params.admin, params.userId);
        const hint = task_hint.trim();
        const target =
          plan.find((t) => t.level.title.includes(hint) || t.definition.title.includes(hint)) ??
          (plan.length === 1 ? plan[0] : plan.find((t) => t.is_main));
        if (!target) return { ok: false as const, reason: 'task_not_found' };
        // the chat route may already have applied this explicit request deterministically — never double-step
        const last = target.history.find((h) => h.kind === 'level_change');
        if (last && Date.now() - Date.parse(last.occurred_at) < 120_000) {
          return { ok: true as const, new_task: target.level.title, level: target.current_level, note: 'already_applied' };
        }
        const r = await changeTaskLevel(params.admin, {
          userId: params.userId,
          assignmentId: target.id,
          direction,
          reason,
          source: 'chat',
        });
        return r.ok ? { ok: true as const, new_task: r.level.title, level: r.to } : r;
      },
    }),
  };
}
