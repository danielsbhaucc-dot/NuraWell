# @platform/hooks: נקודות חיבור למודולים

כמו ב-WordPress: מודול מוסיף "פעולה" (action) שרצה כשקורה משהו, או "מסנן" (filter) שמשנה ערך. המוצר יוצר רשם אחד, וכל מודול נרשם אליו בשם בצורה `<מודול>.<אירוע>`.

## שימוש
```ts
import { createHooks } from '@platform/hooks';
const hooks = createHooks();
hooks.addAction('auth.after-signup', async ({ userId }) => sendWelcome(userId), 'notifications');
hooks.addFilter('agent.persona', (p) => ({ ...p, tone: 'חם' }), 'my-product', 5);
await hooks.doAction('auth.after-signup', { userId });
const persona = await hooks.applyFilters('agent.persona', basePersona);
```

## בטיחות
- מסנן שנכשל מדולג והערך נשמר.
- שגיאות של פעולות מוחזרות ולא נזרקות.
- כיבוי מודול במוצר: `hooks.removeOwner('<מזהה מודול>')`.
