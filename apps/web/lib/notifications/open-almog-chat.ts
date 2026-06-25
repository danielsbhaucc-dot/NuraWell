export const OPEN_ALMOG_CHAT_EVENT = 'open-almog-chat';

/** מסתיר את בועת הצ'אט הצפה כשמגירת עדכון פרופיל פתוחה */
export const PROFILE_ONBOARDING_CHAT_VISIBILITY_EVENT = 'profile-onboarding-chat-visibility';

export function setProfileOnboardingChatVisible(open: boolean): void {
  window.dispatchEvent(
    new CustomEvent(PROFILE_ONBOARDING_CHAT_VISIBILITY_EVENT, { detail: { open } })
  );
}

import type { TaskReportHint } from '../ai/task-report-hint';

export type OpenAlmogChatDetail = {
  /** מזהה ההתראה — נשלח ל-API לצורך הקשר */
  notificationId?: string;
  /** טקסט ההודעה מאלמוג (גוף ההתראה) */
  mentorMessage?: string;
  title?: string;
  source?: string | null;
  createdAt?: string;
  /** תשובה מהפופאפ — מוצגת בצ'אט כציטוט ווטסאפ ונשלחת אוטומטית */
  initialReply?: string;
  /** טקסט פתיחה שממולא בשדה הקלט (לא נשלח אוטומטית) — ל-CTA אדפטיבי */
  prefillText?: string;
  /** הקשר מובנה לדיווח משימה — נשלח ב-body, לא בפרומпт */
  taskReportHint?: TaskReportHint;
};

/**
 * פתיחת הצ'אט עם טקסט פתיחה ממולא בשדה הקלט (לא נשלח אוטומטית).
 * משמש את ה-CTA האדפטיבי בדשבורד ("בוא נחזור בעדינות" וכו').
 */
export function dispatchOpenAlmogChatWithPrefill(prefillText: string): void {
  window.dispatchEvent(
    new CustomEvent(OPEN_ALMOG_CHAT_EVENT, {
      detail: { prefillText } satisfies OpenAlmogChatDetail,
    })
  );
}

/**
 * פתיחה עם prefill + hint מובנה — אלמוג יודע בדיוק איזו משימה/סלוט בלי לנחש מהטקסט.
 */
export function dispatchOpenAlmogChatWithTaskReport(
  prefillText: string,
  taskReportHint: TaskReportHint
): void {
  window.dispatchEvent(
    new CustomEvent(OPEN_ALMOG_CHAT_EVENT, {
      detail: { prefillText, taskReportHint } satisfies OpenAlmogChatDetail,
    })
  );
}

export function dispatchOpenAlmogChatFromNotification(detail: OpenAlmogChatDetail): void {
  window.dispatchEvent(new CustomEvent(OPEN_ALMOG_CHAT_EVENT, { detail }));
}

export function dispatchOpenAlmogChat(): void {
  window.dispatchEvent(new Event(OPEN_ALMOG_CHAT_EVENT));
}
