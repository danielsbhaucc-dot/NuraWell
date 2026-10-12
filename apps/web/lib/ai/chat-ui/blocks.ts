/**
 * In-chat UI blocks (task-picker cards, quick-reply chips, "update my plan" proposals).
 *
 * Protocol (shared by server + client, no server-only imports):
 *  • The writer MAY end its reply with ONE raw marker:  ⟦NW_UI:{"chips":[..],"pick":"struggle"|"offer","do":[..]}⟧
 *    where "do" items are {t:"easier"|"harder",n} | {t:"habit",title,n?} | {t:"goal",text}  (n = 1-based plan number).
 *  • The server strips the raw marker from the stream, resolves it against the user's REAL plan/offers
 *    (the model never invents ids), and appends a resolved marker ⟦NW_UIR:{...}⟧ the widget renders.
 *  • Nothing is written to the DB here: proposals become buttons; the user confirms → existing owner-only routes.
 */

export const RAW_UI_OPEN = '⟦NW_UI:';
const CLOSE = '⟧';
const RAW_RE = /⟦NW_UI:([\s\S]*?)⟧/g;
const RESOLVED_RE = /⟦NW_UIR:([\s\S]*?)⟧/g;

export type UiTaskOption = { id: string; title: string; emoji: string | null };
export type UiProposal =
  | { kind: 'level'; assignmentId: string; direction: 'easier' | 'harder'; title: string }
  | { kind: 'habit'; title: string; replaces: string | null }
  | { kind: 'goal'; text: string };
export type ResolvedChatUi = {
  chips?: string[];
  pick?: { kind: 'struggle' | 'offer'; options: UiTaskOption[] };
  proposals?: UiProposal[];
};

export type RawChatUi = { chips: string[]; pick: 'struggle' | 'offer' | null; do: Array<Record<string, unknown>> };

