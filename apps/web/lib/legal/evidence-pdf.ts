import 'server-only';
/**
 * Hebrew RTL legal evidence report (PDF) for one user's consent events.
 * pdf-lib + embedded Rubik/Assistant; bidi reordering per line (bidi-js).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, rgb, StandardFonts, PDFString, type PDFFont, type PDFPage, type PDFImage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import bidiFactory from 'bidi-js';
import { verifyCode } from './verify-code';
import { asciiJson, SOURCE_HE, type CorroborationRow, type OtsStatusRow, type ProvenanceRow } from './evidence-provenance';

const bidi = bidiFactory();
export const W = 595.28;
export const H = 841.89;
export const M = 44;

export const C = {
  ink: rgb(0.12, 0.17, 0.15),
  muted: rgb(0.38, 0.44, 0.41),
  emerald: rgb(0.02, 0.59, 0.41),
  teal: rgb(0.05, 0.58, 0.58),
  gold: rgb(0.79, 0.62, 0.24),
  goldSoft: rgb(0.99, 0.95, 0.85),
  mint: rgb(0.93, 0.98, 0.95),
  card: rgb(0.985, 0.98, 0.96),
  line: rgb(0.88, 0.86, 0.8),
  rose: rgb(0.8, 0.2, 0.3),
  white: rgb(1, 1, 1),
};

export function visual(text: string): string {
  const t = text.replace(/\s+/g, ' ');
  const levels = bidi.getEmbeddingLevels(t, 'rtl');
  const chars = t.split('');
  for (const [start, end] of bidi.getReorderSegments(t, levels)) {
    const seg = chars.slice(start, end + 1).reverse();
    chars.splice(start, seg.length, ...seg);
  }
  const out = chars.join('');
  // reordering leaves bracket glyphs facing the wrong way inside RTL lines: flip them
  return /[\u0590-\u05FF]/.test(t) ? out.replace(/[()\[\]]/g, (c) => ({ '(': ')', ')': '(', '[': ']', ']': '[' })[c]!) : out;
}

const HEB = /[\u0590-\u05FF]/;
/** Draws an already-visual-order string run by run: fontkit reverses Hebrew-script runs itself. */
function drawVisual(page: PDFPage, v: string, x: number, y: number, size: number, font: PDFFont, color: ReturnType<typeof rgb>) {
  const runs = v.match(/[\u0590-\u05FF\s'"״׳,.:\-]*[\u0590-\u05FF][\u0590-\u05FF\s'"״׳,.:\-]*|[^\u0590-\u05FF]+/g) ?? [];
  let cx = x;
  for (const r of runs) {
    const draw = HEB.test(r) ? r.split('').reverse().join('') : r;
    page.drawText(draw, { x: cx, y, size, font, color });
    cx += font.widthOfTextAtSize(r, size);
  }
}

export type Fonts = { head: PDFFont; headBold: PDFFont; body: PDFFont; bold: PDFFont; mono: PDFFont };

export async function loadFonts(doc: PDFDocument): Promise<Fonts> {
  doc.registerFontkit(fontkit);
  const dir = path.join(process.cwd(), 'lib/legal/fonts');
  const f = async (n: string) => doc.embedFont(await readFile(path.join(dir, n)), { subset: true });
  return {
    head: await f('Rubik-Medium.ttf'),
    headBold: await f('Rubik-Bold.ttf'),
    body: await f('Assistant-Regular.ttf'),
    bold: await f('Assistant-Bold.ttf'),
    mono: await doc.embedFont(StandardFonts.Courier),
  };
}

function wrap(text: string, font: PDFFont, size: number, max: number): string[] {
  const out: string[] = [];
  for (const para of String(text ?? '').split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > max && line) {
        out.push(line);
        line = w;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

function hardWrapMono(s: string, font: PDFFont, size: number, max: number): string[] {
  const per = Math.max(8, Math.floor(max / font.widthOfTextAtSize('0', size)));
  const out: string[] = [];
  for (let i = 0; i < s.length; i += per) out.push(s.slice(i, i + per));
  return out.length ? out : [''];
}

export type PdfEvent = {
  index: number;
  reference: string;
  createdAt: string;
  action: 'grant' | 'withdraw';
  source: string;
  textVersion: string;
  displayedText: string[];
  typedWord: string;
  checkbox: boolean;
  ip: string | null;
  ipHash: string | null;
  userAgent: string | null;
  sessionId: string | null;
  deviceId: string | null;
  recordHash: string;
  prevHash: string;
  renderedSha: string;
  screenshotSha: string | null;
  screenshotPng: Buffer | null;
  signature: string;
  keyId: string;
  tsa: { ok: boolean; genTime: string | null; url?: string; tokenSha?: string };
  otsCalendars: string[];
  emailReceipt: { ok: boolean; reference?: string; sentAt?: string } | null;
  checks: { label: string; ok: boolean | null }[];
  /** v2 report extras (all optional so older callers keep working). */
  screenshotShaComputed?: string | null;
  /** Segments 2..n of a full-sheet scroll capture, in signed order. */
  screenshotSegments?: Array<{ i: number; sha256: string; computed: string | null; png: Buffer | null }>;
  provenance?: ProvenanceRow[];
  corroboration?: CorroborationRow[];
  canonicalJson?: string;
  neighbors?: { position: number; total: number; prevHash: string; nextHash: string | null };
  otsStatus?: OtsStatusRow[];
  tsaName?: string;
};

export type PdfInput = {
  caseRef: string;
  generatedAt: string;
  generatedBy: string;
  user: { name: string; email: string; id: string; createdAt: string | null };
  events: PdfEvent[];
  overallOk: boolean;
  publicKeyPem: string;
  accessLog: { at: string; actor: string; action: string }[];
  chainAnchors: { at: string; head: string; count: number; tsa: boolean; ots: number }[];
  publicKeyFingerprint?: string;
  publicKeyUrl?: string;
  tsaName?: string;
  /** Provider log pulls attached to this case, if any (on-demand). Anything not 'ok' is flagged. */
  providerLogs?: Array<{ provider: string; status: string; note?: string }>;
};

export type Issue = { level: 'fail' | 'warn'; key: string; title: string; meaning: string; events: number[] };

/**
 * Every failed or incomplete check, grouped by kind, with the event numbers it affects. The PDF
 * puts these on page 1 in red. Nothing here is ever filtered out.
 */
export function findIssues(input: Pick<PdfInput, 'events' | 'providerLogs'>): Issue[] {
  const map = new Map<string, Issue>();
  const add = (key: string, level: Issue['level'], title: string, meaning: string, n?: number) => {
    const it = map.get(key) ?? { level, key, title, meaning, events: [] };
    if (n !== undefined && !it.events.includes(n)) it.events.push(n);
    map.set(key, it);
  };
  input.events.forEach((e, i) => {
    const n = i + 1;
    const ck = (label: string) => e.checks.find((c) => c.label === label)?.ok;
    if (ck('חתימה') === false) add('signature', 'fail', 'החתימה הדיגיטלית לא תואמת לרשומה', 'תוכן הרשומה שונה אחרי שנחתם, או שנחתם במפתח אחר. אי אפשר להסתמך על התוכן הזה כפי שהוא, וצריך לבדוק מה שונה ומתי.', n);
    if (ck('שרשרת') === false) add('chain', 'fail', 'שרשרת הרשומות שבורה או שגיבוב הרשומה לא תואם', 'רשומה נמחקה, הוחלפה או שונתה באמצע הרצף. ייתכן שאירועים אחרים של המשתמש חסרים.', n);
    if (ck('נוסח') === false) add('snapshot', 'fail', 'הנוסח השמור לא תואם לגיבוב שנחתם', 'אי אפשר להראות בוודאות איזה נוסח הוצג למשתמש באירוע הזה.', n);
    if (!e.tsa.ok) add('tsa', 'fail', 'חותמת זמן חיצונית חסרה או לא תקינה', 'אין אישור של צד שלישי לשעה. זמן האירוע נשען רק על שעון השרת שלנו.', n);
    if (!e.screenshotSha) add('shot_missing', 'warn', 'אין צילום חלון לאירוע', 'מה שהמשתמש ראה מוכח רק מהנוסח השמור, בלי תמונה.', n);
    else if (e.screenshotShaComputed !== undefined && e.screenshotShaComputed === null) add('shot_gone', 'fail', 'קובץ הצילום חסר באחסון', 'הגיבוב נחתם, אבל הקובץ עצמו לא נמצא. אי אפשר להציג את התמונה.', n);
    else if (e.screenshotShaComputed && e.screenshotShaComputed !== e.screenshotSha) add('shot_mismatch', 'fail', 'הצילום השמור לא תואם לגיבוב שנחתם', 'קובץ הצילום הוחלף או השתנה אחרי האירוע. התמונה שמוצגת אינה בהכרח מה שהמשתמש ראה.', n);
    for (const sg of e.screenshotSegments ?? []) {
      if (sg.computed === null) add('seg_gone', 'fail', 'חלק מצילום הגלילה חסר באחסון', 'רק חלק מהחלון מוצג. הגיבוב של החלק החסר נחתם, אבל הקובץ לא נמצא.', n);
      else if (sg.computed !== sg.sha256) add('seg_mismatch', 'fail', 'חלק מצילום הגלילה לא תואם לגיבוב שנחתם', 'אחד מחלקי הצילום הוחלף או השתנה אחרי האירוע.', n);
    }
    const ots = e.otsStatus ?? [];
    if (!e.otsCalendars.length) add('ots_none', 'warn', 'אין עיגון ציבורי (OpenTimestamps)', 'חסרה שכבת הגנה אחת. החתימה וחותמת הזמן עדיין קיימות.', n);
    else if (ots.length && ots.every((o) => o.status !== 'bitcoin')) add('ots_pending', 'warn', 'העיגון בביטקוין עדיין ממתין לאישור', 'זה תקין באירועים מהימים האחרונים. אם זה נשאר כך יותר משבוע, צריך לבדוק.', n);
    if (e.emailReceipt && !e.emailReceipt.ok) add('email', 'warn', 'קבלת הדואר למשתמש לא נשלחה', 'אין עותק אצל צד שלישי (תיבת הדואר של המשתמש). הראיות האחרות לא נפגעות.', n);
    if (!e.emailReceipt) add('email_none', 'warn', 'אין תיעוד של קבלה בדואר', 'לא נשמר אישור שליחה מספק הדואר לאירוע הזה.', n);
  });
  for (const pl of input.providerLogs ?? []) {
    if (pl.status !== 'ok') add(`logs_${pl.provider}`, 'warn', `יומני ${pl.provider} לא זמינים`, pl.status === 'empty' ? 'הספק כבר לא שומר יומנים מהזמן הזה (תקופת השמירה הסתיימה).' : pl.status === 'not_configured' ? 'השליפה לא הוגדרה בשרת, ולכן לא נבדקו יומני הספק.' : `השליפה נכשלה${pl.note ? `: ${pl.note}` : ''}.`);
  }
  return [...map.values()].sort((a, b) => (a.level === b.level ? 0 : a.level === 'fail' ? -1 : 1));
}

export const fmt = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Jerusalem' }).format(new Date(iso)) + ' (שעון ישראל)' : '—';
const actionHe = (a: string) => (a === 'grant' ? 'מתן הסכמה' : 'ביטול הסכמה');
const sourceHe = (s: string) => ({ onboarding: 'הרשמה', settings_privacy: 'הגדרות פרטיות', chat: 'שיחה עם אלמוג', prompt: 'חלון בקשת הסכמה' })[s] ?? s;

export class Writer {
  page!: PDFPage;
  y = 0;
  pageNo = 0;
  constructor(private doc: PDFDocument, private f: Fonts, private caseRef: string, private header = 'NuraWell · תיק ראיות להסכמה') {}

  newPage(title?: string) {
    this.page = this.doc.addPage([W, H]);
    this.pageNo++;
    const p = this.page;
    p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(0.995, 0.993, 0.982) });
    p.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: C.emerald });
    p.drawRectangle({ x: 0, y: H - 6, width: W * 0.35, height: 6, color: C.teal });
    p.drawRectangle({ x: W * 0.8, y: H - 6, width: W * 0.2, height: 6, color: C.gold });
    this.text(this.header, { size: 8.5, color: C.muted, y: H - 24 });
    p.drawText(this.caseRef, { x: M, y: H - 24, size: 8, font: this.f.mono, color: C.muted });
    p.drawLine({ start: { x: M, y: 34 }, end: { x: W - M, y: 34 }, thickness: 0.6, color: C.line });
    p.drawText(`${this.pageNo}`, { x: M, y: 20, size: 8.5, font: this.f.body, color: C.muted });
    this.text('מסמך זה הופק אוטומטית ממערכת התיעוד. סודי — לשימוש משפטי בלבד.', { size: 7.5, color: C.muted, y: 20 });
    this.y = H - 52;
    if (title) this.h1(title);
  }

  /** Starts a chapter on the current page when at least ~40% of it is free; avoids near-empty pages. */
  section(title: string) {
    if (this.y < H * 0.4) this.newPage(title);
    else { this.y -= 14; this.h1(title); }
  }

  ensure(h: number) {
    if (this.y - h < 50) this.newPage();
  }

  text(s: string, o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; y?: number; xRight?: number } = {}) {
    const size = o.size ?? 10.5;
    const font = o.font ?? this.f.body;
    const v = visual(s);
    const w = font.widthOfTextAtSize(v, size);
    drawVisual(this.page, v, (o.xRight ?? W - M) - w, o.y ?? this.y, size, font, o.color ?? C.ink);
  }

  para(s: string, o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; width?: number; xRight?: number; gap?: number } = {}) {
    const size = o.size ?? 10.5;
    const font = o.font ?? this.f.body;
    const lines = wrap(s, font, size, o.width ?? W - 2 * M);
    for (const l of lines) {
      this.ensure(size * 1.6);
      this.text(l, { size, font, color: o.color, xRight: o.xRight });
      this.y -= size * 1.55;
    }
    this.y -= o.gap ?? 4;
  }

  h1(s: string) {
    this.ensure(40);
    this.text(s, { size: 19, font: this.f.headBold, color: C.ink });
    this.y -= 10;
    this.page.drawLine({ start: { x: W - M - 120, y: this.y }, end: { x: W - M, y: this.y }, thickness: 2.2, color: C.gold });
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: W - M - 126, y: this.y }, thickness: 0.5, color: C.line });
    this.y -= 20;
  }

  h2(s: string, n?: string) {
    this.ensure(30);
    const label = n ? `${n}. ${s}` : s;
    this.text(label, { size: 13, font: this.f.head, color: C.emerald });
    this.y -= 16;
  }

  divider() {
    this.ensure(14);
    this.y -= 2;
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: W - M, y: this.y }, thickness: 0.6, color: C.gold, opacity: 0.6 });
    this.y -= 12;
  }

  kv(rows: Array<[string, string, ('mono' | 'ltr')?]>) {
    const labelW = 128;
    for (const [k, v, mode] of rows) {
      const valW = W - 2 * M - labelW - 10;
      const lines = mode === 'mono' ? hardWrapMono(v, this.f.mono, 8.2, valW) : wrap(v || '—', this.f.body, 10, valW);
      const h = lines.length * (mode === 'mono' ? 11 : 14) + 6;
      this.ensure(h);
      this.page.drawRectangle({ x: M, y: this.y - h + 11, width: W - 2 * M, height: h, color: C.card, borderColor: C.line, borderWidth: 0.4 });
      this.text(k, { size: 9.5, font: this.f.bold, color: C.muted, y: this.y - 1, xRight: W - M - 8 });
      let yy = this.y - 1;
      for (const l of lines) {
        if (mode === 'mono') this.page.drawText(l, { x: W - M - labelW - 10 - this.f.mono.widthOfTextAtSize(l, 8.2), y: yy, size: 8.2, font: this.f.mono, color: C.ink });
        else if (mode === 'ltr') this.page.drawText(l, { x: W - M - labelW - 10 - this.f.body.widthOfTextAtSize(l, 10), y: yy, size: 10, font: this.f.body, color: C.ink });
        else this.text(l, { size: 10, y: yy, xRight: W - M - labelW - 10 });
        yy -= mode === 'mono' ? 11 : 14;
      }
      this.y -= h + 3;
    }
    this.y -= 4;
  }

  /** Page-1 red-flag box: every failed or incomplete check, what it is and what it means. */
  redFlags(issues: Issue[], failed: boolean) {
    const red = C.rose;
    const top = this.y + 12;
    const startPage = this.page;
    this.page.drawRectangle({ x: M, y: this.y - 4, width: W - 2 * M, height: 22, color: failed ? red : rgb(0.72, 0.5, 0.1) });
    this.text(failed ? 'אזהרה: נמצאו כשלים. אין להציג את התיק בלי לקרוא את הסעיף הזה' : 'הערות: חלק מהבדיקות חסרות או ממתינות', { size: 11, font: this.f.bold, color: C.white, y: this.y + 2 });
    this.y -= 30;
    for (const it of issues) {
      const tag = it.level === 'fail' ? 'כשל' : 'הערה';
      const evs = it.events.length ? ` (אירוע ${it.events.join(', ')})` : '';
      this.para(`${tag}: ${it.title}${evs}`, { size: 10, font: this.f.bold, color: it.level === 'fail' ? red : rgb(0.6, 0.4, 0.05), gap: 0, width: W - 2 * M - 20, xRight: W - M - 10 });
      this.para(`מה זה אומר: ${it.meaning}`, { size: 9, color: C.ink, gap: 5, width: W - 2 * M - 20, xRight: W - M - 10 });
    }
    const bottom = this.y + 4;
    if (this.page === startPage) this.page.drawRectangle({ x: M - 2, y: bottom, width: W - 2 * M + 4, height: Math.max(0, top - bottom), borderColor: failed ? red : rgb(0.72, 0.5, 0.1), borderWidth: 1.4, opacity: 0 });
    this.y -= 8;
  }

  /** Clickable URL rows: the URL is drawn left-to-right and gets a real PDF link annotation. */
  links(rows: Array<[string, string]>) {
    for (const [k, url] of rows) {
      const h = 22;
      this.ensure(h + 4);
      this.page.drawRectangle({ x: M, y: this.y - h + 14, width: W - 2 * M, height: h, color: C.card, borderColor: C.line, borderWidth: 0.4 });
      this.text(k, { size: 9.5, font: this.f.bold, color: C.muted, y: this.y, xRight: W - M - 8 });
      const size = 9;
      const tw = this.f.mono.widthOfTextAtSize(url, size);
      const fit = Math.min(size, (W - 2 * M - 190) / (tw / size));
      const w2 = this.f.mono.widthOfTextAtSize(url, fit);
      const x = M + 8;
      this.page.drawText(url, { x, y: this.y, size: fit, font: this.f.mono, color: C.teal });
      this.page.drawLine({ start: { x, y: this.y - 1.5 }, end: { x: x + w2, y: this.y - 1.5 }, thickness: 0.4, color: C.teal });
      const annot = this.doc.context.obj({
        Type: 'Annot', Subtype: 'Link', Rect: [x - 1, this.y - 4, x + w2 + 1, this.y + fit + 1], Border: [0, 0, 0],
        A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
      });
      this.page.node.addAnnot(this.doc.context.register(annot));
      this.y -= h + 3;
    }
    this.y -= 4;
  }

  badge(ok: boolean | null, label: string, xRight: number, y: number) {
    const col = ok === null ? C.muted : ok ? C.emerald : C.rose;
    const t = visual(`${ok === null ? '•' : ok ? '✓' : '✗'} ${label}`.replace('✓', 'V').replace('✗', 'X'));
    const w = this.f.bold.widthOfTextAtSize(t, 9) + 14;
    this.page.drawRectangle({ x: xRight - w, y: y - 4, width: w, height: 16, color: ok === null ? C.card : ok ? C.mint : rgb(1, 0.94, 0.94), borderColor: col, borderWidth: 0.6 });
    drawVisual(this.page, t, xRight - w + 7, y, 9, this.f.bold, col);
    return w;
  }

  table(headers: string[], widths: number[], rows: string[][]) {
    const rowH = 18;
    const drawRow = (cells: string[], head: boolean) => {
      this.ensure(rowH + 2);
      this.page.drawRectangle({ x: M, y: this.y - 5, width: W - 2 * M, height: rowH, color: head ? C.emerald : C.card, borderColor: C.line, borderWidth: head ? 0 : 0.3 });
      let xr = W - M - 6;
      cells.forEach((c, i) => {
        const font = head ? this.f.bold : this.f.body;
        let s = c;
        while (font.widthOfTextAtSize(s, 9) > widths[i]! - 6 && s.length > 3) s = s.slice(0, -2);
        this.text(s, { size: 9, font, color: head ? C.white : C.ink, xRight: xr, y: this.y });
        xr -= widths[i]!;
      });
      this.y -= rowH;
    };
    drawRow(headers, true);
    rows.forEach((r) => drawRow(r, false));
    this.y -= 8;
  }

  mono(s: string, size = 7.2, color = C.ink) {
    const lines = hardWrapMono(s, this.f.mono, size, W - 2 * M - 16);
    const lh = size * 1.35;
    for (let i = 0; i < lines.length; i++) {
      this.ensure(lh + 4);
      this.page.drawRectangle({ x: M, y: this.y - 3, width: W - 2 * M, height: lh, color: rgb(0.955, 0.965, 0.955) });
      this.page.drawText(lines[i]!, { x: M + 8, y: this.y, size, font: this.f.mono, color });
      this.y -= lh;
    }
    this.y -= 6;
  }

  provenance(rows: ProvenanceRow[]) {
    const colors: Record<ProvenanceRow['source'], ReturnType<typeof rgb>> = { server: C.emerald, computed: C.teal, header: C.gold, browser: rgb(0.45, 0.4, 0.6), external: rgb(0.2, 0.35, 0.7) };
    for (const row of rows) {
      const r = { ...row, mono: !!row.mono && /^[\x20-\x7e]*$/.test(row.value) };
      const valLines = r.mono ? hardWrapMono(r.value, this.f.mono, 7.6, W - 2 * M - 150) : wrap(r.value, this.f.body, 9.5, W - 2 * M - 150);
      const howLines = wrap(r.how, this.f.body, 8.2, W - 2 * M - 150);
      const h = valLines.length * 11 + howLines.length * 11 + 8;
      this.ensure(h + 2);
      this.page.drawRectangle({ x: M, y: this.y - h + 11, width: W - 2 * M, height: h, color: C.card, borderColor: C.line, borderWidth: 0.3 });
      this.page.drawRectangle({ x: W - M - 3, y: this.y - h + 11, width: 3, height: h, color: colors[r.source] });
      this.text(r.field, { size: 9, font: this.f.bold, color: C.ink, y: this.y - 1, xRight: W - M - 10 });
      const chip = visual(SOURCE_HE[r.source]);
      const cw = this.f.bold.widthOfTextAtSize(chip, 7.5) + 10;
      this.page.drawRectangle({ x: W - M - 10 - cw, y: this.y - 16, width: cw, height: 11, color: colors[r.source], opacity: 0.14 });
      drawVisual(this.page, chip, W - M - 5 - cw, this.y - 13.5, 7.5, this.f.bold, colors[r.source]);
      let yy = this.y - 1;
      const xr = W - M - 140;
      for (const l of valLines) {
        if (r.mono) this.page.drawText(l, { x: xr - this.f.mono.widthOfTextAtSize(l, 7.6), y: yy, size: 7.6, font: this.f.mono, color: C.ink });
        else this.text(l, { size: 9.5, y: yy, xRight: xr });
        yy -= 11;
      }
      for (const l of howLines) {
        this.text(l, { size: 8.2, color: C.muted, y: yy, xRight: xr });
        yy -= 11;
      }
      this.y -= h + 3;
    }
    this.y -= 4;
  }

  /** Up to 3 screenshot segments per row, each with index, verification code, short hash, match badge. */
  async segmentGrid(doc: PDFDocument, segs: Array<{ i: number; sha256: string; computed: string | null | undefined; png: Buffer | null }>) {
    const gap = 10;
    const cols = 3;
    const cw = (W - 2 * M - gap * (cols - 1)) / cols;
    const total = segs.length;
    for (let r = 0; r < segs.length; r += cols) {
      const row = segs.slice(r, r + cols);
      const imgs = await Promise.all(row.map(async (sg) => (sg.png ? doc.embedPng(sg.png) : null)));
      const hs = imgs.map((im) => (im ? Math.min(250, (im.height * cw) / im.width) : 40));
      const rowH = Math.max(...hs) + 52;
      this.ensure(rowH);
      row.forEach((sg, k) => {
        const xr = W - M - k * (cw + gap);
        const x = xr - cw;
        const im = imgs[k];
        const h = hs[k]!;
        this.page.drawRectangle({ x, y: this.y - rowH + 6, width: cw, height: rowH, color: C.card, borderColor: C.line, borderWidth: 0.4 });
        if (im) {
          const iw = Math.min(cw - 10, (im.width * h) / im.height);
          this.page.drawImage(im, { x: x + (cw - iw) / 2, y: this.y - h, width: iw, height: h - 4 });
          this.page.drawRectangle({ x: x + (cw - iw) / 2, y: this.y - h, width: iw, height: h - 4, borderColor: C.gold, borderWidth: 0.6 });
        } else this.text('הקובץ לא נטען', { size: 8.5, color: C.rose, y: this.y - 20, xRight: xr - 6 });
        const ok = !!sg.computed && sg.computed === sg.sha256;
        const yy = this.y - Math.max(...hs) - 8;
        this.text(`חלק ${sg.i} מתוך ${total}`, { size: 8.5, font: this.f.bold, color: C.ink, y: yy, xRight: xr - 6 });
        const code = verifyCode(sg.computed ?? sg.sha256);
        this.page.drawText(code, { x: x + 6, y: yy, size: 7.6, font: this.f.mono, color: C.emerald });
        const short = `${(sg.computed ?? sg.sha256).slice(0, 16)}...${(sg.computed ?? sg.sha256).slice(-8)}`;
        this.page.drawText(short, { x: x + 6, y: yy - 12, size: 6.6, font: this.f.mono, color: C.muted });
        this.badge(sg.computed === undefined ? null : ok, ok ? 'זהה לחתום' : 'לא זהה', xr - 6, yy - 30);
      });
      this.y -= rowH + 6;
    }
    this.para('קוד האימות (NW-...) הוא 12 התווים הראשונים של גיבוב SHA-256 של הקובץ. הגיבוב המלא נעול ברשומה החתומה (payload.json, השדות screenshot_sha256 ו־screenshot_segments).', { size: 8, color: C.muted, gap: 4 });
  }

  image(img: PDFImage, maxW: number, maxH: number) {
    const room = this.y - 50 - 16;
    if (room >= 200) maxH = Math.min(maxH, room);
    const s = Math.min(maxW / img.width, maxH / img.height, 1);
    const w = img.width * s;
    const h = img.height * s;
    this.ensure(h + 16);
    const x = (W - w) / 2;
    this.page.drawRectangle({ x: x - 5, y: this.y - h - 5, width: w + 10, height: h + 10, color: C.white, borderColor: C.gold, borderWidth: 0.8 });
    this.page.drawImage(img, { x, y: this.y - h, width: w, height: h });
    this.y -= h + 16;
  }
}

