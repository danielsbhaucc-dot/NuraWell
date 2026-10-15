import { PasskeyCeremony } from '@/components/gideon/PasskeyCeremony';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'גדעון · אימות', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };

export default function Page() {
  return <PasskeyCeremony mode="register" />;
}
