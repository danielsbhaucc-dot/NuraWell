export const OPEN_ALMOG_CHAT_EVENT = 'open-almog-chat';

/** מסתיר את בועת הצ'אט הצפה כשמגירת עדכון פרופיל פתוחה */
export const PROFILE_ONBOARDING_CHAT_VISIBILITY_EVENT = 'profile-onboarding-chat-visibility';

export function setProfileOnboardingChatVisible(open: boolean): void {
  window.dispatchEvent(
    new CustomEvent(PROFILE_ONBOARDING_CHAT_VISIBILITY_EVENT, { detail: { open } })
  );
}

import type { TaskReportHint } from '../ai/task-report-hint';
import type { GuideContextHint } from '../ai/guide-context-hint';

export type OpenAlmogChatDetail = {
  notificationId?: string;
  mentorMessage?: string;
  title?: string;
  source?: string | null;
  createdAt?: string;
  initialReply?: string;
  prefillText?: string;
  taskReportHint?: TaskReportHint;
  guideContextHint?: GuideContextHint;
};

export function dispatchOpenAlmogChatWithPrefill(prefillText: string): void {
  window.dispatchEvent(
    new CustomEvent(OPEN_ALMOG_CHAT_EVENT, {
      detail: { prefillText } satisfies OpenAlmogChatDetail,
    })
  );
}

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

export function dispatchOpenAlmogChatWithGuideContext(
  prefillText: string,
  guideContextHint: GuideContextHint
): void {
  window.dispatchEvent(
    new CustomEvent(OPEN_ALMOG_CHAT_EVENT, {
      detail: { prefillText, guideContextHint } satisfies OpenAlmogChatDetail,
    })
  );
}

export function dispatchOpenAlmogChatFromNotification(detail: OpenAlmogChatDetail): void {
  window.dispatchEvent(new CustomEvent(OPEN_ALMOG_CHAT_EVENT, { detail }));
}

export function dispatchOpenAlmogChat(): void {
  window.dispatchEvent(new Event(OPEN_ALMOG_CHAT_EVENT));
}
