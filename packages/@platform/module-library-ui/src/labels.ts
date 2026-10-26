import type { Category, Tier } from './types';
export const TIER_LABEL: Record<Tier, string> = { internal: 'פנימי', shareable: 'לשיתוף', sellable: 'למכירה' };
export const TIER_MEANING: Record<Tier, string> = {
  internal: 'נשאר רק בתוך המוצרים שלנו. לא יוצא החוצה.',
  shareable: 'אפשר לתת אותו כמו שהוא (קוד מלא), בלי רישיון ובלי סודות.',
  sellable: 'נמכר עם רישיון חתום: חבילה מכווצת לתקופה, או קוד מלא.',
};
export const CAT_LABEL: Record<Category, string> = { security: 'אבטחה', privacy: 'פרטיות', platform: 'פלטפורמה', feature: 'פיצ׳ר', ui: 'ממשק', ops: 'תפעול' };
// Finder-tag style category colors; all keep >= 4.5:1 with the light glyph (WCAG AA).
export const CAT_TINT: Record<Category, string> = { security: '#3f5b9a', privacy: '#7b4fa8', platform: '#1f7896', feature: '#b9532c', ui: '#b03f78', ops: '#86661c' };
export const STATE_LABEL = { active: 'פעיל', suspended_until: 'מושעה עד תאריך', suspended_until_payment: 'מושעה עד תשלום', revoked_permanent: 'בוטל לצמיתות' } as const;
export const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' }) : 'ללא תפוגה');
export const fmtNum = (n: number | null) => (n === null ? null : n.toLocaleString('he-IL'));
export const fmtUsd = (n: number | null) => (n === null ? null : `$${n.toFixed(2)}`);
