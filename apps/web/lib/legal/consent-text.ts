/**
 * Single source of truth for the health-consent sheet text. The server renders the exact
 * same content into the evidence snapshot (authoritative); the client renders it in the sheet.
 * Any wording change MUST bump CONSENT_TEXT_VERSION.
 */
export const CONSENT_TEXT_VERSION = 'hc-2026-10-20.2';

export type ConsentAction = 'grant' | 'withdraw';
export type ConsentGender = 'female' | 'male' | null;

export type ConsentText = {
  version: string;
  action: ConsentAction;
  title: string;
  intro: string;
  sections: Array<{ heading: string; items: string[] }>;
  transparency: string;
  why: string;
  checkboxLabel: string;
  typePrompt: string;
  expectedWord: string;
  submitLabel: string;
};

const g = (gender: ConsentGender, fem: string, mas: string, neu: string) =>
  gender === 'female' ? fem : gender === 'male' ? mas : neu;

export function normalizeGender(v: unknown): ConsentGender {
  return v === 'female' || v === 'male' ? v : null;
}

export function expectedConsentWord(action: ConsentAction, gender: ConsentGender): string {
  if (action === 'grant') return g(gender, 'מסכימה', 'מסכים', 'מסכים/ה');
  return g(gender, 'מבטלת', 'מבטל', 'מבטל/ת');
}

export const CONSENT_TRANSPARENCY = 'לתיעוד ההסכמה נשמרים צילום של החלון, השעה ופרטי המכשיר.';
export const CONSENT_WHY = 'כדי להגן גם עליך: כך תמיד אפשר להוכיח מה בדיוק אושר ומתי, ואף אחד לא יכול לשנות את זה בדיעבד.';

export function consentText(action: ConsentAction, gender: ConsentGender): ConsentText {
  const word = expectedConsentWord(action, gender);
  if (action === 'grant') {
    return {
      version: CONSENT_TEXT_VERSION,
      action,
      title: 'הסכמה לשמירת מידע בריאותי',
      intro: g(
        gender,
        'אין שום לחץ. אם תסכימי, אלמוג יוכל לשמור ולהשתמש במידע הבריאותי שלך כדי ללוות אותך באופן אישי.',
        'אין שום לחץ. אם תסכים, אלמוג יוכל לשמור ולהשתמש במידע הבריאותי שלך כדי ללוות אותך באופן אישי.',
        'אין שום לחץ. עם הסכמה, אלמוג יוכל לשמור ולהשתמש במידע הבריאותי כדי ללוות באופן אישי.'
      ),
      sections: [
        {
          heading: 'מה יישמר',
          items: ['משקל, גובה ויעד', 'מדידות לאורך הזמן', 'העדפות תזונה, רמת פעילות ומצבים בריאותיים שסיפרת עליהם'],
        },
        {
          heading: 'איך זה נשמר',
          items: ['מוצפן, בשרתים באירופה', 'רק לצורך הליווי שלך, לא לפרסום ולא למכירה', 'ספקי בינה מלאכותית מקבלים רק מידע שלא מזהה אותך'],
        },
        {
          heading: 'תמיד בשליטה שלך',
          items: [g(gender, 'אפשר לבטל בכל רגע, בהגדרות הפרטיות או פשוט לבקש מאלמוג', 'אפשר לבטל בכל רגע, בהגדרות הפרטיות או פשוט לבקש מאלמוג', 'אפשר לבטל בכל רגע, בהגדרות הפרטיות או פשוט לבקש מאלמוג'), 'בביטול, כל המידע הבריאותי נמחק'],
        },
      ],
      transparency: CONSENT_TRANSPARENCY,
      why: CONSENT_WHY,
      checkboxLabel: g(gender, 'קראתי והבנתי, ואני נותנת הסכמה מפורשת לשמירת מידע בריאותי', 'קראתי והבנתי, ואני נותן הסכמה מפורשת לשמירת מידע בריאותי', 'קראתי והבנתי, ואני נותן/ת הסכמה מפורשת לשמירת מידע בריאותי'),
      typePrompt: `כדי לאשר, ${g(gender, 'כתבי', 'כתוב', 'יש לכתוב')} את המילה "${word}"`,
      expectedWord: word,
      submitLabel: 'אישור הסכמה',
    };
  }
  return {
    version: CONSENT_TEXT_VERSION,
    action,
    title: 'ביטול ההסכמה למידע בריאותי',
    intro: g(
      gender,
      'זו לגמרי זכותך. לפני שמאשרים, הנה בדיוק מה יקרה:',
      'זו לגמרי זכותך. לפני שמאשרים, הנה בדיוק מה יקרה:',
      'זו לגמרי זכות שלך. לפני שמאשרים, הנה בדיוק מה יקרה:'
    ),
    sections: [
      {
        heading: 'מה יימחק מיד',
        items: ['משקל, גובה, יעד ומצבים בריאותיים מהפרופיל', 'כל המדידות שנשמרו', 'כל מה שאלמוג זכר על בריאות, משקל ותזונה', 'הודעות קודמות שנוגעות לבריאות יימחקו מהיסטוריית השיחות, וגם כותרות וסיכומים של שיחות כאלה'],
      },
      {
        heading: 'מה ישתנה',
        items: ['אלמוג לא ידבר על בריאות, משקל או תזונה', 'הודעה עם מידע בריאותי תימחק מיד ולא תישמר בשום מקום', 'כל השאר בליווי ממשיך כרגיל'],
      },
      {
        heading: 'ואם משנים את הדעת',
        items: ['אפשר להפעיל שוב בכל רגע, בהגדרות או בבקשה מאלמוג', 'המידע שנמחק לא חוזר, מתחילים מחדש'],
      },
    ].map((s) =>
      s.heading === 'ואם משנים את הדעת' ? { ...s, heading: g(gender, 'ואם תתחרטי', 'ואם תתחרט', 'ואם משנים את הדעת') } : s
    ),
    transparency: CONSENT_TRANSPARENCY,
    why: CONSENT_WHY,
    checkboxLabel: g(gender, 'קראתי והבנתי מה יימחק, ואני מבטלת את ההסכמה', 'קראתי והבנתי מה יימחק, ואני מבטל את ההסכמה', 'קראתי והבנתי מה יימחק, ואני מבטל/ת את ההסכמה'),
    typePrompt: `כדי לאשר, ${g(gender, 'כתבי', 'כתוב', 'יש לכתוב')} את המילה "${word}"`,
    expectedWord: word,
    submitLabel: 'ביטול ההסכמה ומחיקה',
  };
}

