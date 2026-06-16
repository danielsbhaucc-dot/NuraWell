import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearChatInputDraft,
  draftKeyForSession,
  migrateChatInputDraft,
  readChatInputDraft,
  writeChatInputDraft,
} from '../lib/client/chat-input-draft';

describe('chat input draft persistence', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
  });

  it('uses compose key before session exists', () => {
    expect(draftKeyForSession(null)).toBe('__compose__');
  });

  it('persists and restores draft per session', () => {
    writeChatInputDraft('session-a', 'שלום, רציתי לשאול');
    expect(readChatInputDraft('session-a')).toBe('שלום, רציתי לשאול');
    expect(readChatInputDraft('session-b')).toBe('');
  });

  it('clears draft after send', () => {
    writeChatInputDraft('session-a', 'טיוטה');
    clearChatInputDraft('session-a');
    expect(readChatInputDraft('session-a')).toBe('');
  });

  it('migrates draft when session id arrives from server', () => {
    writeChatInputDraft(null, 'הודעה חלקית');
    migrateChatInputDraft(null, 'new-session');
    expect(readChatInputDraft(null)).toBe('');
    expect(readChatInputDraft('new-session')).toBe('הודעה חלקית');
  });
});