const clean = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(/[⟦⟧\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';

export function parseRawChatUi(json: string): RawChatUi | null {
  let o: unknown;
  try {
    o = JSON.parse(json);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const r = o as Record<string, unknown>;
  const chips = Array.isArray(r.chips)
    ? [...new Set(r.chips.map((c) => clean(c, 40)).filter(Boolean))].slice(0, 4)
    : [];
  const pick = r.pick === 'struggle' || r.pick === 'offer' ? r.pick : null;
  const doItems = Array.isArray(r.do)
    ? r.do.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)).slice(0, 8)
    : [];
  return { chips, pick, do: doItems };
}

/** Streaming filter: holds back the raw marker (even split across chunks) and returns only visible text. */
export function createRawUiStreamFilter() {
  let pending = '';
  let capturing = false;
  let captured = '';
  let rawJson: string | null = null;
  return {
    push(chunk: string): string {
      let out = '';
      let buf = pending + chunk;
      pending = '';
      while (buf) {
        if (capturing) {
          const end = buf.indexOf(CLOSE);
          if (end === -1) {
            captured += buf;
            if (captured.length > 4000) { capturing = false; captured = ''; } // runaway → drop silently
            return out;
          }
          captured += buf.slice(0, end);
          if (rawJson == null) rawJson = captured;
          captured = '';
          capturing = false;
          buf = buf.slice(end + CLOSE.length);
          continue;
        }
        const at = buf.indexOf(RAW_UI_OPEN);
        if (at !== -1) {
          out += buf.slice(0, at);
          capturing = true;
          buf = buf.slice(at + RAW_UI_OPEN.length);
          continue;
        }
        // keep a tail that could be the start of the marker
        let hold = 0;
        for (let k = Math.min(RAW_UI_OPEN.length - 1, buf.length); k > 0; k -= 1) {
          if (RAW_UI_OPEN.startsWith(buf.slice(buf.length - k))) { hold = k; break; }
        }
        out += buf.slice(0, buf.length - hold);
        pending = buf.slice(buf.length - hold);
        return out;
      }
      return out;
    },
    /** End of stream: release any held non-marker tail. */
    flush(): string {
      const rest = capturing ? '' : pending;
      pending = '';
      return rest;
    },
    rawJson: () => rawJson,
  };
}

export function stripRawChatUi(text: string): string {
  if (!text) return text;
  return text.replace(RAW_RE, '').replace(/⟦NW_UI:[^⟧]*$/, '').trimEnd();
}

export function encodeResolvedChatUi(ui: ResolvedChatUi): string {
  return `⟦NW_UIR:${JSON.stringify(ui)}⟧`;
}

export function hasResolvedContent(ui: ResolvedChatUi): boolean {
  return Boolean(ui.chips?.length || ui.pick?.options.length || ui.proposals?.length);
}

export function extractResolvedChatUi(text: string): ResolvedChatUi | null {
  if (!text) return null;
  RESOLVED_RE.lastIndex = 0;
  let last: ResolvedChatUi | null = null;
  let m: RegExpExecArray | null;
  while ((m = RESOLVED_RE.exec(text)) != null) {
    try {
      const v = JSON.parse(m[1]!) as ResolvedChatUi;
      if (v && typeof v === 'object') last = v;
    } catch {
      /* ignore */
    }
  }
  return last;
}

/** Display: remove every UI marker (raw or resolved, incl. an unfinished tail while streaming). */
export function stripAllChatUiMarkers(text: string): string {
  if (!text) return text;
  return text
    .replace(RAW_RE, '')
    .replace(RESOLVED_RE, '')
    .replace(/⟦NW_UIR?:[^⟧]*$/, '')
    .trimEnd();
}

type PlanLike = {
  id: string;
  status: string;
  canStepDown: boolean;
  canStepUp: boolean;
  level: { title: string };
  definition: { emoji: string | null; id?: string };
};
type OfferLike = { definition_id: string; definition: { title: string; emoji: string | null } };

/** Server-side: map the model's intent onto the user's real tasks. Unknown numbers/ids are dropped. */
export function resolveChatUi(raw: RawChatUi, plan: PlanLike[], offers: OfferLike[] = []): ResolvedChatUi {
  const out: ResolvedChatUi = {};
  if (raw.chips.length) out.chips = raw.chips;
  const active = plan.filter((t) => t.status === 'accepted');
  if (raw.pick === 'struggle' && active.length) {
    out.pick = {
      kind: 'struggle',
      options: active.slice(0, 6).map((t) => ({ id: t.id, title: t.level.title, emoji: t.definition.emoji ?? null })),
    };
  } else if (raw.pick === 'offer' && offers.length) {
    out.pick = {
      kind: 'offer',
      options: offers.slice(0, 6).map((o) => ({ id: o.definition_id, title: o.definition.title, emoji: o.definition.emoji ?? null })),
    };
  }
  const proposals: UiProposal[] = [];
  const byNum = (n: unknown) => (typeof n === 'number' && Number.isInteger(n) && n >= 1 ? plan[n - 1] : undefined);
  for (const d of raw.do) {
    if (proposals.length >= 3) break;
    if (d.t === 'easier' || d.t === 'harder') {
      const t = byNum(d.n);
      if (!t || t.status !== 'accepted') continue;
      if (d.t === 'easier' ? !t.canStepDown : !t.canStepUp) continue;
      if (proposals.some((p) => p.kind === 'level' && p.assignmentId === t.id)) continue;
      proposals.push({ kind: 'level', assignmentId: t.id, direction: d.t, title: t.level.title });
    } else if (d.t === 'habit') {
      const title = clean(d.title, 120);
      if (title.length < 4) continue;
      proposals.push({ kind: 'habit', title, replaces: byNum(d.n)?.level.title ?? null });
    } else if (d.t === 'goal') {
      const text = clean(d.text, 160);
      if (text.length < 4) continue;
      if (!proposals.some((p) => p.kind === 'goal')) proposals.push({ kind: 'goal', text });
    }
  }
  if (proposals.length) out.proposals = proposals;
  return out;
}

/** Compact writer instruction (kept short on purpose — tokens). */
export const CHAT_UI_PROMPT = [
  '[כרטיסים בצ׳אט — אופציונלי, רק כשבאמת עוזר]',
  'בסוף התשובה (אחרי כל הטקסט) מותר להוסיף שורה אחת בדיוק בפורמט: ⟦NW_UI:{json}⟧. המשתמש לא רואה אותה; היא הופכת לכפתורים.',
  '- "chips": עד 4 תשובות קצרות שהמשתמש עשוי לרצות לשלוח (בגוף ראשון של המשתמש, עד 5 מילים). רק כששאלת שאלה עם כמה תשובות ברורות.',
  '- "pick":"struggle" — כשהמשתמש אומר שקשה לו ולא ברור באיזו משימה מדובר. "pick":"offer" — כשמציעים לו לבחור משימה מהשיעור.',
  '- "do": שינויים שסיכמתם עכשיו במפורש, לאישור בלחיצה: {"t":"easier","n":מספר משימה} / {"t":"harder","n":..} / {"t":"habit","title":"הרגל חלופי או משימה חדשה","n":מספר המשימה שהוא מחליף אם יש} / {"t":"goal","text":"המטרה החדשה"}.',
  'אל תכתוב שהשינוי כבר בוצע — כתוב שאפשר לאשר בכפתור. בלי JSON בתוך הטקסט עצמו. ברוב התשובות אין צורך בשורה הזו.',
].join('\n');
