import { cn } from './cn';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-2xl bg-primary-100/70 motion-reduce:animate-none', className)} />;
}

export function PageSkeleton() {
  return (
    <div role="status" aria-label="טוען" className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
