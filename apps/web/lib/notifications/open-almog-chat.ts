export const OPEN_ALMOG_CHAT_EVENT = 'open-almog-chat';

export type OpenAlmogChatDetail = {
  /** מזהה ההתראה — נשלח ל-API לצורך הקשר */
  notificationId: string;
  /** טקסט ההודעה מאלמוג (גוף ההתראה) */
  mentorMessage: string;
  title: string;
  source: string | null;
  createdAt: string;
  /** תשובה מהפופאפ — מוצגת בצ'אט כציטוט ווטסאפ ונשלחת אוטומטית */
  initialReply?: string;
};

export function dispatchOpenAlmogChatFromNotification(detail: OpenAlmogChatDetail): void {
  window.dispatchEvent(new CustomEvent(OPEN_ALMOG_CHAT_EVENT, { detail }));
}

export function dispatchOpenAlmogChat(): void {
  window.dispatchEvent(new Event(OPEN_ALMOG_CHAT_EVENT));
}
