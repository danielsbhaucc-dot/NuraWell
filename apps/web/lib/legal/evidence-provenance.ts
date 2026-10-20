/**
 * Pure helpers that turn stored evidence rows into "where did each value come from" provenance,
 * server-side corroboration and small raw-log excerpts for the owner-only legal report.
 */
import { canonicalJson, sha256Hex } from './evidence-crypto';

export type ProvenanceRow = { field: string; value: string; source: 'server' | 'browser' | 'header' | 'computed' | 'external'; how: string; mono?: boolean };
export type CorroborationRow = { source: string; at: string; line: string; link: 'evidence_id' | 'time_window' };
export type OtsStatusRow = { calendar: string; status: 'bitcoin' | 'pending'; height?: number | null };

type Rec = {
  id: string;
  payload_json: string;
  record_hash: string;
  prev_hash: string;
  created_at: string;
  rendered_sha256: string;
  typed_word: string;
  checkbox_checked: boolean;
  text_version: string;
  user_agent: string | null;
  session_id: string | null;
  device_id: string | null;
  screenshot_sha256: string | null;
  screenshot_storage?: string | null;
  screenshot_bytes?: number | null;
  action: string;
  source: string;
};
type Att = { id?: number; record_id: string | null; kind: string; payload: Record<string, unknown>; created_at: string };
type Audit = { created_at: string; path: string; method?: string; detail?: unknown; id?: unknown };

export const SOURCE_HE: Record<ProvenanceRow['source'], string> = {
  server: 'השרת',
  browser: 'הדפדפן',
  header: 'כותרת רשת',
  computed: 'חישוב השרת',
  external: 'גורם חיצוני',
};

export function tsaName(url: string | undefined | null): string {
  if (!url) return '—';
  const h = (() => { try { return new URL(url).hostname; } catch { return url; } })();
  if (h.includes('freetsa')) return 'FreeTSA (freetsa.org, גרמניה)';
  if (h.includes('digicert')) return 'DigiCert Timestamp Authority';
  return h;
}

export function payloadOf(r: Rec): Record<string, unknown> {
  try { return JSON.parse(r.payload_json) as Record<string, unknown>; } catch { return {}; }
}

/** Neighbors in this user's chain: previous and next record hashes. */
export function chainNeighbors(all: Rec[], idx: number) {
  return { position: idx + 1, total: all.length, prevHash: all[idx]!.prev_hash, nextHash: all[idx + 1]?.record_hash ?? null };
}

export function buildProvenance(r: Rec, ip: string | null, shotShaComputed: string | null, tsa: { url?: string; genTime?: string | null }): ProvenanceRow[] {
  const p = payloadOf(r);
  const rows: ProvenanceRow[] = [
    { field: 'זמן האירוע', value: r.created_at, source: 'server', how: 'שעון השרת (UTC) ברגע קבלת הבקשה. לא נלקח מהמכשיר.', mono: true },
    { field: 'זמן מאושר חיצונית', value: tsa.genTime ?? '—', source: 'external', how: `נקבע בידי ${tsaName(tsa.url)} לפי RFC 3161, על גיבוב הרשומה.`, mono: true },
    { field: 'פעולה', value: r.action, source: 'browser', how: 'נשלחה בגוף הבקשה. השרת בדק שהיא grant או withdraw.', mono: true },
    { field: 'מילה שהוקלדה', value: `"${r.typed_word}"`, source: 'browser', how: 'נקלטה בשרת מגוף הבקשה ונבדקה מול המילה הנדרשת לפני השמירה. נשמרה בנפרד מהצילום.' },
    { field: 'תיבת אישור', value: r.checkbox_checked ? 'סומנה (true)' : 'לא סומנה', source: 'browser', how: 'נקלטה בשרת מגוף הבקשה. השרת דוחה בקשה בלי סימון.' },
    { field: 'גרסת נוסח', value: r.text_version, source: 'server', how: 'השרת דוחה גרסה שאינה הגרסה הנוכחית שלו.', mono: true },
    { field: 'גיבוב הנוסח שהוצג', value: r.rendered_sha256, source: 'computed', how: 'השרת יצר את הנוסח בעצמו מהתבנית שלו וגיבב אותו. לא הועתק מהמכשיר.', mono: true },
  ];
  if (typeof p.consent_text_sha256 === 'string') rows.push({ field: 'גיבוב טקסט ההסכמה', value: p.consent_text_sha256, source: 'computed', how: 'גיבוב הכותרת, הגוף והמילה הנדרשת בגרסה זו.', mono: true });
  rows.push(
    { field: 'כתובת IP', value: ip ?? '—', source: 'header', how: 'נלקחה מכותרת x-real-ip שקובעת תשתית Vercel. נשמרת מוצפנת ופוענחה רק לצורך הפקה זו.', mono: true },
    { field: 'דפדפן ומכשיר', value: r.user_agent ?? '—', source: 'header', how: 'כותרת User-Agent שהדפדפן שלח. מצהירה, לא מאומתת.', mono: true },
    { field: 'מזהה התחברות', value: r.session_id ?? '—', source: 'server', how: 'נלקח מאסימון ההתחברות שהשרת אימת (Supabase Auth). מוכיח שהבקשה הגיעה מהחשבון המחובר.', mono: true },
    { field: 'מזהה מכשיר', value: r.device_id ?? '—', source: 'computed', how: 'גיבוב של עוגיית המכשיר nw_dev.', mono: true },
    { field: 'מזהה בקשה', value: typeof p.request_id === 'string' ? p.request_id : 'לא נשמר ברשומה זו', source: 'header', how: 'x-vercel-id, לצורך הצלבה מול יומני הפלטפורמה.', mono: typeof p.request_id === 'string' },
    { field: 'צילום החלון', value: r.screenshot_sha256 ?? 'אין', source: 'browser', how: 'צולם בדפדפן ברגע האישור. השרת המיר אותו מחדש, חישב את הגיבוב ונעל אותו בתוך הרשומה החתומה.', mono: !!r.screenshot_sha256 },
  );
  const cm = p.client && typeof p.client === 'object' ? (p.client as Record<string, unknown>) : null;
  if (cm) {
    const num = (k: string) => (typeof cm[k] === 'number' ? String(cm[k]) : '?');
    rows.push(
      { field: 'זמן הצילום במכשיר', value: typeof cm.captured_at === 'string' ? cm.captured_at : '—', source: 'browser', how: `שעון המכשיר ברגע הצילום${typeof cm.tz === 'string' ? ` (אזור זמן ${cm.tz})` : ''}. משמש להצלבה מול זמן השרת.`, mono: true },
      { field: 'גודל מסך', value: `screen ${num('screen_w')}x${num('screen_h')} | viewport ${num('viewport_w')}x${num('viewport_h')} | dpr ${num('dpr')}`, source: 'browser', how: 'מידות המסך והחלון שהדפדפן דיווח. אמורות להתאים למידות הצילום.', mono: true },
      { field: 'זמן הקלדת המילה', value: typeof cm.typing_ms === 'number' ? `${(cm.typing_ms / 1000).toFixed(1)} שניות` : '—', source: 'browser', how: 'מההקשה הראשונה ועד האחרונה בשדה המילה. מראה שהמילה הוקלדה ולא הודבקה מראש.' },
    );
  }
  if (r.screenshot_sha256) rows.push({ field: 'גיבוב הקובץ השמור היום', value: shotShaComputed ?? 'הקובץ לא נטען', source: 'computed', how: shotShaComputed === r.screenshot_sha256 ? 'חושב עכשיו מהקובץ באחסון. זהה לגיבוב החתום.' : 'לא זהה או לא נטען.', mono: !!shotShaComputed });
  return rows;
}

