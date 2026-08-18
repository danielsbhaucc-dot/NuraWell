/**
 * קובץ שיחה חכם — תחליף לשליחת כל ההודעות לכותב.
 */

export function conversationFileSystemInstructions(): string {
  return (
    'אתה מתחזק קובץ זיכרון קצר ומדויק לשיחת מנטור בעברית. החזר טקסט בלבד, בלי JSON ובלי כותרת מטא.\n' +
    'מבנה חובה:\n' +
    'נפתח: תאריך ושעה (ישראל) + האם זו פתיחה או המשך\n' +
    'הקשר: ...\n' +
    'בקשות חוזרות: נושא (×N); ...\n' +
    'עובדות: ...\n' +
    'התחייבויות: ...\n' +
    'טון: ...\n' +
    'פתוח: ...\n' +
    'חשוב לסשן: ...\n' +
    'כללים: עדכן מוני חזרות (אם ביקש Y פעם 4 — כתוב ×4). אל תמחק ספירות. שמור הבטחות פתוחות וסטטוס. ציין תאריכים/שעות לנקודות מפתח. קצר ומדויק.'
  );
}

export function formatConversationFilePromptBlock(summary: unknown): string | null {
  if (typeof summary !== 'string') return null;
  const clean = summary.replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const clipped = clean.length > 2800 ? `${clean.slice(0, 2800)}…` : clean;
  return `[קובץ שיחה נוכחית — זיכרון מסודר של השיחה הזו]\n${clipped}\nאם ההודעה האחרונה סותרת את הקובץ, ההודעה האחרונה קובעת. התייחס לבקשות חוזרות כמו לדפוס שזיהית בעצמך. הקובץ הוא רקע שקט — לא תירוץ להתוודות על מריבה ישנה או על טון שלא מופיע בהודעות של השיחה הזו. אם אין תור קודם של אלמוג בהיסטוריה — זו פתיחה.`;
}

export function buildConversationFileUserPrompt(params: {
  previousFile?: string;
  userMessage: string;
  assistantMessage: string;
}): string {
  return `קובץ קודם:\n${params.previousFile?.trim() || '(אין)'}\n\nהודעת משתמש:\n${params.userMessage.slice(0, 2000)}\n\nתשובת אלמוג:\n${params.assistantMessage.slice(0, 2200)}\n\nעדכן את קובץ השיחה.`;
}