export async function buildEvidencePdf(input: PdfInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`תיק ראיות — ${input.caseRef}`);
  doc.setAuthor('NuraWell');
  doc.setCreationDate(new Date(input.generatedAt));
  const f = await loadFonts(doc);
  const w = new Writer(doc, f, input.caseRef);

  // ── cover
  w.newPage();
  const p = w.page;
  p.drawRectangle({ x: 0, y: H - 330, width: W, height: 324, color: rgb(0.02, 0.42, 0.33) });
  p.drawRectangle({ x: 0, y: H - 330, width: W, height: 324, color: C.teal, opacity: 0.35 });
  p.drawCircle({ x: W - 70, y: H - 90, size: 120, color: C.gold, opacity: 0.18 });
  p.drawCircle({ x: 60, y: H - 300, size: 90, color: rgb(1, 1, 1), opacity: 0.06 });
  p.drawRectangle({ x: 0, y: H - 336, width: W, height: 6, color: C.gold });
  w.text('NuraWell', { size: 13, font: f.head, color: C.goldSoft, y: H - 80 });
  w.text('תיק ראיות', { size: 34, font: f.headBold, color: C.white, y: H - 140 });
  w.text('הסכמה לעיבוד מידע בריאותי', { size: 20, font: f.head, color: C.white, y: H - 172 });
  w.text(`${input.user.name} · ${input.events.length} אירועי הסכמה מתועדים`, { size: 12, color: C.goldSoft, y: H - 210 });
  p.drawText(input.caseRef, { x: M, y: H - 300, size: 10, font: f.mono, color: C.goldSoft });
  w.text(`הופק: ${fmt(input.generatedAt)}`, { size: 10, color: C.goldSoft, y: H - 300 });
  w.y = H - 380;
  w.h2('תמצית');
  w.para(
    `מסמך זה מרכז את כל אירועי ההסכמה והביטול של בעל החשבון לעיבוד מידע בריאותי, כפי שנרשמו בזמן אמת: הנוסח המדויק שהוצג, צילום החלון, המילה שהוקלדה, פרטי המכשיר, וטביעות אצבע קריפטוגרפיות החתומות בידי השרת ומאומתות בידי גורמי חותמת זמן חיצוניים ובלתי תלויים.`
  );
  w.y -= 4;
  const issues = findIssues(input);
  const failed = !input.overallOk || issues.some((i) => i.level === 'fail');
  w.badge(!failed, !failed ? (issues.length ? 'בדיקת השלמות עברה, עם הערות (ראו למטה)' : 'בדיקת שלמות מלאה עברה בהצלחה') : 'נמצאו כשלים בבדיקת השלמות (ראו למטה)', W - M, w.y);
  w.y -= 30;
  if (issues.length) w.redFlags(issues, failed);
  w.kv([
    ['מספר תיק', input.caseRef, 'ltr'],
    ['הופק על ידי', input.generatedBy],
    ['תוכן', '1. זיהוי · 2. ציר זמן · 3. פירוט אירועים · 4. בדיקת שלמות ואימות עצמאי · 5. שרשרת משמורת · 6. מתודולוגיה ואימות · 7. מוכנות לבית המשפט · 8. תעודת רשומה מוסדית'],
  ]);

  // ── 1 identification
  w.newPage('1. זיהוי בעל החשבון');
  w.kv([
    ['שם', input.user.name],
    ['דוא"ל', input.user.email, 'ltr'],
    ['מזהה משתמש', input.user.id, 'mono'],
    ['תאריך פתיחת חשבון', fmt(input.user.createdAt)],
    ['מספר אירועים', String(input.events.length)],
  ]);
  w.divider();
  // ── 2 timeline
  w.h2('ציר זמן', '2');
  w.table(
    ['#', 'תאריך ושעה', 'פעולה', 'מקור', 'אסמכתא'],
    [26, 190, 80, 96, 115],
    input.events.map((e) => [String(e.index), fmt(e.createdAt), actionHe(e.action), sourceHe(e.source), e.reference])
  );

  // ── 3 events
  for (const e of input.events) {
    w.newPage(`3.${e.index} ${actionHe(e.action)} — ${fmt(e.createdAt)}`);
    w.kv([
      ['אסמכתא', e.reference, 'ltr'],
      ['מקור', sourceHe(e.source)],
      ['גרסת נוסח', e.textVersion, 'ltr'],
      ['תיבת אישור', e.checkbox ? 'סומנה' : 'לא סומנה'],
      ['מילה שהוקלדה', `"${e.typedWord}"`],
    ]);
    w.ensure(30);
    let xr = W - M;
    for (const c of e.checks) {
      const bw = w.badge(c.ok, c.label, xr, w.y);
      xr -= bw + 6;
      if (xr < M + 90) {
        xr = W - M;
        w.y -= 22;
      }
    }
    w.y -= 26;
    w.h2('הנוסח שהוצג (שחזור מדויק מהרשומה)');
    for (const l of e.displayedText) w.para(l, { size: 9.5, color: C.ink, gap: 1 });
    w.divider();
    if (e.screenshotPng) {
      const segs = [{ i: 1, sha256: e.screenshotSha ?? '', computed: e.screenshotShaComputed ?? null, png: e.screenshotPng }, ...(e.screenshotSegments ?? [])];
      w.h2(segs.length > 1 ? `צילום החלון המלא (${segs.length} חלקים, לפי הסדר)` : 'צילום החלון כפי שנלכד במכשיר');
      await w.segmentGrid(doc, segs);
    } else if (e.screenshotSha) {
      w.para('לרשומה זו נשמר צילום, אך הוא לא נטען בעת ההפקה.', { size: 9, color: C.rose });
    } else {
      w.para('באירוע זה לא נשמר צילום (למשל ביטול מתוך שיחה). הנתונים נשענים על הרשומה שנרשמה בשרת.', { size: 9, color: C.muted });
    }
    w.divider();
    if (e.provenance?.length) {
      w.h2('מאיפה הגיע כל נתון');
      w.para('לכל שדה מצוין מי יצר אותו: השרת, תשתית הרשת, הדפדפן או גורם חיצוני. כל השדות, חוץ מהזמן החיצוני, נעולים יחד בתוך הרשומה החתומה.', { size: 8.8, color: C.muted, gap: 6 });
      w.provenance(e.provenance);
    }
    if (e.corroboration) {
      w.h2('אישור עצמאי בצד השרת');
      w.para('השרת רשם את ההחלטה גם בטבלאות נפרדות, בקוד נפרד, באותה בקשה. כך המילה, הסימון והנוסח לא נשענים רק על הצילום: המילה ומצב התיבה נקלטו מגוף הבקשה ונבדקו בשרת, והנוסח נבנה מחדש מהתבנית של השרת וגובב (ראו "גיבוב הנוסח שהוצג").', { size: 9, gap: 6 });
      if (e.corroboration.length) for (const c of e.corroboration) { w.para(`${c.source} · ${fmt(c.at)} · ${c.link === 'evidence_id' ? 'מקושר ישירות למזהה הרשומה' : 'הותאם לפי זמן (רשומה ישנה)'}`, { size: 8.5, font: f.bold, color: C.muted, gap: 0 }); w.mono(asciiJson(c.line)); }
      else w.para('לא נמצאה שורת יומן תואמת בחלון של שתי דקות.', { size: 9, color: C.muted });
    }
    if (!e.provenance?.length) w.h2('מכשיר ורשת');
    if (!e.provenance?.length) w.kv([
      ['כתובת IP', e.ip ?? '—', 'ltr'],
      ['גיבוב IP', e.ipHash ?? '—', 'mono'],
      ['דפדפן / מכשיר', e.userAgent ?? '—', 'ltr'],
      ['מזהה התחברות', e.sessionId ?? '—', 'mono'],
      ['מזהה מכשיר', e.deviceId ?? '—', 'mono'],
    ]);
    w.h2('טביעות אצבע וחתימות');
    w.kv([
      ['גיבוב הרשומה', e.recordHash, 'mono'],
      ['גיבוב הרשומה הקודמת', e.prevHash, 'mono'],
      ['גיבוב הנוסח שהוצג', e.renderedSha, 'mono'],
      ['גיבוב הצילום', e.screenshotSha ?? '—', 'mono'],
      ['חתימת השרת', e.signature, 'mono'],
      ['מזהה מפתח', e.keyId, 'mono'],
      ['חותמת זמן מוסמכת', e.tsa.ok ? `${fmt(e.tsa.genTime)} · ${input.tsaName ?? 'RFC 3161'}` : 'לא זמינה'],
      ['גיבוב אסימון חותמת הזמן', e.tsa.tokenSha ?? '—', 'mono'],
      ['עיגון ציבורי', e.otsCalendars.length ? `${e.otsCalendars.length} שרתי עיגון: ${e.otsCalendars.join(', ')}` : 'לא זמין'],
      ['קבלה לדוא"ל בעל החשבון', e.emailReceipt?.ok ? `נשלחה ${fmt(e.emailReceipt.sentAt)}` : 'לא נשלחה'],
    ]);
    if (e.canonicalJson) {
      w.h2('קטעי יומן גולמיים');
      w.para('הרשומה הקנונית בדיוק כפי שנחתמה (payload.json). תווים בעברית מוצגים בקוד Unicode, וזו אותה רשומה בדיוק. הגיבוב מחושב על הקובץ שבתיק.', { size: 8.5, color: C.muted, gap: 2 });
      w.mono(asciiJson(e.canonicalJson), 6.8);
      if (e.neighbors) {
        w.para(`מיקום בשרשרת: ${e.neighbors.position} מתוך ${e.neighbors.total}`, { size: 8.5, font: f.bold, color: C.muted, gap: 0 });
        w.mono(`prev  ${e.neighbors.prevHash}\nthis  ${e.recordHash}\nnext  ${e.neighbors.nextHash ?? '(none: latest record)'}`.replace(/\n/g, '  |  '), 6.8);
      }
      if (e.otsStatus?.length) {
        w.para('מצב עיגון בביטקוין (OpenTimestamps)', { size: 8.5, font: f.bold, color: C.muted, gap: 0 });
        w.mono(e.otsStatus.map((o) => `${o.calendar}: ${o.status === 'bitcoin' ? `BTC block ${o.height ?? '?'}` : 'pending'}`).join(' | '), 6.8);
      }
    }
  }

  // ── 4 integrity
  w.newPage('4. תוצאות בדיקת השלמות');
  w.para(`הבדיקה בוצעה מחדש בעת הפקת המסמך (${fmt(input.generatedAt)}). לכל רשומה חושבו מחדש הגיבובים, נבדק הקישור לרשומה הקודמת, אומתה חתימת השרת, נבדק אסימון חותמת הזמן, ונבדק שגיבוב הצילום השמור זהה לגיבוב שנחתם.`);
  w.table(
    ['#', 'שרשרת', 'חתימה', 'נוסח', 'חותמת זמן', 'צילום'],
    [26, 98, 98, 90, 98, 97],
    input.events.map((e) => [String(e.index), ...e.checks.slice(0, 5).map((c) => (c.ok === null ? '—' : c.ok ? 'תקין' : 'חריגה'))])
  );
  if (input.chainAnchors.length) {
    w.h2('עיגון יומי של ראש השרשרת הכללית');
    w.table(
      ['תאריך', 'רשומות', 'חותמת זמן', 'עיגון ציבורי'],
      [190, 80, 120, 117],
      input.chainAnchors.slice(-12).map((a) => [fmt(a.at), String(a.count), a.tsa ? 'קיימת' : '—', a.ots ? `${a.ots} שרתים` : '—'])
    );
  }

  // ── 4b independent verification
  w.section('4.1 אימות עצמאי: למה אנחנו לא יכולים לזייף');
  const pts: string[] = [
    `חתימה דיגיטלית: כל רשומה נחתמה ב־Ed25519. כל אחד יכול לאמת אותה במפתח הציבורי שמפורסם בכתובת קבועה (קישור לחיץ בטבלה למטה). שינוי של תו אחד ברשומה מבטל את החתימה.`,
    `חותמת זמן חיצונית: גיבוב כל רשומה נשלח ברגע האירוע ל־${input.tsaName ?? 'רשות חותמת זמן'} לפי תקן RFC 3161. הרשות חתמה על הגיבוב ועל השעה במפתח שלה, שאין לנו גישה אליו. לכן אי אפשר ליצור היום רשומה "מתוארכת לאחור".`,
    'עיגון בביטקוין: אותו גיבוב נשלח גם ל־OpenTimestamps, שמעגן אותו בבלוקצ׳יין ביטקוין הציבורי. אחרי האישור בבלוק, אף אחד, כולל אנחנו, לא יכול לשנות את הרשומה בלי שזה יתגלה. מצב האישור מופיע בכל אירוע.',
    'הוספה בלבד: במסד הנתונים מוגדר מנגנון שחוסם עדכון, מחיקה וריקון של טבלאות הראיות, גם למפתח המנהל של השרת. בנוסף, כל רשומה מכילה את הגיבוב של הקודמת, כך שמחיקה או החלפה באמצע שוברות את השרשרת.',
    'הצילום ננעל ברגע הצילום: הגיבוב של קובץ הצילום חושב בשרת כשהבקשה התקבלה, ונכנס לתוך הרשומה שנחתמה ונשלחה לחותמת הזמן. החלפת הצילום אחר כך תיתן גיבוב אחר.',
  ];
  pts.forEach((s, i) => w.para(`${i + 1}. ${s}`, { gap: 6 }));
  w.divider();
  w.kv([
    ['אלגוריתם חתימה', 'Ed25519', 'ltr'],
    ['טביעת המפתח (SHA-256)', input.publicKeyFingerprint ?? '—', 'mono'],
    ['רשות חותמת זמן', input.tsaName ?? '—'],
  ]);
  w.h2('קישורים לאימות (לחיצים)');
  w.links([
    ...(input.publicKeyUrl ? ([['המפתח הציבורי לאימות החתימות', input.publicKeyUrl]] as Array<[string, string]>) : []),
    ...((input.tsaName ?? '').includes('FreeTSA')
      ? ([['תעודת הרשות של FreeTSA', 'https://freetsa.org/files/cacert.pem'], ['תעודת החותם של FreeTSA', 'https://freetsa.org/files/tsa.crt']] as Array<[string, string]>)
      : []),
    ['OpenTimestamps (כלי האימות)', 'https://opentimestamps.org/'],
  ]);
  w.h2('פקודות האימות (מלא ב־VERIFY.txt)');
  w.mono('sha256sum records/01/payload.json   # = record.sha256', 7.4);
  w.mono('openssl pkeyutl -verify -pubin -inkey public-key.pem -rawin -in msg -sigfile sig', 7.4);
  w.mono('openssl ts -verify -digest $(cat records/01/record.sha256) -in records/01/timestamp.tsr -CAfile cacert.pem -untrusted tsa.crt', 7.4);
  w.mono('ots verify -d $(cat records/01/record.sha256) records/01/<calendar>.ots', 7.4);
  w.mono('sha256sum records/01/screenshot.webp   # = screenshot_sha256 in payload.json', 7.4);

  // ── 5 custody
  w.section('5. שרשרת משמורת ויומן גישה');
  w.para('הרשומות נשמרות בטבלאות שהוספה בלבד מותרת בהן: מנגנון במסד הנתונים חוסם כל עדכון או מחיקה, גם בהרשאות מנהל. הצילומים נשמרים באחסון פרטי באירופה, עם נעילת שמירה. כל צפייה, אימות או הפקה של תיק זה נרשמים ביומן הגישה:');
  w.table(['תאריך ושעה', 'פעולה', 'מבצע'], [200, 200, 107], input.accessLog.slice(-30).map((a) => [fmt(a.at), a.action, a.actor]));

  // ── 6 methodology
  w.section('6. מתודולוגיה ומדריך אימות למומחה');
  const steps: string[] = [
    'כל אירוע נשמר כרשומה קנונית (JSON ממוין) הכוללת את גיבוב הנוסח שהוצג, את גיבוב הצילום, את המילה שהוקלדה, את מצב תיבת האישור, את פרטי המכשיר ואת גיבוב הרשומה הקודמת של אותו משתמש. כך נוצרת שרשרת: שינוי של רשומה כלשהי שובר את כל הרשומות שאחריה.',
    'גיבוב הרשומה (SHA-256) נחתם בחתימה דיגיטלית Ed25519 של השרת. המפתח הציבורי מצורף לתיק (public-key.pem).',
    'אותו גיבוב נשלח, ברגע האירוע, לרשות חותמת זמן מוסמכת לפי תקן RFC 3161 שאינה בשליטתנו. האסימון החתום מצורף (קובצי tsr.).',
    'בנוסף, הגיבוב עוגן ברשת ציבורית מבוזרת (OpenTimestamps, בלוקצ׳יין ביטקוין) דרך כמה שרתים עצמאיים, וראש השרשרת הכללית מעוגן מדי יום. ההוכחות מצורפות (קובצי ots.).',
    'לבעל החשבון נשלחה קבלה לדוא"ל הפרטי ברגע האירוע, עם מספר האסמכתא. זהו עותק שנמצא מחוץ למערכת שלנו.',
    'אימות עצמאי: (1) לחשב SHA-256 של payload.json של כל רשומה ולהשוות ל-record_hash. (2) לאמת את החתימה במפתח הציבורי. (3) לאמת את אסימון חותמת הזמן. (4) לאמת את קובץ העיגון. (5) לחשב SHA-256 של הצילום ושל snapshot.html ולהשוות לרשומה. הפקודות המדויקות נמצאות בקובץ VERIFY.txt שבתיק.',
  ];
  steps.forEach((s, i) => w.para(`${i + 1}. ${s}`, { gap: 6 }));
  w.divider();
  w.h2('מפתח ציבורי של השרת');
  for (const l of input.publicKeyPem.trim().split('\n')) {
    w.ensure(12);
    w.page.drawText(l, { x: M, y: w.y, size: 8.5, font: f.mono, color: C.ink });
    w.y -= 11;
  }

  // ── 7 court readiness
  w.newPage('7. מוכנות לבית המשפט');
  w.para('פרק זה מסביר בשפה פשוטה איך התיק עונה על התנאים לקבלת "רשומה מוסדית" כראיה. זה הסבר טכני ולא חוות דעת משפטית; עורך דין צריך לבחון אותו לפני שימוש.', { size: 9.5, color: C.muted, gap: 8 });
  w.h2('הבסיס בחוק');
  w.para('פקודת הראיות [נוסח חדש], התשל"א-1971, סימן ה׳ (סעיפים 35-36). סעיף 35 מגדיר "רשומה מוסדית" כמסמך, לרבות פלט, שנערך על ידי מוסד במהלך פעילותו הרגילה; "מוסד" כולל עסק. לפי סעיף 36(א) רשומה כזו קבילה להוכחת אמיתות תוכנה אם: (1) המוסד נוהג לרשום את האירוע בסמוך להתרחשותו; (2) דרך איסוף הנתונים ועריכת הרשומה מעידה על אמיתות תוכנה; (3) ברשומה שהיא פלט, גם דרך ההפקה מעידה על אמינותה, והמוסד נוקט באורח סדיר אמצעי הגנה סבירים מפני חדירה ושיבוש. לפי סעיף 41ב פלט שהוא רשומה מוסדית נחשב "מקור" ולא העתק. לפי סעיף 36(ג) הצד שכנגד רשאי לחקור עדים בחקירה נגדית. (המקור נבדק מול נוסח הפקודה בוויקיטקסט, אוקטובר 2026.)', { size: 9.5, gap: 8 });
  const req: Array<[string, string]> = [
    ['רישום שגרתי וסמוך לאירוע (36(א)(1))', 'כל הסכמה וביטול נרשמים אוטומטית, באותה בקשה שבה המשתמש אישר, באותו קוד לכל המשתמשים. זמן השרת וזמן חותמת הזמן החיצונית מופיעים בכל אירוע, וההפרש ביניהם שניות ספורות.'],
    ['אמינות האיסוף והעריכה (36(א)(2))', 'המילה שהוקלדה ומצב התיבה נקלטו מגוף הבקשה ונבדקו בשרת לפני השמירה. הנוסח נבנה מחדש מהתבנית של השרת. הצילום מכסה את כל החלון, כולל אזור האישור, והגיבוב שלו ננעל ברגע הקבלה.'],
    ['אמינות ההפקה ואבטחה (36(א)(3))', 'התיק מופק אוטומטית מהרשומות השמורות, עם בדיקת שלמות מחדש בכל הפקה. הטבלאות חוסמות עדכון ומחיקה. הגישה מוגבלת למנהל עם אישור מכשיר, וכל צפייה והפקה נרשמות ביומן שאי אפשר למחוק.'],
    ['שרשרת משמורת', 'רשומה, ואז חתימה, חותמת זמן חיצונית, עיגון בביטקוין ויומן גישה. כל קובץ בתיק מופיע ב־SHA256SUMS.txt, ולכל קובץ יש קוד אימות קצר שנגזר מהגיבוב שלו.'],
    ['למה אי אפשר לשנות בדיעבד', 'שינוי ערך כלשהו, גם כתובת IP, משנה את גיבוב הרשומה. הגיבוב המקורי כבר חתום, נשלח לרשות חותמת זמן חיצונית, עוגן בביטקוין, וכלול בקבלה שנשלחה לתיבת הדואר של המשתמש. שלושת אלה נמצאים מחוץ לשליטתנו.'],
    ['אימותים של צד שלישי', 'רשות חותמת זמן (RFC 3161), OpenTimestamps ובלוקצ׳יין ביטקוין, ספק הדואר ששלח את הקבלה (מזהה ההודעה אצלו נשמר בהצהרה חתומה), ומזהה הבקשה של ספק האירוח (x-vercel-id), שמאפשר לספק לאשר באופן עצמאי את כתובת ה־IP והזמן.'],
  ];
  for (const [k, v] of req) { w.para(k, { size: 10, font: f.bold, color: C.emerald, gap: 0 }); w.para(v, { size: 9.5, gap: 6 }); }
  w.divider();
  w.h2('יומני ספקים: מה אפשר לקבל ומה לא');
  w.para('יומני הבקשות אצל ספק האירוח ואצל ספק מסד הנתונים נשמרים אצלם זמן מוגבל בלבד, בדרך כלל ימים ספורים. אפשר לשלוף אותם לפי דרישה, לאירוע מסוים, מתוך Ops. באירועים ישנים מתקופת השמירה, היומנים כבר לא קיימים אצל הספק, והתיק אומר זאת במפורש במקום להציג אותם. במקרה כזה הראיות הן הרשומה החתומה, חותמת הזמן החיצונית, העיגון בביטקוין וקבלת הדואר. לרשומות שנוצרו מאוקטובר 2026 נשמר גם מזהה הבקשה של ספק האירוח, ובית משפט יכול לבקש מהספק את הנתונים לפיו.', { size: 9.5, gap: 6 });
  w.para('מסמך נלווה: תבנית "תצהיר ערוך מערכת" (קובץ נפרד), לעריכה ולחתימה בפני עורך דין.', { size: 9, color: C.muted });

  // ── 8 declaration
  w.newPage('8. תעודת עורך רשומה מוסדית');
  w.para('(במתכונת סעיפים 35-36 לפקודת הראיות [נוסח חדש], התשל"א-1971, ובצירוף תצהיר לפי סעיף 15 לפקודה. טיוטה לעיון ועריכה של עורך דין לפני חתימה.)', { size: 9.5, color: C.muted, gap: 10 });
  const decl = [
    `אני, החתום מטה, דניאל רחמן, בעל השליטה והאחראי על מערכות המידע של NuraWell, לאחר שהוזהרתי כי עליי לומר את האמת וכי אהיה צפוי לעונשים הקבועים בחוק אם לא אעשה כן, מצהיר בזאת:`,
    `1. הרשומות המפורטות במסמך זה (תיק ${input.caseRef}) הן רשומות מוסדיות של NuraWell, שנערכו במהלך הפעילות הרגילה של העסק, בסמוך להתרחשות האירועים המתועדים בהן.`,
    '2. דרך איסוף הנתונים ועריכתם יש בה כדי להעיד על אמיתות תוכנן: הרשומות נוצרות אוטומטית ברגע שבעל החשבון מאשר בחלון ההסכמה, נחתמות דיגיטלית, נשמרות בטבלה שאינה מאפשרת שינוי או מחיקה, ומאומתות בידי גורמי חותמת זמן חיצוניים.',
    '3. הרשומות הופקו מהמערכת באופן ממוחשב. המערכת מוגנת כראוי מפני חדירה לחומר מחשב ומפני שיבוש בעבודתה, ובדיקת השלמות שבסעיף 4 בוצעה בעת ההפקה.',
    '4. הפלט המצורף משקף נכונה את הרשומות כפי שהן שמורות במערכת, לא נערך ולא שונה.',
    '5. זה שמי, זו חתימתי ותוכן תצהירי זה אמת.',
  ];
  decl.forEach((s) => w.para(s, { gap: 7 }));
  w.y -= 20;
  const sig = (label: string, xr: number) => {
    w.page.drawLine({ start: { x: xr - 200, y: w.y }, end: { x: xr, y: w.y }, thickness: 0.7, color: C.ink });
    w.text(label, { size: 9.5, color: C.muted, xRight: xr, y: w.y - 14 });
  };
  w.ensure(160);
  sig('חתימת המצהיר — דניאל רחמן', W - M);
  sig('תאריך', M + 200);
  w.y -= 50;
  w.para('אישור עורך דין', { font: f.bold, size: 11 });
  w.para('הנני מאשר כי ביום __________ הופיע בפניי מר דניאל רחמן, שזיהיתיו לפי ת"ז __________, ולאחר שהזהרתיו כי עליו להצהיר את האמת וכי יהיה צפוי לעונשים הקבועים בחוק אם לא יעשה כן, אישר את נכונות הצהרתו דלעיל וחתם עליה בפניי.', { size: 10 });
  w.y -= 30;
  w.ensure(60);
  sig('חתימה וחותמת עורך הדין', W - M);
  sig('מספר רישיון', M + 200);

  return Buffer.from(await doc.save());
}

