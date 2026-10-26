// Glue only: the module library UI lives in @platform/module-library-ui (module-first).
import type { Metadata } from 'next';
import { FinderDashboard } from '@platform/module-library-ui';
import '@platform/module-library-ui/src/finder.css';

export const metadata: Metadata = { title: 'ספריית מודולים' };

export default function OpsModulesPage() {
  return <FinderDashboard />;
}
