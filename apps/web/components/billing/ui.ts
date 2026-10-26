export const ils = (agorot: number) =>
  `${(agorot / 100).toLocaleString('he-IL', { minimumFractionDigits: agorot % 100 ? 2 : 0, maximumFractionDigits: 2 })} ₪`;
export const shell = 'min-h-[100dvh] bg-gradient-to-b from-slate-950 via-indigo-950 to-slate-900 text-slate-100 px-4 py-8 sm:py-12';
export const card = 'rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-xl p-5 shadow-[0_20px_60px_-20px_rgba(79,70,229,0.45)]';
export const STATUS_HE: Record<string, string> = { trialing: 'בתקופת ניסיון', active: 'פעיל', past_due: 'ממתין לתשלום', canceled: 'בוטל, פעיל עד סוף התקופה', ended: 'הסתיים' };
