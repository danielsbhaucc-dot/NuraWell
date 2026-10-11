import { permanentRedirect } from 'next/navigation';

/** One landing page: "/" (live, linked, canonical). The AI-first variant is retired. */
export default function LandingV2Redirect() {
  permanentRedirect('/');
}
