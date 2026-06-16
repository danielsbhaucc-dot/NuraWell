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

  it('falls back to preview text', () => {
    const title = buildChatSessionListTitle({
      summary: null,
      preview_text: 'רוצה להתחיל עם שתיית מים בבוקר',
      created_at: '2026-06-10T10:00:00.000Z',
    });
    expect(title).toContain('מים');
  });
});

describe('chat inbox organization', () => {
  it('builds stats and folder chips', () => {
    const stats = buildInboxStats(sampleSessions, NOW);
    expect(stats.total).toBe(3);
    expect(stats.open).toBe(1);
    expect(stats.withSummary).toBe(1);

    const chips = buildInboxFolderChips(sampleSessions, NOW);
    expect(chips.find((c) => c.id === 'open')?.count).toBe(1);
    expect(chips.find((c) => c.id === 'summary')?.count).toBe(1);
  });

  it('groups sessions into automatic folders', () => {
    const groups = groupInboxSessions(sampleSessions, buildChatSessionListTitle, '', NOW);
    expect(groups.map((g) => g.id)).toEqual(['open', 'today', 'archive']);
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
    expect(results[0]?.id).toBe('closed-today');
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

describe('transcriptTurnsToUiMessages', () => {
  it('maps turns to useChat-compatible messages', () => {
    const msgs = transcriptTurnsToUiMessages([
      { role: 'user', content: 'היי', created_at: '2026-06-10T10:00:00.000Z' },
      { role: 'assistant', content: 'שלום', created_at: '2026-06-10T10:01:00.000Z' },
    ]);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]?.role).toBe('user');
    expect(msgs[1]?.parts[0]?.text).toBe('שלום');
  });
});

describe('isAwaitingAssistantResponse', () => {
  it('is true when last turn is from user', () => {
    expect(
      isAwaitingAssistantResponse([
        { role: 'user', content: 'היי', created_at: 't1' },
      ])
    ).toBe(true);
  });

  it('is false when assistant already replied', () => {
    expect(
      isAwaitingAssistantResponse([
        { role: 'user', content: 'היי', created_at: 't1' },
        { role: 'assistant', content: 'שלום', created_at: 't2' },
      ])
    ).toBe(false);
  });
});
