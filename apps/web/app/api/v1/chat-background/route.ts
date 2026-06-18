import { resolveSiteBackgroundResponse } from '@/lib/storage/resolve-site-background';
import { CHAT_BACKGROUND_OBJECT_KEY } from '@/lib/storage/chat-background';

export const runtime = 'nodejs';

export async function GET() {
  return resolveSiteBackgroundResponse({
    keyColumn: 'chat_background_key',
    creditColumn: 'chat_background_credit',
    defaultObjectKey: CHAT_BACKGROUND_OBJECT_KEY,
  });
}
