import type { ReactNode } from 'react';
import { palette, surfaces, tokensCss } from '@platform/ui';

export const metadata = { title: 'מוצר לדוגמה', robots: { index: false, follow: false } };

const base = `${tokensCss()}
body{margin:0;background:${surfaces.gcCanvas};color:${palette.ink};font-family:system-ui,'Heebo',sans-serif}
.card{background:${surfaces.gc};border:1px solid ${surfaces.creamDeep};border-radius:24px;padding:24px;box-shadow:0 8px 30px rgba(26,23,48,.06)}
.btn{background:${palette.primary[700]};color:${palette.primary[50]};border:0;border-radius:14px;padding:10px 18px;font-weight:700;cursor:pointer}
input{background:${palette.backgroundCard};border:1px solid ${surfaces.creamDeep};border-radius:14px;padding:10px 12px;font:inherit;color:${palette.ink};width:100%;box-sizing:border-box}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <style dangerouslySetInnerHTML={{ __html: base }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
