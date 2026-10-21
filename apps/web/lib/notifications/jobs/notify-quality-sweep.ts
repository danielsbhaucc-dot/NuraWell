/**
 * Nightly notification quality sweep (called from master.ts).
 * Scans the last ~26h of Almog notifications still in the inbox (not archived), applies the free
 * deterministic lint, and only for rows with real phrasing defects calls the cheap LLM editor.
 * Corrected text replaces `body` in place (the push was already sent; the inbox copy is what stays).
 * Bounded: max 300 rows scanned, max 40 LLM calls, plus the daily USD cap inside qcNotifyText.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchNotifyUserProfile } from '@/lib/ai/notify-user-profile';
import { genderFromInstruction, lintNotifyHebrew } from '../notify-hebrew-lint';
import { qcNotifyText } from '../notify-qc';
import { applyAutoFixRules, learnStyleRules, loadActiveStyleRules, logNotifyQualityEvents, type LearnResult } from '../quality-learning';

export type NotifyQualitySweepResult = { scanned: number; lint_fixed: number; llm_checked: number; llm_fixed: number; learn?: LearnResult | { error: string } };

const MAX_SCAN = 300;
const MAX_LLM = 40;
/** master has maxDuration 300 and other steps; the sweep never takes more than this */
const TIME_BUDGET_MS = 45_000;

export async function runNotifyQualitySweep(admin: SupabaseClient, now = new Date()): Promise<NotifyQualitySweepResult> {
  const since = new Date(now.getTime() - 26 * 3600_000).toISOString();
  const { data, error } = await admin
    .from('notifications')
    .select('id, user_id, body')
    .eq('type', 'ai_message')
    .is('archived_at', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(MAX_SCAN);
  if (error) throw new Error(error.message);
  const out: NotifyQualitySweepResult = { scanned: 0, lint_fixed: 0, llm_checked: 0, llm_fixed: 0 };
  const profiles = new Map<string, { firstName: string; gender: ReturnType<typeof genderFromInstruction> }>();
  const started = Date.now();
  const rules = await loadActiveStyleRules(admin);
  for (const row of (data ?? []) as Array<{ id: string; user_id: string; body: string | null }>) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    const body = row.body?.trim();
    if (!body) continue;
    out.scanned += 1;
    let prof = profiles.get(row.user_id);
    if (!prof) {
      const p = await fetchNotifyUserProfile(admin, row.user_id).catch(() => null);
      prof = { firstName: p?.firstName?.trim() && p.firstName.trim() !== 'שם' ? p.firstName.trim() : '', gender: genderFromInstruction(p?.genderInstruction) };
      profiles.set(row.user_id, prof);
    }
    // without a known first name we cannot mask it → never send to the editor
    const lint = lintNotifyHebrew(body, { firstName: prof.firstName || null, gender: prof.gender });
    let next = applyAutoFixRules(lint.text, rules).text;
    if (lint.issues.length && prof.firstName && out.llm_checked < MAX_LLM) {
      out.llm_checked += 1;
      const qc = await qcNotifyText(next, { firstName: prof.firstName, gender: prof.gender, userId: row.user_id, admin });
      if (qc.status === 'edited') {
        next = qc.text;
        out.llm_fixed += 1;
      }
      if (qc.status === 'cap' || qc.status === 'disabled') break;
    }
    if (next !== body) {
      const { error: upErr } = await admin.from('notifications').update({ body: next }).eq('id', row.id).eq('body', row.body!);
      if (!upErr && lint.text !== body) out.lint_fixed += 1;
      if (!upErr && prof.firstName) {
        await logNotifyQualityEvents(
          [{ stage: 'sweep_fix', category: lint.fixes[0] ?? (lint.issues.length ? 'llm_edit' : 'learned_rule'), source: 'nightly_sweep', before: body, after: next }],
          { firstName: prof.firstName || null, admin }
        );
      }
    }
  }
  try {
    out.learn = await learnStyleRules(admin);
  } catch (e) {
    out.learn = { error: e instanceof Error ? e.message : String(e) };
  }
  return out;
}
