/** ברכה לפי שעה מקומית של הדפדפן / שרת (שעות 0–23). */
export function hebrewDayPartGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'בוקר טוב';
  if (hour >= 12 && hour < 17) return 'צהריים טובים';
  if (hour >= 17 && hour < 22) return 'ערב טוב';
  return 'לילה טוב';
}

export function buildDemoWelcomeHeadline(guestName: string | null | undefined, hour = new Date().getHours()): string {
  const greeting = hebrewDayPartGreeting(hour);
  const name = guestName?.trim();
  if (name) return `${greeting}, ${name}`;
  return greeting;
}
