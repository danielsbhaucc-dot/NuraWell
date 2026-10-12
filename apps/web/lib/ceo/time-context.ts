/** Cheap Israel time/calendar context for every CEO turn (no API calls). */
const HOLIDAYS: [string, number, number, string][] = [
  // [hebrew month name (he-u-ca-hebrew), from day, to day, name]
  ['תשרי', 1, 2, 'ראש השנה'], ['תשרי', 10, 10, 'יום כיפור'], ['תשרי', 15, 21, 'סוכות'], ['תשרי', 22, 22, 'שמחת תורה'],
  ['כסלו', 25, 30, 'חנוכה'], ['טבת', 1, 2, 'חנוכה'], ['שבט', 15, 15, 'ט״ו בשבט'], ['אדר', 14, 15, 'פורים'], ['אדר ב׳', 14, 15, 'פורים'],
  ['ניסן', 15, 21, 'פסח'], ['אייר', 5, 5, 'יום העצמאות (בערך)'], ['סיון', 6, 6, 'שבועות'], ['אב', 9, 9, 'תשעה באב'],
];

export function israelTimeContext(now = new Date()): string {
  const tz = 'Asia/Jerusalem';
  const part = (o: Intl.DateTimeFormatOptions, loc = 'he-IL') => new Intl.DateTimeFormat(loc, { timeZone: tz, ...o }).format(now);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(now));
  const dow = new Date(now.toLocaleString('en-US', { timeZone: tz })).getDay(); // 0=Sun
  const dayPart = hour < 5 ? 'לילה' : hour < 12 ? 'בוקר' : hour < 16 ? 'צהריים' : hour < 18 ? 'אחר הצהריים' : hour < 22 ? 'ערב' : 'לילה';
  const shabbat = (dow === 5 && hour >= 17) || (dow === 6 && hour < 19) ? 'עכשיו שבת (בערך)' : dow === 5 ? 'ערב שבת' : dow === 6 ? 'מוצאי שבת' : '';
  const hebDay = Number(part({ day: 'numeric' }, 'en-u-ca-hebrew'));
  const hebMonth = part({ month: 'long' }, 'he-u-ca-hebrew');
  const hebDate = part({ day: 'numeric', month: 'long', year: 'numeric' }, 'he-u-ca-hebrew');
  const holiday = HOLIDAYS.find(([m, a, b]) => hebMonth === m && hebDay >= a && hebDay <= b)?.[3];
  return [
    `עכשיו בישראל: ${part({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, השעה ${part({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })} (${dayPart}).`,
    `תאריך עברי: ${hebDate}.${holiday ? ` חג/מועד: ${holiday}.` : ''}${shabbat ? ` ${shabbat}.` : ''}`,
  ].join('\n');
}
