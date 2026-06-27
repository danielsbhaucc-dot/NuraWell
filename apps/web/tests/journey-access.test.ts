import { describe, expect, it } from 'vitest';

import type { AdminUserJourneyReport, AdminUserJourneyStepRow } from '../lib/admin/build-user-journey-report';
import {
  canAccessJourneyStep,
  type JourneyAccessContext,
  pickNextJourneyStep,
} from '../lib/journey/journey-access';

function step(partial: Partial<AdminUserJourneyStepRow> & Pick<AdminUserJourneyStepRow, 'id' | 'title' | 'step_number'>): AdminUserJourneyStepRow {
  return {
    is_published: true,
    station_id: null,
    station_title: 'x',
    station_sort_order: 0,
    started: false,
    is_completed: false,
    last_section: null,
    updated_at: null,
    video_watched: false,
    quiz_score: null,
    commitment_accepted: false,
    tasks: [],
    habits: [],
    ...partial,
  };
}

describe('journey-access', () => {
  const foundationId = 'st-foundation';
  const report: AdminUserJourneyReport = {
    steps: [
      step({ id: 'a', step_number: 1, station_id: foundationId, is_completed: false }),
      step({ id: 'b', step_number: 2, station_id: foundationId, is_completed: false }),
      step({ id: 'c', step_number: 3, station_id: 'catalog', title: 'ערב' }),
    ],
    stats: {
      journey_steps_tracked: 0,
      journey_steps_completed: 0,
      tasks_accepted: 0,
      habits_tracked: 0,
      total_task_executions_last_30: 0,
      active_days_last_30: 0,
    },
  };

  const ctx: JourneyAccessContext = {
    foundationStationId: foundationId,
    foundationComplete: false,
    unlockedStepIds: new Set<string>(),
    foundationSteps: report.steps.filter((s) => s.station_id === foundationId),
  };

  it('locks catalog steps until foundation is complete', () => {
    expect(
      canAccessJourneyStep({
        ctx,
        stepId: 'c',
        stationId: 'catalog',
        isPublished: true,
        isCompleted: false,
        started: false,
      })
    ).toBe(false);
  });

  it('allows first foundation step only', () => {
    expect(
      canAccessJourneyStep({
        ctx,
        stepId: 'a',
        stationId: foundationId,
        isPublished: true,
        isCompleted: false,
        started: false,
      })
    ).toBe(true);
    expect(
      canAccessJourneyStep({
        ctx,
        stepId: 'b',
        stationId: foundationId,
        isPublished: true,
        isCompleted: false,
        started: false,
      })
    ).toBe(false);
  });

  it('picks first incomplete foundation step', async () => {
    const pick = await pickNextJourneyStep({
      report,
      ctx,
      admin: { from: () => ({ upsert: async () => ({ error: null }) }) },
      userId: 'user-1',
      daysSinceLastActive: null,
      signals: { main_obstacle: null, main_obstacle_detail: null, weakest_time_of_day: null },
    });
    expect(pick.step?.id).toBe('a');
    expect(pick.phase).toBe('foundation');
  });
});
