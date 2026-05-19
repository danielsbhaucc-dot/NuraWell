/** בלוק הקשר לפרומפט המערכת כשהמשתמש עונה על התראה בצ'אט. */
export function formatNotificationReplyContextBlock(params: {
  title: string;
  body: string;
  source: string | null;
  createdAt: string;
}): string {
  const bodySnippet = params.body.trim().slice(0, 320);
  return `[מענה להתראה]
אלמוג כתב: "${bodySnippet}"
המשתמש עונה עכשיו — המשך בשיחה טבעית; התייחס לשאלה/למגע ולתשובה.
אל תחזור על ההתראה במלואה; אל תציין "קיבלתי התראה" או "המערכת".`;
}
