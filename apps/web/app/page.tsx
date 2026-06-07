import { LandingPageClient } from '@/components/landing/LandingPageClient';
import { PublicAiPresence } from '@/components/ai/PublicAiPresence';

export default function LandingPage() {
  return (
    <>
      <LandingPageClient />
      <div className="fixed inset-x-0 bottom-5 z-30 px-4 pointer-events-none">
        <div className="pointer-events-auto">
          <PublicAiPresence compact />
        </div>
      </div>
    </>
  );
}
