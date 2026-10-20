/**
 * Forgiving search for the legal hub (pure, unit-tested):
 * Hebrew/English normalisation, synonyms, and natural-language dates.
 */
const NIQQUD = /[\u0591-\u05C7]/g;
const FINALS: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
export function normalize(s: string): string {
  return (s ?? '').toLowerCase().replace(NIQQUD, '').replace(/[ךםןףץ]/g, (c) => FINALS[c]!).replace(/["'״׳`]/g, '').replace(/[^\p{L}\p{N}@.\-\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** Bilingual expansions so "שיר" finds audio and "receipt" finds קבלה. */
const SYN: Array<string[]> = [
  ['שיר', 'שירים', 'מוזיקה', 'song', 'music', 'audio', 'track', 'ai_music'],
  ['תמונה', 'תמונות', 'image', 'photo', 'picture', 'ai_image'],
  ['איור', 'illustration', 'drawing'],
  ['סרטון', 'וידאו', 'video', 'clip'],
  ['קבלה', 'קבלות', 'חשבונית', 'receipt', 'invoice'],
  ['גופן', 'פונט', 'font'],
  ['אייקון', 'סמל', 'icon'],
  ['מנוי', 'subscription', 'plan'],
  ['קול', 'הקראה', 'voice'],
  ['ריצה', 'run', 'running', 'jog'],
  ['הליכה', 'walk', 'walking'],
  ['נשימה', 'breath', 'breathing'],
  ['שינה', 'sleep'],
  ['בוקר', 'morning'],
];
const SYN_MAP = new Map<string, string[]>();
for (const g of SYN) for (const w of g) SYN_MAP.set(normalize(w), g.map(normalize));
export function expand(words: string[]): string[] {
  const out = new Set<string>();
  for (const w of words) { out.add(w); const stem = w.replace(/^[והבלמש](?=\p{L}{3,})/u, ''); out.add(stem); for (const s of SYN_MAP.get(w) ?? SYN_MAP.get(stem) ?? []) out.add(s); }
  return [...out].filter((w) => w.length >= 2);
}

const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const EN_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const EN_SHORT = EN_MONTHS.map((m) => m.slice(0, 3));
const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthRange = (y: number, m: number) => ({ from: iso(new Date(Date.UTC(y, m, 1))), to: iso(new Date(Date.UTC(y, m + 1, 0))) });

export type DateRange = { from: string; to: string; label: string };
/** Extracts one natural-language date from the query. Returns the remaining text too. */
export function parseDates(raw: string, now = new Date()): { range: DateRange | null; rest: string } {
  let q = ` ${normalize(raw)} `;
  const y = now.getUTCFullYear(); const m = now.getUTCMonth();
  const take = (re: RegExp) => { const hit = re.exec(q); if (hit) q = q.replace(hit[0], ' '); return hit; };
  let range: DateRange | null = null;
  const yearHit = take(/\s(?:ב|מ)?(20\d\d)\s/);
  const year = yearHit ? Number(yearHit[1]) : null;
  if (take(/\s(?:ב|מ)?חודש (?:שעבר|הקודם)\s|\slast month\s/)) { const d = new Date(Date.UTC(y, m - 1, 1)); range = { ...monthRange(d.getUTCFullYear(), d.getUTCMonth()), label: 'בחודש שעבר' }; }
  else if (take(/\s(?:ב)?החודש\s|\sthis month\s/)) range = { ...monthRange(y, m), label: 'החודש' };
  else if (take(/\s(?:ב)?שבוע (?:שעבר|הקודם)\s|\slast week\s/)) range = { from: iso(new Date(now.getTime() - 14 * 864e5)), to: iso(new Date(now.getTime() - 7 * 864e5)), label: 'בשבוע שעבר' };
  else if (take(/\s(?:ב)?השבוע\s|\sthis week\s/)) range = { from: iso(new Date(now.getTime() - 7 * 864e5)), to: iso(now), label: 'השבוע' };
  else if (take(/\sאתמול\s|\syesterday\s/)) { const d = iso(new Date(now.getTime() - 864e5)); range = { from: d, to: d, label: 'אתמול' }; }
  else if (take(/\sהיום\s|\stoday\s/)) range = { from: iso(now), to: iso(now), label: 'היום' };
  else if (take(/\s(?:ב|מ)?שנה (?:שעברה|הקודמת)\s|\slast year\s/)) range = { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label: 'בשנה שעברה' };
  else if (take(/\s(?:ב)?השנה\s|\sthis year\s/)) range = { from: `${y}-01-01`, to: `${y}-12-31`, label: 'השנה' };
  else {
    const season = take(/\s(?:מה|בה|ב|מ|ה)?(קיצ|חורפ|אביב|סתיו|summer|winter|spring|autumn|fall)\s/);
    if (season) {
      const s = season[1]!;
      const sm = /קיצ|summer/.test(s) ? 5 : /חורפ|winter/.test(s) ? 11 : /אביב|spring/.test(s) ? 2 : 8;
      let yy = year ?? (sm <= m ? y : y - 1);
      if (sm === 11 && !year && m < 2) yy = y - 1;
      range = { from: iso(new Date(Date.UTC(yy, sm, 1))), to: iso(new Date(Date.UTC(yy, sm + 3, 0))), label: ({ קיצ: 'קיץ', חורפ: 'חורף' } as Record<string, string>)[s] ?? s };
    } else {
      for (let i = 0; i < 12; i++) {
        const he = take(new RegExp(`\\s(?:ב|מ|ל)?${normalize(HE_MONTHS[i]!)}\\s`));
        const en = he ?? take(new RegExp(`\\s(?:${EN_MONTHS[i]}|${EN_SHORT[i]})\\s`));
        if (he || en) { const yy = year ?? (i <= m ? y : y - 1); range = { ...monthRange(yy, i), label: `${HE_MONTHS[i]} ${yy}` }; break; }
      }
    }
  }
  if (!range && year) range = { from: `${year}-01-01`, to: `${year}-12-31`, label: String(year) };
  const rest = q.replace(/\s(של|על|את|עם|from|the|on|in|about|מה|ה)\s/g, ' ').replace(/\s+/g, ' ').trim();
  return { range, rest };
}

export const inRange = (d: string | null | undefined, r: DateRange | null) => !r || (!!d && d.slice(0, 10) >= r.from && d.slice(0, 10) <= r.to);

/** Words that look like a sentence → also ask the semantic index. */
export const wantsSemantic = (rest: string) => rest.split(' ').filter(Boolean).length >= 2;

/** Cheap client-side fuzzy score (for instant filtering of the already-loaded register). */
export function fuzzyScore(hay: string, words: string[]): number {
  const h = normalize(hay);
  let score = 0;
  for (const w of words) {
    if (h.includes(w)) { score += 1; continue; }
    // one typo tolerance on words ≥4 chars
    if (w.length >= 4 && h.split(' ').some((t) => Math.abs(t.length - w.length) <= 1 && lev(t, w) <= 1)) score += 0.7;
  }
  return words.length ? score / words.length : 0;
}
function lev(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) { let prev = d[0]!; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]!; d[j] = Math.min(d[j]! + 1, d[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; } }
  return d[b.length]!;
}
