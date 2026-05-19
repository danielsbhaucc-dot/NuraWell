import { describe, expect, it } from 'vitest';
import {
  isNotificationReplyable,
  notificationBodyHasQuestion,
} from '../lib/notifications/replyable';

describe('notificationBodyHasQuestion', () => {
  it('detects question mark at end', () => {
    expect(notificationBodyHasQuestion('איך אתה מרגיש היום?')).toBe(true);
  });

  it('ignores statements without question', () => {
    expect(notificationBodyHasQuestion('כל הכבוד על ההתמדה.')).toBe(false);
  });
});

describe('isNotificationReplyable', () => {
  it('allows almog ai_message with question', () => {
    expect(
      isNotificationReplyable({
        type: 'ai_message',
        mentorId: 'almog',
        body: 'מה הכי קטן שאפשר לעשות עכשיו?',
      })
    ).toBe(true);
  });

  it('blocks dolev messages', () => {
    expect(
      isNotificationReplyable({
        type: 'ai_message',
        mentorId: 'dolev',
        body: 'מה שלומך?',
      })
    ).toBe(false);
  });

  it('blocks non-ai types', () => {
    expect(
      isNotificationReplyable({
        type: 'achievement',
        mentorId: 'almog',
        body: 'מה חדש?',
      })
    ).toBe(false);
  });
});