export type LogsPdfInput = {
  caseRef: string;
  generatedAt: string;
  event: { reference: string; createdAt: string; recordHash: string; requestId: string | null };
  providers: Array<{ provider: string; source: string; status: string; note?: string; rows: Array<Record<string, unknown>>; fileName: string; sha256: string; code: string }>;
};

/** Rendered page for on-demand provider log attachments (raw JSON travels alongside in the ZIP). */
export async function buildLogsPdf(input: LogsPdfInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`יומני ספק — ${input.caseRef}`);
  const f = await loadFonts(doc);
  const w = new Writer(doc, f, input.caseRef);
  w.newPage('יומני ספק לאירוע הסכמה');
  w.para('היומנים נשלפו לפי דרישה, ישירות מהספקים (לא מהמערכת שלנו), עבור חלון זמן של דקה לפני ואחרי האירוע. הקבצים הגולמיים מצורפים בתיק כ־JSON. ספקים שומרים יומנים לזמן מוגבל בלבד: כשהיומן כבר לא קיים אצל הספק, הדבר מצוין כאן במפורש.', { size: 9.5, gap: 8 });
  w.kv([
    ['אסמכתת האירוע', input.event.reference, 'ltr'],
    ['זמן האירוע', fmt(input.event.createdAt)],
    ['גיבוב הרשומה', input.event.recordHash, 'mono'],
    ['מזהה בקשה (ספק האירוח)', input.event.requestId ?? 'לא נשמר ברשומה זו (רשומה ישנה)', input.event.requestId ? 'mono' : undefined],
    ['הופק', fmt(input.generatedAt)],
  ]);
  const statusHe: Record<string, string> = { ok: 'נמצאו רשומות', empty: 'לא נמצאו רשומות: תקופת השמירה של הספק כנראה הסתיימה', not_configured: 'השליפה לא הוגדרה (חסר מפתח קריאה לספק)', error: 'השליפה נכשלה' };
  for (const p of input.providers) {
    w.divider();
    w.h2(p.provider === 'supabase' ? 'ספק מסד הנתונים (Supabase)' : 'ספק האירוח (Vercel)');
    w.kv([
      ['מקור', p.source, 'ltr'],
      ['מצב', statusHe[p.status] ?? p.status],
      ['קובץ', p.fileName, 'ltr'],
      ['קוד אימות', p.code, 'ltr'],
      ['SHA-256', p.sha256, 'mono'],
    ]);
    if (p.note) w.para(p.note, { size: 8.5, color: C.muted });
    for (const r of p.rows.slice(0, 40)) w.mono(asciiJson(JSON.stringify(r)), 6.6);
    if (p.rows.length > 40) w.para(`ועוד ${p.rows.length - 40} שורות בקובץ הגולמי.`, { size: 8.5, color: C.muted });
  }
  return Buffer.from(await doc.save());
}
