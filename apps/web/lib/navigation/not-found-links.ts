import { APP_HOME_PATH, PUBLIC_HOME_PATH } from './app-home-path';

export type NotFoundLink = {
  href: string;
  label: string;
};

function abs(origin: string | null | undefined, path: string): string {
  if (!origin) return path;
  const base = origin.replace(/\/$/, '');
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** כפתור ראשי + קישורי משנה לדף 404 — אורחים מול מחוברים.
 * When `absoluteOrigin` is set (Ops stealth / CF mirror), every href is absolute
 * to that origin so navigation never stays on a stealth host.
 */
export function getNotFoundLinks(
  isAuthenticated: boolean,
  absoluteOrigin?: string | null,
): {
  primary: NotFoundLink;
  secondary: NotFoundLink[];
} {
  const o = absoluteOrigin?.trim() || null;
  if (isAuthenticated) {
    return {
      primary: { href: abs(o, APP_HOME_PATH), label: 'חזרה לבית' },
      secondary: [
        { href: abs(o, '/journey'), label: 'המסע שלי' },
        { href: abs(o, '/guides'), label: 'מדריכים' },
      ],
    };
  }

  return {
    primary: { href: abs(o, PUBLIC_HOME_PATH), label: 'לעמוד הבית' },
    secondary: [
      { href: abs(o, '/login'), label: 'כניסה' },
      { href: abs(o, '/about'), label: 'אודות' },
      { href: abs(o, '/contact'), label: 'צור קשר' },
    ],
  };
}