/** Records written by other code paths in the same request (separate tables), near the event time. */
type ConsentRow = { created_at: string; granted: boolean; source?: string | null; policy_version?: string | null; evidence_id?: string | null; request_id?: string | null };
const linkedId = (d: unknown): string | null => (d && typeof d === 'object' && typeof (d as { evidence_id?: unknown }).evidence_id === 'string' ? (d as { evidence_id: string }).evidence_id : null);

/**
 * Rows written by other code paths in the same request. Rows that store evidence_id are linked
 * directly; older rows without it fall back to a time window around the event.
 */
export function corroboration(r: Rec, audit: Audit[], consents: ConsentRow[], windowMs = 120_000): CorroborationRow[] {
  const t = new Date(r.created_at).getTime();
  const near = (iso: string) => Math.abs(new Date(iso).getTime() - t) <= windowMs && new Date(iso).getTime() >= t - 5_000;
  const want = r.action === 'grant' ? 'health_consent_granted' : 'health_consent_withdrawn';
  const out: CorroborationRow[] = [];
  const match = (id: string | null | undefined, at: string, ok: boolean): CorroborationRow['link'] | null => (id ? (id === r.id ? 'evidence_id' : null) : ok && near(at) ? 'time_window' : null);
  for (const c of consents) {
    const link = match(c.evidence_id, c.created_at, c.granted === (r.action === 'grant'));
    if (link) out.push({ source: 'consent_history', at: c.created_at, link, line: canonicalJson({ granted: c.granted, source: c.source ?? null, policy_version: c.policy_version ?? null, evidence_id: c.evidence_id ?? null, request_id: c.request_id ?? null }) });
  }
  for (const a of audit) {
    const link = match(linkedId(a.detail), a.created_at, a.path === want);
    if (link) out.push({ source: 'admin_audit_log', at: a.created_at, link, line: canonicalJson({ method: a.method ?? null, path: a.path, detail: a.detail ?? null }) });
  }
  return out;
}

export function otsStatus(recordId: string, att: Att[]): OtsStatusRow[] {
  const ots = att.find((a) => a.record_id === recordId && a.kind === 'ots');
  const proofs = (ots?.payload.proofs as Array<{ calendar: string }> | undefined) ?? [];
  const ups = att.filter((a) => a.kind === 'ots_upgrade' && (a.payload.source_attestation_id === ots?.id));
  return proofs.map((p) => {
    const host = (() => { try { return new URL(p.calendar).hostname; } catch { return p.calendar; } })();
    const u = ups.find((x) => x.payload.calendar === p.calendar);
    return u ? { calendar: host, status: 'bitcoin', height: (u.payload.bitcoin_height as number | null) ?? null } : { calendar: host, status: 'pending' };
  });
}

/** JSON with non-ASCII escaped (\\uXXXX) so a Latin mono font can print it; parses to the identical object. */
export function asciiJson(s: string): string {
  return s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

export function checkAsciiJsonEquivalent(original: string): boolean {
  return canonicalJson(JSON.parse(asciiJson(original))) === original && sha256Hex(original).length === 64;
}
