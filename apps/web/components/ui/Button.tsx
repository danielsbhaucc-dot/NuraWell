import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger' | 'dark';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  // Canonical CTA (JourneyNextStepCard / LadderActions): emerald→teal gradient, pearl text, lifted shadow.
  primary: 'bg-linear-to-br from-primary-700 to-primary-500 text-on-dark shadow-btn hover:brightness-105 focus-visible:ring-primary-400',
  // Glass secondary — replaces every white/cream "outline" button.
  secondary: 'bg-surface/85 backdrop-blur-md text-primary-800 ring-1 ring-hairline shadow-float hover:bg-surface-elevated focus-visible:ring-primary-300',
  // Tinted pill used inside cards (ladder actions).
  soft: 'bg-primary-500/10 text-primary-800 ring-1 ring-primary-500/20 hover:bg-primary-500/15 focus-visible:ring-primary-300',
  ghost: 'bg-transparent text-primary-800 hover:bg-primary-500/10 focus-visible:ring-primary-300',
  danger: 'bg-linear-to-br from-energy-700 to-energy-500 text-on-dark shadow-btn hover:brightness-105 focus-visible:ring-energy-400',
  // Deep forest — admin chrome, auth, hero bands.
  dark: 'bg-linear-to-br from-forest-800 to-forest-600 text-on-dark shadow-btn ring-1 ring-glow/20 hover:ring-glow/40 focus-visible:ring-glow',
};
const sizes: Record<Size, string> = {
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-11 px-4 text-base',
  lg: 'min-h-12 px-6 text-lg',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, className, disabled, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-2xl font-bold transition-[transform,filter,background-color,box-shadow] duration-200 ease-(--ease-spring) active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100',
        'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        sizes[size],
        className
      )}
      {...rest}
    >
      {loading ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : null}
      {children}
    </button>
  );
});
