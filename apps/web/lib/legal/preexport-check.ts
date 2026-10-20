import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyUserEvidence, type EvidenceRow } from './evidence-verify';
import { loadEvidenceImage } from './evidence-storage';
import { referenceFor } from './evidence-export';

export type Severity = 'critical' | 'warn' | 'ok';
export type FixAction = 'retry_tsa' | 'ots_stamp' | 'ots_upgrade' | 'resend_receipt' | 'anchor_chain';
export type PreCheckItem = {
  key: string;
  severity: Severity;
  title: string;
  what: string;
  steps: string[];
  fix: FixAction | null;
  fixLabel?: string;
  events: Array<{ n: number; id: string; reference: string }>;
};
export type PreCheck = { checkedAt: string; critical: number; warn: number; items: PreCheckItem[]; canExport: boolean };

const FIX_LABEL: Record<FixAction, string> = {
  retry_tsa: 'לבקש חותמת זמן עכשיו',
  ots_stamp: 'לעגן עכשיו',
  ots_upgrade: 'לבדוק אישור בביטקוין',
  resend_receipt: 'לשלוח שוב את הקבלה',
  anchor_chain: 'לעגן את השרשרת עכשיו',
};

/** Pure: turns verified records into the pre-export checklist (also used by tests). */
export function buildPreCheckItems(input: {
  records: Array<Pick<EvidenceRow, 'id' | 'created_at' | 'record_hash' | 'screenshot_sha256' | 'screenshot_segments' | 'payload_json'>>;
  checks: Awaited<ReturnType<typeof verifyUserEvidence>>['checks'];
  attestations: Array<{ record_id: string | null; kind: string; payload: Record<string, unknown> }>;
  shotMeta?: Record<string, { w: number; h: number } | null>;
  logsConfigured: { supabase: boolean; vercel: boolean };
  now?: Date;
}): PreCheckItem[] {
  const map = new Map<string, PreCheckItem>();
  const add = (base: Omit<PreCheckItem, 'events' | 'fixLabel'>, ev?: { n: number; id: string; reference: string }) => {
    const it = map.get(base.key) ?? { ...base, fixLabel: base.fix ? FIX_LABEL[base.fix] : undefined, events: [] };
    if (ev && !it.events.some((e) => e.id === ev.id)) it.events.push(ev);
    map.set(base.key, it);
  };
  const now = input.now ?? new Date();
  input.records.forEach((r, i) => {
    const c = input.checks.find((x) => x.id === r.id);
    if (!c) return;
    const ev = { n: i + 1, id: r.id, reference: referenceFor(r as never) };
    const payload = (() => { try { return JSON.parse(r.payload_json) as { request_id?: unknown; client?: { viewport_w?: number; viewport_h?: number } | null }; } catch { return {}; } })();
    if (!c.signature) add({ key: 'signature', severity: 'critical', title: 'החתימה הדיגיטלית לא תואמת', what: 'תוכן הרשומה השתנה אחרי שנחתם, או שנחתם במפתח אחר.', steps: ['לא לשנות שום דבר במסד הנתונים.', 'לבדוק בגיבוי של מסד הנתונים מה היה התוכן המקורי של הרשומה.', 'אם אין הסבר, להפיק את התיק עם עקיפה, כדי שהכשל יופיע בו בגלוי.'], fix: null }, ev);
    if (!c.chain || !c.record_hash) add({ key: 'chain', severity: 'critical', title: 'שרשרת הרשומות שבורה', what: 'רשומה נמחקה, הוחלפה או שונתה באמצע הרצף.', steps: ['לבדוק ביומן הניהול אם מישהו מחק או ערך רשומות.', 'לשחזר את הרשומה החסרה מהגיבוב, אם יש.', 'לא ליצור רשומה חדשה במקומה.'], fix: null }, ev);
    if (!c.snapshot) add({ key: 'snapshot', severity: 'critical', title: 'הנוסח השמור לא תואם לגיבוב', what: 'אי אפשר להראות בוודאות איזה נוסח הוצג באירוע הזה.', steps: ['לבדוק בגיבוי את עמודת הנוסח של הרשומה.', 'לא לערוך את הנוסח ידנית.'], fix: null }, ev);
    if (!c.tsa.ok) add({ key: 'tsa', severity: 'critical', title: 'חסרה חותמת זמן חיצונית (FreeTSA)', what: 'אין אישור של צד שלישי לשעת האירוע. השעה נשענת רק על השרת שלנו.', steps: ['ללחוץ על "לבקש חותמת זמן עכשיו".', 'החותמת החדשה תראה את השעה של היום, לא של האירוע, והמסמך יציין את זה בגלוי.', 'ללחוץ "בדוק שוב".'], fix: 'retry_tsa' }, ev);
    if (c.screenshot.present && c.screenshot.ok === false) add({ key: 'shot_mismatch', severity: 'critical', title: 'צילום החלון חסר או לא תואם לגיבוב', what: 'לפחות חלק אחד מהצילום לא נמצא באחסון, או שהקובץ השתנה אחרי שנחתם.', steps: ['לבדוק באחסון הקבצים אם הקובץ קיים בגרסה קודמת.', 'אם נמצא, להחזיר אותו בדיוק לאותו מיקום (בלי לשנות שם).', 'ללחוץ "בדוק שוב". אסור להעלות צילום אחר במקומו.'], fix: null }, ev);
    if (!c.screenshot.present) add({ key: 'shot_missing', severity: 'warn', title: 'אין צילום חלון לאירוע', what: 'מה שהמשתמש ראה מוכח מהנוסח השמור והמילה שהקליד, בלי תמונה (למשל ביטול מתוך שיחה).', steps: ['אין מה לתקן. זה תקין לאירועים מתוך שיחה.', 'המסמך יציין שאין צילום.'], fix: null }, ev);
    const meta = input.shotMeta?.[r.id];
    const vw = payload.client?.viewport_w ?? 0;
    const vh = payload.client?.viewport_h ?? 0;
    if (c.screenshot.present && meta && (r.screenshot_segments ?? []).length <= 1 && vw > 0 && vh > 0) {
      const ratio = meta.h / meta.w;
      if (ratio > 0 && Math.abs(ratio - vh / vw) / (vh / vw) < 0.12) add({ key: 'shot_cropped', severity: 'warn', title: 'ייתכן שהצילום חתוך לגובה המסך', what: 'הצילום נלכד לפני שהמערכת צילמה את כל החלון בגלילה, ולכן ייתכן שהחלק התחתון (הסימון והמילה) לא נראה בו.', steps: ['אין לשנות את הצילום הקיים.', 'הסימון והמילה מוכחים בנפרד ברשומה החתומה ובאישור השרת. המסמך יפנה אליהם.'], fix: null }, ev);
    }
    const atts = input.attestations.filter((a) => a.record_id === r.id);
    if (c.ots.calendars === 0) add({ key: 'ots_none', severity: 'warn', title: 'אין עיגון ציבורי (OpenTimestamps)', what: 'חסרה שכבת הגנה אחת. החתימה וחותמת הזמן עדיין קיימות.', steps: ['ללחוץ על "לעגן עכשיו".', 'ללחוץ "בדוק שוב".'], fix: 'ots_stamp' }, ev);
    else {
      const confirmed = atts.some((a) => a.kind === 'ots_upgrade');
      const ageDays = (now.getTime() - new Date(r.created_at).getTime()) / 86_400_000;
      if (!confirmed && ageDays > 1) add({ key: 'ots_pending', severity: ageDays > 7 ? 'warn' : 'ok', title: 'העיגון בביטקוין עדיין ממתין', what: ageDays > 7 ? 'עבר יותר משבוע ועדיין אין אישור מהבלוקצ׳יין.' : 'זה תקין בימים הראשונים אחרי האירוע.', steps: ['ללחוץ על "לבדוק אישור בביטקוין".', 'אם עדיין ממתין, לחכות יום ולבדוק שוב.'], fix: 'ots_upgrade' }, ev);
    }
    const mail = atts.find((a) => a.kind === 'email_receipt');
    if (!c.email_receipt) add({ key: 'email', severity: 'warn', title: mail ? 'שליחת הקבלה למשתמש נכשלה' : 'אין תיעוד של קבלה בדואר', what: 'אין עותק אצל צד שלישי (תיבת הדואר של המשתמש). שאר הראיות לא נפגעות.', steps: ['ללחוץ על "לשלוח שוב את הקבלה". המשתמש יקבל מייל עם מספר האסמכתא.', 'הקבלה תציין את תאריך השליחה בפועל.', 'ללחוץ "בדוק שוב".'], fix: 'resend_receipt' }, ev);
    if (typeof payload.request_id !== 'string' || !payload.request_id) add({ key: 'request_id', severity: 'warn', title: 'חסר מזהה הבקשה של ספק האירוח', what: 'הרשומה נוצרה לפני שהמערכת שמרה את מזהה הבקשה, ולכן אי אפשר להצליב אותה מול יומני האירוח.', steps: ['אין מה לתקן ברשומה ישנה.', 'האישור העצמאי בצד השרת עדיין מקשר את האירוע לפי זמן.'], fix: null }, ev);
  });
  if (!input.logsConfigured.supabase || !input.logsConfigured.vercel) add({ key: 'provider_logs', severity: 'warn', title: 'שליפת יומני ספקים לא הוגדרה', what: 'אי אפשר לצרף יומנים מהספקים עצמם (מסד הנתונים והאירוח). הם נדרשים רק אם מישהו טוען שהנתונים זויפו.', steps: ['לאשר יצירה של שני מפתחות קריאה בלבד אצל הספקים.', 'אחרי שיוגדרו, כפתור "יומני ספק" ליד כל אירוע ישלוף אותם לפי בקשה.'], fix: null });
  if (input.records.length) add({ key: 'chain_anchor', severity: 'ok', title: 'עיגון השרשרת', what: 'ראש השרשרת מעוגן פעם ביום. אפשר לעגן גם עכשיו, לפני ההפקה.', steps: ['לא חובה. ללחוץ על "לעגן את השרשרת עכשיו" אם רוצים חותמת עדכנית.'], fix: 'anchor_chain' });
  const rank = { critical: 0, warn: 1, ok: 2 } as const;
  return [...map.values()].sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export async function runPreExportCheck(admin: SupabaseClient, userId: string): Promise<PreCheck> {
  const v = await verifyUserEvidence(admin, userId, { checkImages: true });
  const sharp = (await import('sharp')).default;
  const shotMeta: Record<string, { w: number; h: number } | null> = {};
  for (const r of v.records as EvidenceRow[]) {
    if (!r.screenshot_sha256 || (r.screenshot_segments ?? []).length > 1) continue;
    const img = await loadEvidenceImage(admin, userId, r.screenshot_storage, r.screenshot_key).catch(() => null);
    const m = img ? await sharp(img).metadata().catch(() => null) : null;
    shotMeta[r.id] = m?.width && m.height ? { w: m.width, h: m.height } : null;
  }
  const items = buildPreCheckItems({
    records: v.records as EvidenceRow[],
    checks: v.checks,
    attestations: v.attestations,
    shotMeta,
    logsConfigured: { supabase: true, vercel: !!process.env.LEGAL_LOGS_VERCEL_TOKEN?.trim() },
  });
  const critical = items.filter((i) => i.severity === 'critical').length;
  return { checkedAt: new Date().toISOString(), critical, warn: items.filter((i) => i.severity === 'warn').length, items, canExport: critical === 0 };
}
