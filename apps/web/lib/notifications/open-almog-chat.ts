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
  /** טקסט פתיחה שממולא בשדה הקלט (לא נשלח אוטומטית) — ל-CTA אדפטיבי */
  prefillText?: string;
};

/**
 * פתיחת הצ'אט עם טקסט פתיחה ממולא בשדה הקלט (לא נשלח אוטומטית).
 * משמש את ה-CTA האדפטיבי בדשבורד ("בוא נחזור בעדינות" וכו').
 */
export function dispatchOpenAlmogChatWithPrefill(prefillText: string): void {
  window.dispatchEvent(
    new CustomEvent(OPEN_ALMOG_CHAT_EVENT, {
      detail: { prefillText } as unknown as OpenAlmogChatDetail,
    })
  );
}

export function dispatchOpenAlmogChatFromNotification(detail: OpenAlmogChatDetail): void {
  window.dispatchEvent(new CustomEvent(OPEN_ALMOG_CHAT_EVENT, { detail }));
}

export function dispatchOpenAlmogChat(): void {
  window.dispatchEvent(new Event(OPEN_ALMOG_CHAT_EVENT));
}
