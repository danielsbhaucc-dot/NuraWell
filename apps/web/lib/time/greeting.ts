/**
 * greeting.ts — ברכת שעה (בלי hebcal).
 * ברכה מלאה: `import { getPersonalGreeting } from './greeting-hebrew'`
 * או בצד לקוח: `usePersonalGreeting`.
 */

export {
  getIsraelTimeOfDay,
  getTimeGreeting,
  getTimeOnlyPersonalGreeting,
  type IsraelTimeOfDay,
  type IsraelTimeOfDayBucket,
  type PersonalGreeting,
} from './greeting-time';
