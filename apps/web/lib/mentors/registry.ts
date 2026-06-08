export const MENTOR_IDS = ['almog', 'dolev'] as const;
export type MentorId = (typeof MENTOR_IDS)[number];

export type MentorDefinition = {
  id: MentorId;
  name: string;
  title: string;
  description: string;
  /** R2 object key segment */
  objectKey: string;
  fallbackInitial: string;
};

export const MENTORS: Record<MentorId, MentorDefinition> = {
  almog: {
    id: 'almog',
    name: 'אלמוג',
    title: 'מנטור AI במסע',
    description: 'מלווה במדריכים, משימות והרגלים בתוך האפליקציה.',
    objectKey: 'almog/avatar.webp',
    fallbackInitial: 'א',
  },
  dolev: {
    id: 'dolev',
    name: 'דולב',
    title: 'מנטור קליטה',
    description: 'מקבל אתכם בהרשמה ומכיר אתכם לפני שמתחילים.',
    objectKey: 'dolev/avatar.webp',
    fallbackInitial: 'ד',
  },
};

export function isMentorId(value: string): value is MentorId {
  return (MENTOR_IDS as readonly string[]).includes(value);
}

export function mentorLegacyKeys(mentorId: MentorId): readonly string[] {
  const base = mentorId;
  return [`${base}/avatar`, `${base}/avatar.png`, `${base}/avatar.jpg`, `${base}/avatar.jpeg`] as const;
}
