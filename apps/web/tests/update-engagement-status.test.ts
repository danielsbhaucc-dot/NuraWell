import { describe, expect, it } from 'vitest';

import { updateEngagementStatuses } from '../lib/churn/update-engagement-status';

type CapturedUpdate = { id: string; patch: Record<string, unknown> };

/**
 * Mock admin client שתומך ב-`from('profiles').update(patch).eq('id', id)`
 * ושומר את כל ה-patches שנכתבו, כדי לאמת את לוגיקת ה-reactivation reset.
 */
function mockAdmin() {
  const updates: CapturedUpdate[] = [];
  const admin = {
    from() {
      return {
        update(patch: Record<string, unknown>) {
          return {
            async eq(_col: string, id: string) {
              updates.push({ id, patch });
              return { error: null };
            },
          };
        },
      };
    },
  };
  return { admin, updates };
}

const NOW = new Date('2026-06-07T08:00:00.000Z');
const TODAY_ISO = NOW.toISOString();

describe('updateEngagementStatuses — reactivation reset', () => {
  it('clears breakup_sent_at and sent_moves when a churned user returns to active', async () => {
    const { admin, updates } = mockAdmin();

    const result = await updateEngagementStatuses(admin, {
      profileRows: [
        {
          id: 'u-returned',
          engagement_status: 'churned',
          ai_context: {
            reengagement: {
              sent_moves: ['open_door', 'breakup'],
              breakup_sent_at: '2026-05-20T08:00:00.000Z',
              open_door_sent_at: '2026-05-13T08:00:00.000Z',
              exit_survey_answered_at: '2026-05-21T08:00:00.000Z',
            },
          },
        },
      ],
      lastActiveByUser: new Map([['u-returned', TODAY_ISO]]),
      now: NOW,
    });

    expect(result.reactivated).toBe(1);
    expect(updates).toHaveLength(1);

    const patch = updates[0]!.patch;
    expect(patch.engagement_status).toBe('active');

    const reng = (patch.ai_context as { reengagement: Record<string, unknown> })
      .reengagement;
    expect(reng.sent_moves).toEqual([]);
    /** הבאג: breakup_sent_at לא נוקה והשתיק את הערוץ לצמיתות. */
    expect(reng.breakup_sent_at).toBeUndefined();
    expect(reng.open_door_sent_at).toBeUndefined();
    /** היסטוריה נשמרת לאנליטיקס. */
    expect(reng.exit_survey_answered_at).toBe('2026-05-21T08:00:00.000Z');
    expect(reng.sent_moves_archive).toEqual(['open_door', 'breakup']);
  });

  it('reactivates even if only breakup_sent_at remains (sent_moves empty)', async () => {
    const { admin, updates } = mockAdmin();

    const result = await updateEngagementStatuses(admin, {
      profileRows: [
        {
          id: 'u-breakup-only',
          engagement_status: 'active',
          ai_context: {
            reengagement: {
              sent_moves: [],
              breakup_sent_at: '2026-05-20T08:00:00.000Z',
            },
          },
        },
      ],
      lastActiveByUser: new Map([['u-breakup-only', TODAY_ISO]]),
      now: NOW,
    });

    expect(result.reactivated).toBe(1);
    const reng = (updates[0]!.patch.ai_context as {
      reengagement: Record<string, unknown>;
    }).reengagement;
    expect(reng.breakup_sent_at).toBeUndefined();
  });

  it('does not touch an active user with no re-engagement history', async () => {
    const { admin, updates } = mockAdmin();

    const result = await updateEngagementStatuses(admin, {
      profileRows: [
        {
          id: 'u-clean',
          engagement_status: 'active',
          ai_context: { reengagement: { sent_moves: [] } },
        },
      ],
      lastActiveByUser: new Map([['u-clean', TODAY_ISO]]),
      now: NOW,
    });

    expect(result.reactivated).toBe(0);
    expect(result.updated).toBe(0);
    expect(updates).toHaveLength(0);
  });
});