const NIKUD = /[\u0591-\u05C7]/g;
export function normalizeTyped(s: string): string {
  return String(s ?? '')
    .replace(NIKUD, '')
    .replace(/[\s"'״׳.,!?־\-/\\()]+/g, '')
    .replace(/^אני/, '')
    .replace(/^כן/, '')
    .trim();
}

const GRANT_OK = new Set(['מסכים', 'מסכימה', 'מסכימ', 'מסכיםה', 'מסכימים', 'מסכימות', 'מאשר', 'מאשרת', 'מסכיםמסכימה']);
const WITHDRAW_OK = new Set(['מבטל', 'מבטלת', 'מבטלמבטלת', 'מבטלים', 'מאשר', 'מאשרת', 'מסכים', 'מסכימה']);

/** Accepts gender variants and light typos of form (spaces, nikud, "אני ..."), not unrelated words. */
export function isAcceptedConsentWord(action: ConsentAction, typed: string): boolean {
  const n = normalizeTyped(typed);
  if (!n || n.length > 20) return false;
  return (action === 'grant' ? GRANT_OK : WITHDRAW_OK).has(n);
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Deterministic HTML snapshot of exactly what the user saw (stored + hashed). */
export function renderConsentHtml(t: ConsentText, filled: { checkbox: boolean; typed: string }): string {
  const secs = t.sections
    .map((s) => `<section><h3>${esc(s.heading)}</h3><ul>${s.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></section>`)
    .join('');
  return (
    `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${esc(t.title)}</title></head><body>` +
    `<article data-version="${esc(t.version)}" data-action="${t.action}"><h2>${esc(t.title)}</h2><p>${esc(t.intro)}</p>${secs}` +
    `<aside><p>${esc(t.transparency)}</p><p>${esc(t.why)}</p></aside>` +
    `<label><input type="checkbox"${filled.checkbox ? ' checked' : ''} disabled> ${esc(t.checkboxLabel)}</label>` +
    `<p>${esc(t.typePrompt)}</p><input type="text" value="${esc(filled.typed)}" disabled>` +
    `<button disabled>${esc(t.submitLabel)}</button></article></body></html>`
  );
}
