import { describe, expect, it } from 'vitest';

import { buildChatSessionListTitle } from '../lib/ai/chat-sessions/session-list-title';
import {
  buildInboxFolderChips,
  buildInboxStats,
  filterInboxSessions,
  groupInboxSessions,
  isSessionToday,
  sessionMatchesSearch,
} from '../lib/client/chat-session-inbox-organize';
import { detectSessionTopic, groupSessionsByTopic } from '../lib/client/chat-session-topics';
import { isAwaitingAssistantResponse } from '../lib/client/chat-awaiting-assistant';
import { transcriptTurnsToUiMessages } from '../lib/client/chat-session-messages';

const NOW = new Date('2026-06-16T15:00:00.000Z');

const sampleSessions = [
  {
    id: 'open-1',
    status: 'open' as const,
    summary: null,
    created_at: '2026-06-16T08:00:00.000Z',
    updated_at: '2026-06-16T14:00:00.000Z',
    preview_text: 'קשה לי היום',
    message_count: 4,
  },
  {
    id: 'closed-today',
    status: 'closed' as const,
    summary: 'דיברנו על מים בבוקר',
    created_at: '2026-06-16T09:00:00.000Z',
    updated_at: '2026-06-16T10:00:00.000Z',
    preview_text: 'רוצה להתחיל עם מים',
    message_count: 8,
  },
  {
    id: 'archive',
    status: 'closed' as const,
    summary: null,
    created_at: '2026-05-01T09:00:00.000Z',
    updated_at: '2026-05-02T10:00:00.000Z',
    preview_text: 'שיחה ישנה',
    message_count: 2,
  },
];

describe('buildChatSessionListTitle', () => {
  it('prefers AI summary for closed sessions', () => {
    const title = buildChatSessionListTitle({
      summary: 'דיברנו על דפוסי אכילה בערב ועל צעד קטן למים',
      preview_text: 'קשה לי היום',
      created_at: '2026-06-10T10:00:00.000Z',
    });
    expect(title).toContain('דפוסי אכילה');
  });
});

describe('chat inbox organization', () => {
  it('builds stats and folder chips including topics', () => {
    const stats = buildInboxStats(sampleSessions, NOW);
    expect(stats.total).toBe(3);

    const chips = buildInboxFolderChips(sampleSessions, buildChatSessionListTitle, NOW);
    expect(chips.find((c) => c.id === 'open')?.count).toBe(1);
    expect(chips.some((c) => c.kind === 'topic' && c.count > 0)).toBe(true);
  });

  it('groups sessions by topic in all view', () => {
    const groups = groupInboxSessions(sampleSessions, buildChatSessionListTitle, '', NOW);
    expect(groups.some((g) => g.id === 'open')).toBe(true);
    expect(groups.some((g) => g.kind === 'topic')).toBe(true);
  });

  it('filters by topic folder', () => {
    const habitsSession = {
      ...sampleSessions[1]!,
      id: 'habits',
      summary: 'התמדה עם שתיית מים',
    };
    const topic = detectSessionTopic(habitsSession, buildChatSessionListTitle(habitsSession));
    expect(topic).toBe('habits');

    const results = filterInboxSessions(
      [habitsSession],
      'habits',
      '',
      buildChatSessionListTitle,
      NOW
    );
    expect(results).toHaveLength(1);
  });

  it('filters by search query', () => {
    const results = filterInboxSessions(
      sampleSessions,
      'all',
      'מים',
      buildChatSessionListTitle,
      NOW
    );
    expect(results).toHaveLength(1);
    expect(
      sessionMatchesSearch(sampleSessions[1]!, 'מים', buildChatSessionListTitle(sampleSessions[1]!))
    ).toBe(true);
  });

  it('detects sessions updated today', () => {
    const now = new Date();
    const todayNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
    const yesterdayNoon = new Date(todayNoon.getTime() - 24 * 60 * 60 * 1000);
    expect(isSessionToday(todayNoon.toISOString(), todayNoon)).toBe(true);
    expect(isSessionToday(yesterdayNoon.toISOString(), todayNoon)).toBe(false);
  });
});

describe('chat session topics', () => {
  it('groups by Hebrew keywords', () => {
    const sessions = [
      {
        id: 's1',
        status: 'closed' as const,
        summary: 'עבדנו על הרגל שתיית מים',
        created_at: '2026-06-01T10:00:00.000Z',
        updated_at: '2026-06-01T11:00:00.000Z',
        preview_text: 'מים',
        message_count: 3,
      },
      {
        id: 's2',
        status: 'closed' as const,
        summary: 'שיחה רגשית על לחץ',
        created_at: '2026-06-02T10:00:00.000Z',
        updated_at: '2026-06-02T11:00:00.000Z',
        preview_text: 'קשה',
        message_count: 5,
      },
    ];
    const groups = groupSessionsByTopic(sessions, buildChatSessionListTitle);
    expect(groups.map((g) => g.id)).toEqual(['habits', 'emotions']);
  });
});

describe('isAwaitingAssistantResponse', () => {
  it('is true when last turn is from user', () => {
    expect(
      isAwaitingAssistantResponse([{ role: 'user', content: 'היי', created_at: 't1' }])
    ).toBe(true);
  });
});
