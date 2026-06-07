import { describe, expect, it } from 'vitest';
import {
  isNotificationReplyable,
  notificationBodyHasQuestion,
} from '../lib/notifications/replyable';
import { formatNotificationReplyContextBlock } from '../lib/notifications/notification-chat-context';

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

describe('formatNotificationReplyContextBlock', () => {
  it('guards against interpreting a short greeting as restart consent', () => {
    const block = formatNotificationReplyContextBlock({
      title: 'אלמוג',
      body: 'בוא נעשה שבוע חדש נקי. מה אומר?',
      source: 'almog_habit_checkpoint',
      createdAt: '2026-06-07T10:00:00Z',
    });

    expect(block).toContain('אל תסיק מזה שהוא הסכים להתחיל מחדש');
    expect(block).toContain('לכתוב "מתחילים מחדש"');
  });
});
