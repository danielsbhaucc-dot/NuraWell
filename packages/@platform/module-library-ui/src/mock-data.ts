// Fake data for the v1 mock. Replace with the registry API (modules/INDEX + product_modules) in a later phase.
export type Tier = 'internal' | 'shareable' | 'sellable';
export type Category = 'security' | 'privacy' | 'platform' | 'feature' | 'ui' | 'ops';
export interface LibModule { id: string; name: string; version: string; tier: Tier; category: Category; alwaysOn: boolean; description: string; deps: string[]; origin: string }
export interface Product { id: string; name: string; color: string; enabled: string[] }

export const MODULES: LibModule[] = [
  { id: 'security-crypto', name: 'הצפנת שדות', version: '0.1.0', tier: 'shareable', category: 'security', alwaysOn: true, description: 'הצפנת מעטפת לכל משתמש (enc:v2), AES-256-GCM ואינדקס עיוור.', deps: [], origin: 'NuraWell' },
  { id: 'iam', name: 'הרשאות ותפקידים', version: '0.3.0', tier: 'shareable', category: 'security', alwaysOn: true, description: 'תפקידים, הרשאות, step-up ומכשירים מהימנים.', deps: ['audit-log'], origin: 'NuraWell' },
  { id: 'audit-log', name: 'יומן ביקורת', version: '0.2.1', tier: 'shareable', category: 'security', alwaysOn: true, description: 'רישום פעולות רגישות בלי PII.', deps: [], origin: 'NuraWell' },
  { id: 'consent', name: 'הסכמות', version: '0.2.0', tier: 'shareable', category: 'privacy', alwaysOn: true, description: 'הסכמה לנתוני בריאות ולגישה לתמלולים, עם היסטוריה.', deps: ['audit-log'], origin: 'NuraWell' },
  { id: 'a11y-widget', name: 'ווידג׳ט נגישות', version: '1.4.0', tier: 'sellable', category: 'ui', alwaysOn: false, description: 'תפריט נגישות מלא. ערכת נושא ניתנת להגדרה, ההתנהגות לא משתנה.', deps: [], origin: 'NuraWell' },
  { id: 'almog-chat', name: 'צ׳אט אלמוג', version: '2.8.0', tier: 'internal', category: 'feature', alwaysOn: false, description: 'מאמן ה-AI של NuraWell, כולל זיכרון ומשימות.', deps: ['consent', 'iam'], origin: 'NuraWell' },
  { id: 'journey', name: 'מסע ותחנות', version: '1.1.0', tier: 'internal', category: 'feature', alwaysOn: false, description: 'מסע בשלבים עם תחנות, שיעורים והתקדמות.', deps: ['media-library'], origin: 'NuraWell' },
  { id: 'media-library', name: 'ספריית מדיה', version: '1.0.2', tier: 'shareable', category: 'ui', alwaysOn: false, description: 'מנהל קבצים בסגנון Finder עם תיקיות חכמות.', deps: [], origin: 'NuraWell' },
  { id: 'notifications', name: 'התראות', version: '0.9.0', tier: 'shareable', category: 'platform', alwaysOn: false, description: 'Push, אימייל ותזכורות, עם שעות שקטות.', deps: [], origin: 'NuraWell' },
  { id: 'habit-streaks', name: 'רצפי הרגלים', version: '0.1.0', tier: 'sellable', category: 'feature', alwaysOn: false, description: 'מעקב רצפים יומי. נולד במוצר אחר ונוסף לספרייה.', deps: ['notifications'], origin: 'FitFlow' },
  { id: 'costs', name: 'עלויות AI', version: '0.4.0', tier: 'internal', category: 'ops', alwaysOn: false, description: 'דשבורד עלויות לפי מודל ומשתמש.', deps: [], origin: 'NuraWell' },
  { id: 'legal-hub', name: 'מרכז משפטי', version: '0.5.0', tier: 'shareable', category: 'privacy', alwaysOn: true, description: 'מסמכים משפטיים, גרסאות וחתימות.', deps: ['audit-log'], origin: 'NuraWell' },
];

export const PRODUCTS: Product[] = [
  { id: 'nurawell', name: 'NuraWell', color: '#2f9e6b', enabled: ['almog-chat', 'journey', 'media-library', 'notifications', 'a11y-widget', 'costs'] },
  { id: 'fitflow', name: 'FitFlow', color: '#2a74c9', enabled: ['habit-streaks', 'notifications', 'a11y-widget'] },
  { id: 'mindspace', name: 'MindSpace', color: '#7a52c7', enabled: ['media-library'] },
  { id: 'sample', name: 'Sample Product', color: '#c2496f', enabled: [] },
];
