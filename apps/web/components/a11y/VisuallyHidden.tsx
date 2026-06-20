import type { ReactNode } from 'react';

type VisuallyHiddenProps = {
  children: ReactNode;
  as?: 'span' | 'div' | 'p' | 'h1' | 'h2' | 'h3';
};

export function VisuallyHidden({ children, as: Tag = 'span' }: VisuallyHiddenProps) {
  return <Tag className="sr-only">{children}</Tag>;
}
