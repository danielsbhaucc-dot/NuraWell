import { describe, expect, it } from 'vitest';

import { formatUserMemoryDossierPromptBlock } from '../lib/ai/memory-dossier/format-dossier-prompt';
import { mergeDossierPatch } from '../lib/ai/memory-dossier/merge-dossier';
import type { UserMemoryDossier } from '../lib/ai/memory-dossier/types';

describe('memory-dossier', () => {
  it('mergeDossierPatch merges tags and preserves existing fields', () => {
    const existing: UserMemoryDossier = {
      user_id: 'u1',
      tags: ['evening_stress'],
      essentials: { primary_goal: 'ירידה במשקל' },
      goals: {},
      task_memory: { completed_recent: ['שתיית מים'] },
      habit_memory: {},
      schedule_memory: {},
      personal_context: {},
      health_context: {},
      psychology: {},
      coaching_profile: {},
      risk_signals: {},
      inferred_insights: [],
      source_stats: {},
    };

    const merged = mergeDossierPatch(existing, 'u1', {
      tags_add: ['weekend_binge'],
      goals: { primary: '5 ק"ג עד הקיץ' },
      task_memory: { missed_recent: ['הליכה ערב'] },
      inferred_insights: [{ text: 'קושי קשור לעייפות אחרי עבודה', confidence: 0.85 }],
    });

    expect(merged.tags).toContain('evening_stress');
    expect(merged.tags).toContain('weekend_binge');
    expect(merged.essentials.primary_goal).toBe('ירידה במשקל');
    expect(merged.goals.primary).toBe('5 ק"ג עד הקיץ');
    expect(merged.task_memory.completed_recent).toEqual(['שתיית מים']);
    expect(merged.task_memory.missed_recent).toEqual(['הליכה ערב']);
    expect(merged.inferred_insights).toHaveLength(1);
  });

  it('formatUserMemoryDossierPromptBlock returns compact Hebrew block', () => {
    const block = formatUserMemoryDossierPromptBlock({
      user_id: 'u1',
      tags: ['no_time', 'emotional_eating'],
      essentials: {},
      goals: { primary: 'להפסיק לנשנש בערב' },
      task_memory: { missed_recent: ['משימת מים'], miss_reasons: ['עייפות'] },
      habit_memory: { triggers: ['טלוויזיה בערב'] },
      schedule_memory: {},
      personal_context: {},
      health_context: {},
      psychology: { motivation: 'רוצה להרגיש בטוב עם עצמו' },
      coaching_profile: { tone_works: 'warm_friend' },
      risk_signals: { dropout_risk: 'medium' },
      inferred_insights: [{ text: 'נופל אחרי יום עמוס' }],
      source_stats: {},
    });

    expect(block).toContain('[תיק זיכרון מובנה');
    expect(block).toContain('יעד מרכזי');
    expect(block).toContain('להפסיק לנשנש בערב');
    expect(block).not.toContain('"user_id"');
  });
});
