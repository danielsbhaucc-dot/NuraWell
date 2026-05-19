import type { OpenAlmogChatDetail } from './open-almog-chat';

export const OPEN_ALMOG_REPLY_EVENT = 'open-almog-reply';

export type OpenAlmogReplyDetail = OpenAlmogChatDetail & {
  onMarkRead?: () => void;
};

export function dispatchOpenAlmogReply(detail: OpenAlmogReplyDetail): void {
  window.dispatchEvent(new CustomEvent(OPEN_ALMOG_REPLY_EVENT, { detail }));
}
