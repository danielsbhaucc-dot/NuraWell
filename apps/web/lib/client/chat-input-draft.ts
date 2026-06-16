export const CHAT_INPUT_DRAFTS_KEY = 'nurawell_almog_chat_drafts';

const COMPOSE_WITHOUT_SESSION_KEY = '__compose__';

function readAllDrafts(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(CHAT_INPUT_DRAFTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const drafts: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.length > 0) {
        drafts[key] = value;
      }
    }
    return drafts;
  } catch {
    return {};
  }
}

function writeAllDrafts(drafts: Record<string, string>): void {
  try {
    if (!Object.keys(drafts).length) {
      sessionStorage.removeItem(CHAT_INPUT_DRAFTS_KEY);
      return;
    }
    sessionStorage.setItem(CHAT_INPUT_DRAFTS_KEY, JSON.stringify(drafts));
  } catch {
    /* */
  }
}

export function draftKeyForSession(sessionId: string | null): string {
  return sessionId ?? COMPOSE_WITHOUT_SESSION_KEY;
}

export function readChatInputDraft(sessionId: string | null): string {
  const drafts = readAllDrafts();
  return drafts[draftKeyForSession(sessionId)] ?? '';
}

export function writeChatInputDraft(sessionId: string | null, text: string): void {
  const key = draftKeyForSession(sessionId);
  const drafts = readAllDrafts();
  if (!text) {
    delete drafts[key];
  } else {
    drafts[key] = text;
  }
  writeAllDrafts(drafts);
}

export function clearChatInputDraft(sessionId: string | null): void {
  writeChatInputDraft(sessionId, '');
}

/** מעביר טיוטה ממפתח זמני (לפני קבלת session-id) לסשן שנוצר */
export function migrateChatInputDraft(
  fromSessionId: string | null,
  toSessionId: string
): void {
  const fromKey = draftKeyForSession(fromSessionId);
  const toKey = draftKeyForSession(toSessionId);
  if (fromKey === toKey) return;

  const drafts = readAllDrafts();
  const text = drafts[fromKey];
  if (!text) return;

  drafts[toKey] = text;
  delete drafts[fromKey];
  writeAllDrafts(drafts);
}
