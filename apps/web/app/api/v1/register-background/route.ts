import { resolveSiteBackgroundResponse } from '@/lib/storage/resolve-site-background';
import { REGISTER_BACKGROUND_OBJECT_KEY } from '@/lib/storage/register-background';

export const runtime = 'nodejs';

export async function GET() {
  return resolveSiteBackgroundResponse({
    keyColumn: 'register_background_key',
    creditColumn: 'register_background_credit',
    defaultObjectKey: REGISTER_BACKGROUND_OBJECT_KEY,
  });
}
