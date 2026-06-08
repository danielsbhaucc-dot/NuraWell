import { GuidesManager } from '@/components/admin/GuidesManager';

export const metadata = {
  title: 'מדריכים — ניהול',
};

export default function OpsGuidesPage() {
  const opsHref = (path: string) => `/ops${path}`;
  return <GuidesManager opsHref={opsHref} />;
}
