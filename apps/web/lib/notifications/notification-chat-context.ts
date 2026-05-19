/** בלוק הקשר לפרומפט המערכת כשהמשתמש עונה על התראה בצ'אט. */
export function formatNotificationReplyContextBlock(params: {
  title: string;
  body: string;
  source: string | null;
  createdAt: string;
}): string {
  const sourceLine = params.source ? `\nמקור פנימי: ${params.source}` : '';
  return `[הקשר מהתראה — המשתמש עונה עכשיו בצ'אט]
אלמוג שלח התראה (${params.createdAt}):
כותרת: ${params.title}
הודעה: ${params.body}${sourceLine}

המשך את השיחה בצורה טבעית — התייחס ישירות לשאלה/למגע שנשלח בהתראה ולתשובת המשתמש.
אל תחזור על כל ההודעה במלואה ואל תציין "קיבלתי התראה".`;
}
