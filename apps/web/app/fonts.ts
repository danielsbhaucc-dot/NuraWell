import { Assistant, Cormorant_Garamond, DM_Sans, Heebo, Rubik } from 'next/font/google';

/**
 * משקלים בשימוש פעיל — אין משקל מת להסרה בטוחה (ביקורת Safe Perf):
 * Heebo/Rubik 400–900: font-normal/semibold/bold/extrabold/black ברחבי הדשבורד.
 * Cormorant 300/600: לוגו + ComingSoon. DM Sans 300: לוגו (.ai / tagline).
 * לא מסירים משפחות — כולן בשימוש.
 */
export const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  weight: ['400', '600', '700', '800', '900'],
  variable: '--font-heebo',
  display: 'swap',
});

export const rubik = Rubik({
  subsets: ['hebrew', 'latin'],
  weight: ['400', '600', '700', '800', '900'],
  variable: '--font-rubik',
  display: 'swap',
});

export const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '600'],
  variable: '--font-cormorant',
  display: 'swap',
});

export const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300'],
  variable: '--font-dm-sans',
  display: 'swap',
});

/** Assistant — גוף טקסט בעמודים הציבוריים/משפטיים (מערכת C3). */
export const assistant = Assistant({
  subsets: ['hebrew', 'latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-assistant',
  display: 'swap',
});

export const fontVariables = `${assistant.variable} ${heebo.variable} ${rubik.variable} ${cormorant.variable} ${dmSans.variable}`;
