import { describe, expect, it } from 'vitest';
import {
  buildTranscriptAccessInsight,
  buildTranscriptAccessTimeline,
} from '../lib/admin/transcript-access-timeline';

const BASE_REQUEST = {
  id: 'req-1',
  session_id: 'sess-1',
  status: 'pending' as const,
  reason: 'בדיקת תקלה בתמיכה',
  created_at: '2026-08-18T10:00:00.000Z',
  expires_at: '2026-08-21T10:00:00.000Z',
  resolved_at: null,
  access_until: null,
  notification_sent_at: '2026-08-18T10:01:00.000Z',
  user_viewed_at: null,
  user_response_note: null,
};

describe('buildTranscriptAccessTimeline', () => {
  it('shows pending flow with active waiting step', () => {
    const steps = buildTranscriptAccessTimeline(BASE_REQUEST, Date.parse('2026-08-18T12:00:00.000Z'));
    expect(steps.map((s) => s.key)).toEqual([
      'created',
      'notification',
      'viewed',
      'waiting',
    ]);
    expect(steps[0]?.status).toBe('done');
    expect(steps[3]?.status).toBe('active');
  });

  it('shows approved final step', () => {
    const steps = buildTranscriptAccessTimeline({
      ...BASE_REQUEST,
      status: 'approved',
      resolved_at: '2026-08-18T14:00:00.000Z',
      access_until: '2026-08-19T14:00:00.000Z',
      user_viewed_at: '2026-08-18T11:00:00.000Z',
    });
    expect(steps.at(-1)?.key).toBe('approved');
    expect(steps.at(-1)?.status).toBe('done');
  });
});

describe('buildTranscriptAccessInsight', () => {
  it('warns when user has not viewed after several hours', () => {
    const insight = buildTranscriptAccessInsight(BASE_REQUEST, Date.parse('2026-08-18T16:00:00.000Z'));
    expect(insight?.tone).toBe('warning');
    expect(insight?.text).toMatch(/טרם פתח/);
  });
});
