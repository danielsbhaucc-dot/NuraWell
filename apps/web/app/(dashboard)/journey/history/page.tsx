import { redirect } from 'next/navigation';

/** One history page: /progress/history. */
export default function JourneyHistoryRedirect() {
  redirect('/progress/history');
}
