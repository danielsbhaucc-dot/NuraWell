'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button, Card } from '@/components/ui';

/** A task offered by a lesson/guide — the user chooses to take it or not. */
export function OfferCard({ definitionId, title, emoji, description }: { definitionId: string; title: string; emoji: string | null; description: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const respond = (accept: boolean) =>
    start(async () => {
      await fetch('/api/v1/tasks/offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ definitionId, accept }),
      });
      router.refresh();
    });
  return (
    <Card className="flex flex-col gap-2 border-dashed">
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden>
          {emoji ?? '🌿'}
        </span>
        <div className="min-w-0 flex-1">
          <span className="text-xs font-bold text-accent-700">הצעה מאלמוג</span>
          <h3 className="text-base font-bold text-primary-900">{title}</h3>
          {description ? <p className="text-sm text-primary-800/80">{description}</p> : null}
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" loading={pending} onClick={() => respond(true)}>
          לקחת את המשימה
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => respond(false)}>
          לא עכשיו
        </Button>
      </div>
    </Card>
  );
}
