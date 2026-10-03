import { APP_HOME_PATH, PUBLIC_HOME_PATH } from './app-home-path';

export type NotFoundLink = {
  href: string;
  label: string;
};

/** כפתור ראשי + קישורי משנה לדף 404 — אורחים מול מחוברים */
export function getNotFoundLinks(isAuthenticated: boolean): {
  primary: NotFoundLink;
  secondary: NotFoundLink[];
} {
  if (isAuthenticated) {
    return {
      primary: { href: APP_HOME_PATH, label: 'חזרה לבית' },
      secondary: [
        { href: '/journey', label: 'המסע שלי' },
        { href: '/guides', label: 'מדריכים' },
      ],
    };
  }

  return {
    primary: { href: PUBLIC_HOME_PATH, label: 'לעמוד הבית' },
    secondary: [
      { href: '/login', label: 'כניסה' },
      { href: '/about', label: 'אודות' },
      { href: '/contact', label: 'צור קשר' },
    ],
  };
}
