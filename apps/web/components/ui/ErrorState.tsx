'use client';
import { Button } from './Button';
import { Card } from './Card';

export function ErrorState({ title = 'משהו השתבש', description = 'נסו שוב בעוד רגע.', onRetry }: { title?: string; description?: string; onRetry?: () => void }) {
  return (
    <Card role="alert" className="mx-auto my-8 flex max-w-md flex-col items-center gap-3 py-8 text-center">
      <span className="text-4xl" aria-hidden>
        🌧️
      </span>
      <p className="text-lg font-bold text-primary-900">{title}</p>
      <p className="text-sm text-primary-800/80">{description}</p>
      {onRetry ? <Button onClick={onRetry}>לנסות שוב</Button> : null}
    </Card>
  );
}
