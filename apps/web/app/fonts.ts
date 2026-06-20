import { Cormorant_Garamond, DM_Sans, Heebo, Rubik } from 'next/font/google';

export const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-heebo',
  display: 'swap',
});

export const rubik = Rubik({
  subsets: ['hebrew', 'latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
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

export const fontVariables = `${heebo.variable} ${rubik.variable} ${cormorant.variable} ${dmSans.variable}`;
