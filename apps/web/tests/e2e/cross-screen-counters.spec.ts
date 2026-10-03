import { test, expect } from '@playwright/test';

/**
 * E2E: מונים בין מסכים חייבים להגיע מאותו SSOT.
 * בלי סשן — ה-API מחזיר 401.
 * עם סשן (PLAYWRIGHT_AUTH_COOKIE) — משווים בין endpoints שונים שהמסכים צורכים,
 * ולא רק aliases בתוך תשובה אחת.
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

type AlmogAssignmentsPayload = {
  assignments?: Array<{ status: string }>;
  completed?: Array<{ id: string }>;
};

type TaskHistoryPayload = {
  rejected_tasks?: Array<{
    task_id: string;
    source?: 'journey' | 'almog';
  }>;
};

test.describe('cross-screen task/profile SSOT', () => {
  test('user-task-snapshot דורש התחברות', async ({ request }) => {
    const res = await request.get('/api/v1/user-task-snapshot');
    expect([401, 403]).toContain(res.status());
  });

  test('עם סשן — מוני בית/תוכנית/מסע/היסטוריה תואמים בין endpoints', async ({
    request,
  }) => {
    const cookie = process.env.PLAYWRIGHT_AUTH_COOKIE;
    test.skip(!cookie, 'דורש PLAYWRIGHT_AUTH_COOKIE לסשן מחובר');

    const headers = { cookie };

    const [snapRes, plansRes, historyRes] = await Promise.all([
      request.get('/api/v1/user-task-snapshot', { headers }),
      request.get('/api/v1/almog-assignments', { headers }),
      request.get('/api/v1/task-history?range=all', { headers }),
    ]);

    expect(snapRes.ok()).toBeTruthy();
    expect(plansRes.ok()).toBeTruthy();
    expect(historyRes.ok()).toBeTruthy();

    const snap = (await snapRes.json()) as SnapshotPayload;
    const plans = (await plansRes.json()) as AlmogAssignmentsPayload;
    const history = (await historyRes.json()) as TaskHistoryPayload;

    // aliases פנימיים עדיין תואמים (חוזה API)
    expect(snap.screen_counters.home_due_today).toBe(snap.counts.unified.dueToday);
    expect(snap.screen_counters.home_pending_today).toBe(snap.counts.unified.pendingToday);
    expect(snap.screen_counters.plans_almog_active).toBe(snap.counts.almog.active);
    expect(snap.screen_counters.journey_almog_open).toBe(snap.counts.almog.active);
    expect(snap.screen_counters.history_rejected).toBe(snap.counts.unified.rejected);
    expect(snap.screen_counters.history_completed).toBe(snap.counts.unified.completed);

    // Plan/Journey צורכים almog-assignments — מונה פתוח חייב להתאים ל-SSOT
    const plansOpen = (plans.assignments ?? []).filter(
      (a) => a.status === 'active' || a.status === 'frozen'
    ).length;
    expect(plansOpen).toBe(snap.counts.almog.active);

    // History צורכת task-history — rejected כולל journey + almog dropped
    const historyRejected = history.rejected_tasks?.length ?? 0;
    expect(historyRejected).toBe(snap.counts.unified.rejected);

    const almogDroppedInHistory = (history.rejected_tasks ?? []).filter(
      (r) => r.source === 'almog'
    ).length;
    expect(almogDroppedInHistory).toBe(snap.counts.almog.dropped);

    // עקביות פנימית: dueToday = journey due + almog open
    expect(snap.counts.unified.dueToday).toBe(
      snap.counts.journey.dueToday + snap.counts.almog.active
    );

    if (snap.profile.gender_label) {
      expect(['גבר', 'אישה']).toContain(snap.profile.gender_label);
    }
  });

  test('עם סשן — data-ssot ב-UI של בית/תוכנית/מסע תואם ל-snapshot', async ({
    page,
    request,
  }) => {
    const cookie = process.env.PLAYWRIGHT_AUTH_COOKIE;
    test.skip(!cookie, 'דורש PLAYWRIGHT_AUTH_COOKIE לסשן מחובר');

    await page.context().addCookies(
      cookie.split(';').map((part) => {
        const [name, ...rest] = part.trim().split('=');
        return {
          name: name!,
          value: rest.join('='),
          domain: 'localhost',
          path: '/',
        };
      })
    );

    const snapRes = await request.get('/api/v1/user-task-snapshot', {
      headers: { cookie },
    });
    expect(snapRes.ok()).toBeTruthy();
    const snap = (await snapRes.json()) as SnapshotPayload;

    await page.goto('/home');
    await expect(page.locator('[data-ssot-due-today]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-ssot-due-today]')).toHaveAttribute(
      'data-ssot-due-today',
      String(snap.counts.unified.dueToday)
    );
    await expect(page.locator('[data-ssot-almog-active]').first()).toHaveAttribute(
      'data-ssot-almog-active',
      String(snap.counts.almog.active)
    );

    await page.goto('/plans');
    await expect(page.locator('[data-ssot-almog-active]').first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('[data-ssot-almog-active]').first()).toHaveAttribute(
      'data-ssot-almog-active',
      String(snap.counts.almog.active)
    );

    await page.goto('/journey');
    // סקשן אלמוג מופיע רק כשיש משימות/פוקוס — אם אין, מדלגים על בדיקת DOM
    const journeyAlmog = page.locator('[data-ssot-almog-active]');
    if ((await journeyAlmog.count()) > 0) {
      await expect(journeyAlmog.first()).toHaveAttribute(
        'data-ssot-almog-active',
        String(snap.counts.almog.active)
      );
    }

    await page.goto('/journey/history');
    const hist = page.locator('[data-ssot-unified-rejected]');
    if ((await hist.count()) > 0) {
      await expect(hist.first()).toHaveAttribute(
        'data-ssot-unified-rejected',
        String(snap.counts.unified.rejected)
      );
    }
  });
});
