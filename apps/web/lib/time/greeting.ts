export function getTimeGreeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour === 5) return 'חמש לפנות בוקר,';
  if (hour >= 6 && hour < 12) return 'בוקר טוב,';
  if (hour >= 12 && hour < 17) return 'צהריים טובים,';
  if (hour >= 17 && hour < 21) return 'ערב טוב,';
  return 'לילה טוב,';
}
