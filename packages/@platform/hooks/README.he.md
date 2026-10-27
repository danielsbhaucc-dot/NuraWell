# @platform/hooks: נקודות חיבור למודולים

## מה זה עושה
כמו ב-WordPress: מודול מוסיף "פעולה" (`action`) שרצה כשקורה משהו, או "מסנן" (`filter`) שמשנה ערך. המוצר יוצר רשם אחד, וכל מודול נרשם אליו בשם בצורה `<מודול>.<אירוע>`.

## התקנה
```ts
import { createHooks } from '@platform/hooks';
const hooks = createHooks();
hooks.addAction('auth.after-signup', async ({ userId }) => sendWelcome(userId), 'notifications');
hooks.addFilter('agent.persona', (p) => ({ ...p, tone: 'חם' }), 'my-product', 5);
await hooks.doAction('auth.after-signup', { userId });
const persona = await hooks.applyFilters('agent.persona', basePersona);
```

## הגדרות
- עדיפות: מספר נמוך רץ קודם (ברירת מחדל 10). בשוויון, לפי סדר הרישום.
- `onError`: פונקציה שמקבלת כל שגיאה (לרישום ביומן).

## אבטחה ופרטיות
אין מידע ואין קוד שרת. מסנן שנכשל מדולג והערך נשמר; שגיאות של פעולות מוחזרות ולא נזרקות.

## מגבלות ידועות
- הרשם נשמר בזיכרון של כל תהליך.
- כיבוי מודול במוצר: `hooks.removeOwner('<מזהה מודול>')`.
