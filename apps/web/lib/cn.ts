import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with clsx support
 * Use this for all className merging in the app
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
