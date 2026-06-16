import { describe, expect, it } from 'vitest';

import {
  isChatSessionStale,
  resolveSessionLastActivity,
  STALE_CHAT_SESSION_MS,
} from '../lib/ai/chat-sessions/auto-close-stale-sessions';

describe('chat session stale detection', () => {
  const now = new Date('2026-06-16T12:00:00.000Z');

  it('marks session stale after 12 hours of inactivity', () => {
    const last = new Date(now.getTime() - STALE_CHAT_SESSION_MS - 1_000).toISOString();
    expect(isChatSessionStale(last, now.getTime())).toBe(true);
  });

  it('keeps active session open under 12 hours', () => {
    const last = new Date(now.getTime() - STALE_CHAT_SESSION_MS + 60_000).toISOString();
    expect(isChatSessionStale(last, now.getTime())).toBe(false);
  });

  it('uses latest of session update and last interaction', () => {
    const resolved = resolveSessionLastActivity({
      sessionUpdatedAt: '2026-06-15T08:00:00.000Z',
      lastInteractionAt: '2026-06-16T11:30:00.000Z',
    });
    expect(resolved).toBe('2026-06-16T11:30:00.000Z');
  });

  it('falls back to session updated_at when no interactions', () => {
    const resolved = resolveSessionLastActivity({
      sessionUpdatedAt: '2026-06-16T10:00:00.000Z',
      lastInteractionAt: null,
    });
    expect(resolved).toBe('2026-06-16T10:00:00.000Z');
  });
});

describe('chat session client state flow', () => {
  type SessionState = { id: string; status: 'open' | 'closed'; summary: string | null };

  function applyClose(session: SessionState, summary: string): SessionState {
    return { ...session, status: 'closed', summary };
  }

  function applyReopen(session: SessionState): SessionState {
    return { ...session, status: 'open' };
  }

  function applyNewSession(): SessionState {
    return { id: 'new-session', status: 'open', summary: null };
  }

  function canSendMessage(session: SessionState, isClosing: boolean): boolean {
    return session.status === 'open' && !isClosing;
  }

  it('transitions open → closed on end chat', () => {
    const open: SessionState = { id: 's1', status: 'open', summary: null };
    const closed = applyClose(open, 'סיכום קצר');
    expect(closed.status).toBe('closed');
    expect(closed.summary).toBe('סיכום קצר');
    expect(canSendMessage(closed, false)).toBe(false);
  });

  it('reopens closed session', () => {
    const closed: SessionState = { id: 's1', status: 'closed', summary: 'סיכום' };
    const reopened = applyReopen(closed);
    expect(reopened.status).toBe('open');
    expect(canSendMessage(reopened, false)).toBe(true);
  });

  it('start new chat resets to open empty session', () => {
    const next = applyNewSession();
    expect(next.status).toBe('open');
    expect(next.summary).toBeNull();
  });

  it('blocks input while closing even if still open', () => {
    const open: SessionState = { id: 's1', status: 'open', summary: null };
    expect(canSendMessage(open, true)).toBe(false);
    expect(canSendMessage(open, false)).toBe(true);
  });
});
