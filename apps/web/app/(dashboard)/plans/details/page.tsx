import { redirect } from 'next/navigation';

/** Merged into /plans (everything Almog manages now lives there). Kept as a redirect for old links. */
export default function PlansDetailsRedirect() {
  redirect('/plans');
}
