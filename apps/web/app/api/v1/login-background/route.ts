import { resolveSiteBackgroundResponse } from '@/lib/storage/resolve-site-background';
import { LOGIN_BACKGROUND_OBJECT_KEY } from '@/lib/storage/login-background';

export const runtime = 'nodejs';

export async function GET() {
  return resolveSiteBackgroundResponse({
    keyColumn: 'login_background_key',
    creditColumn: 'login_background_credit',
    defaultObjectKey: LOGIN_BACKGROUND_OBJECT_KEY,
  });
}
