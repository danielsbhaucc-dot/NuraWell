import { redirect } from 'next/navigation';

/** Merged into the single admin journey hub at /ops/journey (stations + steps). */
export default function OpsJourneyHubRedirect() {
  redirect('journey');
}
