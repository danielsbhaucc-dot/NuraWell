/**
 * Server-held core ("protected" mode, default for sold modules): the module's essential logic runs only in our
 * shared Worker. The buyer gets a thin client with no core logic. Every call is signed with a per-install secret.
 */
export type InstallState = 'active' | 'suspended_until' | 'suspended_until_payment' | 'revoked_permanent';
export type ReasonCode = 'unpaid' | 'terms' | 'buyer_request' | 'key_leak' | 'other';
export type InstallRecord = {
  iid: string; lid: string; moduleId: string; domains: string[];
  /** sha256(secret), hex. The secret itself is never stored; it is shown once at issue/rotation. */
  keyHash: string; keyVersion: number;
  state: InstallState; until?: string; reason?: ReasonCode; updatedAt: string;
};
/** Edge store (Cloudflare KV in production; memory in dev/tests). */
export interface GatewayStore {
  get(iid: string): Promise<InstallRecord | null>;
  put(r: InstallRecord): Promise<void>;
  /** true if nonce is new (and remembers it for ttlSec). */
  claimNonce(iid: string, nonce: string, ttlSec: number): Promise<boolean>;
  /** increments and returns the count for this window. */
  hit(key: string, windowSec: number): Promise<number>;
}
/** Hebrew-facing refusal codes (stable; the thin client maps them to messages). */
export type RefusalCode = 'blocked_payment' | 'blocked_temporary' | 'blocked_permanent' | 'bad_key' | 'wrong_domain' | 'replay' | 'stale' | 'rate_limited' | 'unknown_install' | 'unknown_core' | 'core_failed' | 'bad_request';
export const REFUSAL_HE: Record<RefusalCode, string> = {
  blocked_payment: 'הרכיב מושהה עד להסדרת התשלום. פנו למי שמכר לכם את הרישיון.',
  blocked_temporary: 'הרכיב מושהה זמנית ויחזור לעבוד בתאריך שנקבע.',
  blocked_permanent: 'הרישיון לרכיב הזה בוטל.',
  bad_key: 'מפתח הגישה של ההתקנה לא תקין או הוחלף. בקשו מפתח חדש.',
  wrong_domain: 'הרכיב פועל רק באתר שעבורו נמכר.',
  replay: 'הבקשה נדחתה (נשלחה פעמיים). נסו שוב.',
  stale: 'השעון בשרת שלכם לא מסונכרן. בדקו את הגדרת השעה ונסו שוב.',
  rate_limited: 'יותר מדי בקשות. נסו שוב בעוד רגע.',
  unknown_install: 'ההתקנה הזאת לא מוכרת. פנו למי שמכר לכם את הרישיון.',
  unknown_core: 'הפעולה הזאת לא קיימת ברכיב.',
  core_failed: 'משהו השתבש אצלנו. נסו שוב בעוד רגע.',
  bad_request: 'הבקשה לא תקינה.',
};
