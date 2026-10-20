import 'server-only';
/** Hebrew RTL legal report for one media asset — same design system as the consent evidence report. */
import { PDFDocument, rgb } from 'pdf-lib';
import { C, H, M, W, Writer, fmt, loadFonts } from '../evidence-pdf';
import { FIELD_LABEL_HE, GENERATORS, SOURCE_LABEL_HE, type Provenance, type SourceType } from './core';

export type MediaPdfInput = {
  caseRef: string; generatedAt: string; generatedBy: string;
  asset: { key: string; title: string; kind: string; origin: string; path: string | null; mime: string | null; bytes: number | null; width: number | null; height: number | null; sha256: string | null; phash: string | null; usages: string[]; status: string; ai_description: string | null };
  provenance: Provenance; missing: string[];
  preview: Buffer | null; // jpeg
  git: { first: { sha: string; author: string; date: string; subject: string; url?: string } | null; last: { sha: string; author: string; date: string; subject: string; url?: string } | null; commits: number | null };
  embedded: Array<[string, string]>;
  snapshots: Array<{ url: string; at: string; status: number; sha: string | null; wayback: string | null }>;
  attachments: Array<{ name: string; label: string; sha256: string }>;
  records: Array<{ n: number; event: string; at: string; hash: string; prev: string; signature: string; keyId: string; tsaOk: boolean; tsaTime: string | null; ots: number; problems: string[] }>;
  overallOk: boolean; fileOk: boolean | null;
  anchors: Array<{ at: string; head: string; count: number }>;
};

const EVENT_HE: Record<string, string> = { scan: 'סריקה ותיעוד הקובץ', provenance: 'עדכון מקור', license_snapshot: 'שמירת עמוד רישיון', attachment: 'צירוף מסמך', ai_describe: 'תיאור אוטומטי' };
const KIND_HE: Record<string, string> = { image: 'תמונה', illustration: 'איור', icon: 'אייקון', audio: 'שמע', video: 'וידאו', font: 'גופן', file: 'קובץ' };
const STATUS_HE: Record<string, string> = { verified: 'מקור מתועד במלואו', draft: 'חסרים פרטים', missing_source: 'חסר מקור' };

