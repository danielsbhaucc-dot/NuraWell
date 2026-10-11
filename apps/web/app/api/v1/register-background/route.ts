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

// Cap function time so a hung upstream call cannot burn active CPU for the 300s default.
export const maxDuration = 30;
