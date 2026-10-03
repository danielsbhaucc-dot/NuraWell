import { test, expect } from '@playwright/test';

/**
 * E2E: מונים בין מסכים חייבים להגיע מאותו SSOT.
 * בלי סשן — ה-API מחזיר 401; עם סשן (PLAYWRIGHT_AUTH_COOKIE) משווים מונים.
 */

type SnapshotPayload = {
  counts: {
    unified: {
      dueToday: number;
      doneToday: number;
      pendingToday: number;
      active: number;
      completed: number;
      rejected: number;
    };
    almog: { active: number; completed: number; dropped: number };
    journey: { accepted: number; rejected: number; dueToday: number };
  };
  screen_counters: {
    home_due_today: number;
    home_done_today: number;
    home_pending_today: number;
    plans_almog_active: number;
    journey_almog_open: number;
    history_rejected: number;
    history_completed: number;
  };
  profile: {
    gender_label: string | null;
    current_weight_kg: number | null;
    wake_up_time: string | null;
    sleep_time: string | null;
  };
};

test.describe('cross-screen task/profile SSOT', () => {
  test('user-task-snapshot דורש התחברות', async ({ request }) => {
    const res = await request.get('/api/v1/user-task-snapshot');
    expect([401, 403]).toContain(res.status());
  });

  test('עם סשן — מוני בית/תוכנית/מסע/היסטוריה תואמים', async ({ request }) => {
    const cookie = process.env.PLAYWRIGHT_AUTH_COOKIE;
    test.skip(!cookie, 'דורש PLAYWRIGHT_AUTH_COOKIE לסשן מחובר');

    const res = await request.get('/api/v1/user-task-snapshot', {
      headers: { cookie },
    });
    expect(res.ok()).toBeTruthy();
    const json = (await res.json()) as SnapshotPayload;

    expect(json.screen_counters.home_due_today).toBe(json.counts.unified.dueToday);
    expect(json.screen_counters.home_pending_today).toBe(json.counts.unified.pendingToday);
    expect(json.screen_counters.plans_almog_active).toBe(json.counts.almog.active);
    expect(json.screen_counters.journey_almog_open).toBe(json.counts.almog.active);
    expect(json.screen_counters.history_rejected).toBe(json.counts.unified.rejected);
    expect(json.screen_counters.history_completed).toBe(json.counts.unified.completed);

    // עקביות פנימית: dueToday = journey due + almog open
    expect(json.counts.unified.dueToday).toBe(
      json.counts.journey.dueToday + json.counts.almog.active
    );

    // פרופיל — שדות אחידים (לא ברירות מחדל מזויפות ב-API)
    if (json.profile.gender_label) {
      expect(['גבר', 'אישה']).toContain(json.profile.gender_label);
    }
  });
});
