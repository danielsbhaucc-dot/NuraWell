import type { ReactNode } from 'react';
import { Card } from './Card';

export function EmptyState({ icon = '🌱', title, description, action }: { icon?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-2 py-10 text-center">
      <span className="text-4xl" aria-hidden>
        {icon}
      </span>
      <p className="text-lg font-bold text-primary-900">{title}</p>
      {description ? <p className="max-w-sm text-sm text-primary-800/80">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </Card>
  );
}