export async function buildMediaEvidencePdf(i: MediaPdfInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`תיק ראיות מדיה — ${i.caseRef}`);
  doc.setAuthor('NuraWell');
  doc.setCreationDate(new Date(i.generatedAt));
  const f = await loadFonts(doc);
  const w = new Writer(doc, f, i.caseRef, 'NuraWell · תיק ראיות למקור מדיה');
  const p0 = i.provenance;
  const st = (p0.source_type ?? 'unknown') as SourceType;

  w.newPage();
  const p = w.page;
  p.drawRectangle({ x: 0, y: H - 330, width: W, height: 324, color: rgb(0.04, 0.24, 0.2) });
  p.drawCircle({ x: W - 70, y: H - 90, size: 120, color: C.gold, opacity: 0.16 });
  p.drawCircle({ x: 60, y: H - 300, size: 90, color: rgb(1, 1, 1), opacity: 0.05 });
  p.drawRectangle({ x: 0, y: H - 336, width: W, height: 6, color: C.gold });
  w.text('NuraWell', { size: 13, font: f.head, color: C.goldSoft, y: H - 80 });
  w.text('תיק ראיות', { size: 34, font: f.headBold, color: C.white, y: H - 140 });
  w.text('מקור וזכויות של קובץ מדיה', { size: 20, font: f.head, color: C.white, y: H - 172 });
  w.text(`${i.asset.title} · ${SOURCE_LABEL_HE[st]}`, { size: 12, color: C.goldSoft, y: H - 210 });
  p.drawText(i.caseRef, { x: M, y: H - 300, size: 10, font: f.mono, color: C.goldSoft });
  w.text(`הופק: ${fmt(i.generatedAt)}`, { size: 10, color: C.goldSoft, y: H - 300 });
  w.y = H - 380;
  w.h2('תמצית');
  w.para('מסמך זה מתעד מאיפה הגיע הקובץ, באיזה רישיון או מנוי הוא נוצר, היכן הוא בשימוש באתר, ואת טביעות האצבע הקריפטוגרפיות שלו. כל רשומה נחתמה בידי השרת ברגע יצירתה, שורשרה לרשומה הקודמת, וקיבלה חותמת זמן מגורמים חיצוניים ובלתי תלויים.');
  w.badge(i.overallOk, i.overallOk ? 'בדיקת שלמות מלאה עברה בהצלחה' : 'נמצאו חריגות בבדיקת השלמות (פירוט בסעיף 5)', W - M, w.y);
  w.y -= 30;
  w.kv([['מספר תיק', i.caseRef, 'ltr'], ['הופק על ידי', i.generatedBy], ['מצב התיעוד', STATUS_HE[i.asset.status] ?? i.asset.status],
    ['תוכן', '1. הקובץ · 2. מקור ורישיון · 3. היסטוריית קוד · 4. עמודי רישיון ומסמכים · 5. רשומות וחתימות · 6. אימות עצמאי']]);

  w.newPage('1. הקובץ');
  if (i.preview) { const img = await doc.embedJpg(i.preview); w.image(img, W - 2 * M - 120, 220); }
  w.kv([['שם', i.asset.title], ['סוג', KIND_HE[i.asset.kind] ?? i.asset.kind], ['מיקום', i.asset.path ?? '—', 'ltr'], ['סוג קובץ', i.asset.mime ?? '—', 'ltr'],
    ['גודל', i.asset.bytes ? `${i.asset.bytes.toLocaleString('he-IL')} בתים` : '—'], ['מידות', i.asset.width ? `${i.asset.width}×${i.asset.height}` : '—', 'ltr'],
    ['טביעת אצבע (SHA-256)', i.asset.sha256 ?? '—', 'mono'], ['גיבוב תפיסתי (dHash)', i.asset.phash ?? '—', 'mono'],
    ['התאמה לקובץ המקורי', i.fileOk === null ? 'לא נבדק' : i.fileOk ? 'הקובץ זהה לחלוטין לקובץ שתועד' : 'הקובץ שונה מהקובץ שתועד']]);
  if (i.asset.ai_description) { w.h2('תיאור'); w.para(i.asset.ai_description); }
  w.h2('היכן בשימוש באתר');
  for (const u of i.asset.usages.length ? i.asset.usages : ['—']) w.para(`• ${u}`, { size: 9.5, gap: 1 });
  if (i.embedded.length) { w.h2('מידע מוטמע בקובץ'); w.kv(i.embedded.map(([k, v]) => [k, v, 'ltr'] as [string, string, 'ltr'])); }

  w.newPage('2. מקור ורישיון');
  const rows: Array<[string, string, ('mono' | 'ltr')?]> = [['סוג המקור', SOURCE_LABEL_HE[st]]];
  const add = (label: string, v: string | null | undefined, mode?: 'mono' | 'ltr') => { if (v) rows.push([label, v, mode]); };
  add('קישור למקור', p0.source_url, 'ltr'); add('יוצר', p0.author); add('קישור ליוצר', p0.author_url, 'ltr');
  add('רישיון', p0.license_name); add('קישור לרישיון', p0.license_url, 'ltr');
  add('מחולל', p0.generator ? GENERATORS[p0.generator]?.label : null); add('מודל', p0.model, 'ltr'); add('תאריך יצירה', p0.created_on, 'ltr');
  add('חשבון', p0.account); add('מסלול מנוי', p0.plan); add('מזהה שיר', p0.track_id, 'ltr'); add('קישור לשיר', p0.track_url, 'ltr'); add('תנאי שימוש של המחולל', p0.tos_url, 'ltr');
  add('הערות', p0.notes); rows.push(['אושר על ידי הבעלים', p0.confirmed_by_owner ? 'כן' : 'עדיין לא']);
  w.kv(rows);
  if (p0.prompt) { w.h2('הפרומפט המלא'); w.para(p0.prompt, { size: 9.5 }); }
  if (i.missing.length) { w.h2('פרטים שעדיין חסרים'); for (const m of i.missing) w.para(`• ${FIELD_LABEL_HE[m as keyof Provenance] ?? m}`, { size: 9.5, color: C.rose, gap: 1 }); }

  w.newPage('3. היסטוריית קוד (git)');
  if (i.git.first) {
    w.para('הקובץ נשמר במאגר הקוד של הפרויקט. כל שמירה (commit) מזוהה בגיבוב שתלוי בכל ההיסטוריה שלפניה, ולכן אי אפשר לשנות תאריך או תוכן בדיעבד בלי לשנות את כל הגיבובים שאחריו. העותק של המאגר בשירות האירוח החיצוני מהווה עד בלתי תלוי.');
    w.kv([['הופעה ראשונה', i.git.first.sha, 'mono'], ['תאריך', fmt(i.git.first.date)], ['מחבר', i.git.first.author], ['תיאור', i.git.first.subject],
      ...(i.git.first.url ? [['קישור', i.git.first.url, 'ltr'] as [string, string, 'ltr']] : []),
      ...(i.git.last ? [['שינוי אחרון', i.git.last.sha, 'mono'] as [string, string, 'mono'], ['תאריך', fmt(i.git.last.date)] as [string, string]] : []),
      ['מספר שינויים', String(i.git.commits ?? '—')]]);
  } else w.para('הקובץ לא שמור במאגר הקוד (קובץ שהועלה לאחסון), ולכן ההוכחה מבוססת על הרשומות החתומות בסעיף 5.');

  w.newPage('4. עמודי רישיון ומסמכים');
  if (i.snapshots.length) w.table(['תאריך שמירה', 'כתובת', 'סטטוס', 'גיבוב'], [120, 210, 50, 127], i.snapshots.map((s) => [fmt(s.at), s.url, String(s.status || '—'), s.sha ? s.sha.slice(0, 20) : 'לא נשמר']));
  else w.para('לא נשמרו עמודי רישיון לקובץ זה.');
  const wb = i.snapshots.filter((s) => s.wayback);
  if (wb.length) { w.h2('עותק בארכיון האינטרנט (גורם שלישי)'); for (const s of wb) w.para(s.wayback!, { size: 8.5 }); }
  w.h2('מסמכים מצורפים (קבלות, חשבוניות, צילומים)');
  if (i.attachments.length) w.table(['תיאור', 'שם קובץ', 'גיבוב'], [140, 190, 177], i.attachments.map((a) => [a.label, a.name, a.sha256.slice(0, 24)]));
  else w.para('אין מסמכים מצורפים.');

  w.newPage('5. רשומות, חתימות וחותמות זמן');
  w.table(['#', 'אירוע', 'תאריך', 'חותמת זמן', 'עיגון'], [26, 140, 170, 90, 81], i.records.map((r) => [String(r.n), EVENT_HE[r.event] ?? r.event, fmt(r.at), r.tsaOk ? 'תקינה' : 'חסרה', r.ots ? `${r.ots} יומנים` : '—']));
  for (const r of i.records) {
    w.h2(`רשומה ${r.n} · ${EVENT_HE[r.event] ?? r.event}`);
    w.kv([['גיבוב הרשומה', r.hash, 'mono'], ['גיבוב קודם', r.prev, 'mono'], ['חתימת השרת', r.signature, 'mono'], ['מזהה מפתח', r.keyId, 'mono'],
      ['חותמת זמן RFC 3161', r.tsaOk ? fmt(r.tsaTime) : 'לא התקבלה'], ['תקינות', r.problems.length ? r.problems.join(', ') : 'תקין']]);
  }
  if (i.anchors.length) { w.h2('עיגון ציבורי יומי של כל השרשרת'); w.table(['תאריך', 'ראש השרשרת', 'רשומות'], [150, 290, 67], i.anchors.slice(-8).map((a) => [fmt(a.at), a.head.slice(0, 40), String(a.count)])); }

  w.newPage('6. אימות עצמאי');
  w.para('כל הבדיקות אפשר לבצע בלי גישה למערכת, עם כלים חופשיים בלבד. ההוראות המלאות נמצאות בקובץ VERIFY.txt שבתיק:');
  for (const l of ['1. גיבוב הקובץ המקורי (file/) זהה לגיבוב שבסעיף 1.', '2. כל רשומה: גיבוב payload.json זהה ל-record.sha256, ו-prev_hash מצביע על הרשומה הקודמת.', '3. חתימת Ed25519 נבדקת מול public-key.pem.', '4. חותמת הזמן (timestamp.tsr) נבדקת מול שרשרת התעודות של רשות חותמות הזמן.', '5. קובצי ‎.ots‎ נבדקים מול הבלוקצ׳יין של ביטקוין.', '6. היסטוריית git נבדקת מול המאגר החיצוני (קישור בסעיף 3).']) w.para(l, { size: 10 });
  return Buffer.from(await doc.save());
}
